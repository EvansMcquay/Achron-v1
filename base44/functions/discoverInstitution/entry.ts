import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// AI-based institution discovery. When a student searches for a school that is
// not in the curated (verified) Institution database, this function uses
// InvokeLLM with web-search context to discover the institution and its
// programs.
//
// CRITICAL: Discovered data is NEVER made authoritative. It is written to the
// Institution / Catalog / Program entities with verification_status="pending"
// (and active=false), so it is stored for ADMIN REVIEW but is NOT selectable by
// students. Only an admin can promote pending records to verified/active.
//
// Dedupes against existing records by official name (case-insensitive) so the
// same school is not discovered twice.

const DISCOVERY_SCHEMA = {
  type: "object",
  properties: {
    institution_name: { type: "string", description: "Official institution name" },
    website: { type: "string", description: "Official website URL if found" },
    city: { type: "string" },
    state: { type: "string" },
    source_url: { type: "string", description: "URL where the institution info was found" },
    programs: {
      type: "array",
      description: "Degree programs offered by this institution, with their official names",
      items: {
        type: "object",
        properties: {
          degree_type: { type: "string", description: "Associate, Bachelor, Master, Doctorate, Certificate, or Diploma" },
          program_name: { type: "string", description: "Official program name as published" },
          credits_required: { type: "number" },
          source_url: { type: "string", description: "URL where this program was found" }
        }
      }
    }
  }
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { query } = body || {};
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return Response.json({ error: "A search query of at least 2 characters is required" }, { status: 400 });
    }

    const cleanQuery = query.trim();

    // Dedup: check existing institutions (verified OR pending) by name.
    const existing = await base44.asServiceRole.entities.Institution.filter({
      name: { $regex: cleanQuery, $options: "i" }
    });
    const exactMatch = existing.find(
      (i) => i.name.toLowerCase() === cleanQuery.toLowerCase()
    );
    if (exactMatch) {
      return Response.json({
        status: "exists",
        message: exactMatch.verification_status === "verified"
          ? "This institution is already available."
          : "This institution was already submitted and is awaiting admin review.",
        institution_id: exactMatch.id
      });
    }

    const prompt = `Search the web for the academic institution matching "${cleanQuery}". Identify the official institution and list its degree programs with their official names. Return the official institution name, website, city, state, the source URL you found this at, and an array of programs (each with degree_type, official program_name, credits_required if known, and the source_url for that program). Only include programs you can verify from a real source. If you cannot confidently identify the institution, return empty strings and an empty programs array.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: "gemini_3_flash",
      response_json_schema: DISCOVERY_SCHEMA
    });

    const data = (result && typeof result === "object") ? result : {};
    if (!data.institution_name || !data.institution_name.trim()) {
      return Response.json({
        status: "not_found",
        message: "We could not confidently identify that institution. An admin can add it manually."
      });
    }

    // Dedup against the DISCOVERED official name (not just the query): if this
    // institution already exists (verified or pending), do not create a duplicate.
    const discoveredName = data.institution_name.trim().toLowerCase();
    const existingByName = existing.find(
      (i) => i.name.toLowerCase() === discoveredName
    );
    if (existingByName) {
      return Response.json({
        status: "exists",
        message: existingByName.verification_status === "verified"
          ? "This institution is already available."
          : "This institution was already submitted and is awaiting admin review.",
        institution_id: existingByName.id
      });
    }

    // Create PENDING institution record (not active, not verified).
    const institution = await base44.asServiceRole.entities.Institution.create({
      name: data.institution_name.trim(),
      short_name: "",
      website: data.website || "",
      city: data.city || "",
      state: data.state || "",
      source_url: data.source_url || data.website || "",
      verification_status: "pending",
      active: false
    });

    // Create a PENDING catalog for the current academic year.
    const currentYear = "2026-2027";
    const catalog = await base44.asServiceRole.entities.Catalog.create({
      institution_id: institution.id,
      catalog_year: currentYear,
      source_url: data.source_url || data.website || "",
      verification_status: "pending",
      active: false
    });

    // Create PENDING programs.
    const programs = Array.isArray(data.programs) ? data.programs : [];
    const createdPrograms = programs.length
      ? await base44.asServiceRole.entities.Program.bulkCreate(
          programs.map((p) => ({
            institution_id: institution.id,
            catalog_id: catalog.id,
            degree_type: p.degree_type || "",
            program_name: p.program_name || "",
            normalized_category: "",
            credits_required: p.credits_required || 0,
            source_url: p.source_url || data.source_url || "",
            verification_status: "pending",
            active: false
          }))
        )
      : [];

    return Response.json({
      status: "submitted",
      message: `Found "${institution.name}". It has been submitted for admin review${createdPrograms.length ? ` with ${createdPrograms.length} program(s)` : ""}. You will be able to select it once an admin verifies it.`,
      institution_id: institution.id,
      programs_count: createdPrograms.length
    });
  } catch (error) {
    return Response.json({ error: error.message || "Discovery failed" }, { status: 500 });
  }
}