import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { fetchPage, stripNoise } from '../../shared/web-discovery.ts';

// Lazy, program-specific degree-requirement discovery. Triggered when a student
// selects a verified program and no cached requirement structure exists yet.
// Reads the official program/catalog page, extracts requirement groups +
// requirements (preserving the school's exact wording), persists RequirementGroup
// + Requirement records (deduped), and sets Program.requirements_status.
//
// Architecture rule: this ONLY populates the existing Requirement /
// RequirementGroup entities. It NEVER touches the degree engine — the engine
// remains the single source of truth for requirement calculations.
//
// Requirement semantics are mapped to the engine's existing requirement_type
// values (required_course | choose_x_of_y | min_credits | elective_credits |
// concentration). Official wording + semantic type are preserved in
// official_requirement_name / normalized_type. Level-based credit requirements
// (e.g. "12 credits of 300/400-level coursework") use min_credits with empty
// course_codes + level_min/level_max; the engine filters by course_level.
// Business electives: course_codes are ONLY the officially-listed eligible
// courses — never every BUS/ACCT/FIN course.

const HTML_CAP = 60000;

const REQUIREMENTS_SCHEMA = {
  type: "object",
  properties: {
    completeness: {
      type: "string",
      enum: ["complete", "partial", "none"],
      description: "Whether the page contained a complete degree-requirement structure.",
    },
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Official group heading exactly as printed, e.g. 'Major Requirements', 'Business Electives', 'Advanced Courses', '300\u2013400 Level Business Electives'" },
          group_type: { type: "string", enum: ["core", "general_education", "elective", "capstone", "concentration", "minor", "other"] },
          credits_required: { type: "number" },
          normalized_type: { type: "string", description: "business_elective | advanced_course | upper_level | major_elective | free_elective | general_education | major_requirement | other" },
          requirements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                official_name: { type: "string", description: "Exact requirement wording as printed" },
                engine_type: { type: "string", enum: ["required_course", "choose_x_of_y", "min_credits", "elective_credits", "concentration"], description: "required_course = one specific course (put code in course_codes); choose_x_of_y = complete N of listed courses (choose_count + course_codes); min_credits = earn X credits from listed courses, OR X credits at a level if level_min/level_max set and course_codes empty; elective_credits = earn X credits from any course; concentration = complete the listed course set" },
                course_codes: { type: "array", items: { type: "string" }, description: "Eligible/required course codes EXACTLY as listed on the page. Empty for level-based or any-course credit requirements. Never infer courses." },
                choose_count: { type: "number" },
                min_credits: { type: "number" },
                level_min: { type: "number", description: "For level-based credit requirements: minimum course level e.g. 300" },
                level_max: { type: "number", description: "For level-based credit requirements: maximum course level e.g. 400" },
                normalized_type: { type: "string", description: "business_elective | advanced_course | upper_level | major_elective | free_elective | general_education | major_requirement | required_course | concentration | other" },
                subject_area: { type: "string" },
                min_grade: { type: "string" },
                prerequisite_codes: { type: "array", items: { type: "string" } },
                description: { type: "string" },
              },
              required: ["engine_type"],
            },
          },
        },
        required: ["name", "group_type"],
      },
    },
  },
  required: ["completeness", "groups"],
};

const FIND_URL_SCHEMA = {
  type: "object",
  properties: { url: { type: "string" } },
  required: ["url"],
};

const VALID_GROUP_TYPES = ["core", "general_education", "elective", "capstone", "concentration", "minor", "other"];
const VALID_ENGINE_TYPES = ["required_course", "choose_x_of_y", "min_credits", "elective_credits", "concentration"];

function norm(s) { return String(s || "").trim(); }
function low(s) { return norm(s).toLowerCase(); }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let body;
    try { body = await req.json(); } catch { return Response.json({ error: "Invalid request body" }, { status: 400 }); }
    const { program_id, refresh } = body || {};
    if (!program_id || typeof program_id !== "string") {
      return Response.json({ error: "program_id is required" }, { status: 400 });
    }

    const program = await base44.asServiceRole.entities.Program.get(program_id);
    if (!program) return Response.json({ error: "Program not found." }, { status: 404 });
    if (program.verification_status !== "verified") {
      return Response.json({ error: "Program is not verified." }, { status: 400 });
    }

    // Cache: already discovered (and not a forced refresh).
    if (program.requirements_status && program.requirements_status !== "pending" && !refresh) {
      const groups = await base44.asServiceRole.entities.RequirementGroup.filter({ program_id }, "sort_order", 200);
      const reqs = await base44.asServiceRole.entities.Requirement.filter({ program_id }, "sort_order", 500);
      return Response.json({
        status: "cached",
        requirements_status: program.requirements_status,
        groups: groups.length,
        requirements: reqs.length,
      });
    }

    // Mark in-progress.
    await base44.asServiceRole.entities.Program.update(program.id, { requirements_status: "partial" });

    let catalog = null;
    try { if (program.catalog_id) catalog = await base44.asServiceRole.entities.Catalog.get(program.catalog_id); } catch { catalog = null; }
    let institution = null;
    try { if (program.institution_id) institution = await base44.asServiceRole.entities.Institution.get(program.institution_id); } catch { institution = null; }

    let source_url = norm(program.source_url || catalog?.source_url || "");

    // Fetch candidate official pages.
    const candidateUrls = [program.source_url, catalog?.source_url, institution?.website]
      .map(norm).filter(Boolean);
    const seen = new Set();
    let blob = "";
    for (const url of candidateUrls) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const html = await fetchPage(url);
      if (!html) continue;
      if (!source_url) source_url = url;
      const clean = stripNoise(html);
      if (blob.length < HTML_CAP) blob += " " + clean.slice(0, HTML_CAP - blob.length);
    }

    // Fallback: ask the web for the official curriculum/requirements page when no HTML.
    if (!blob && institution) {
      try {
        const find = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt:
            `Find the official curriculum / degree-requirements page for the "${program.program_name}" (${program.degree_type}) program at "${institution.name}"` +
            (institution.website ? ` (website: ${institution.website})` : "") +
            `. Return the exact URL.`,
          add_context_from_internet: true,
          model: "gemini_3_flash",
          response_json_schema: FIND_URL_SCHEMA,
        });
        const url = norm(find?.url);
        if (url) {
          source_url = url;
          const html = await fetchPage(url);
          if (html) blob = stripNoise(html).slice(0, HTML_CAP);
        }
      } catch { /* ignore */ }
    }

    if (!blob) {
      await base44.asServiceRole.entities.Program.update(program.id, {
        requirements_status: "failed",
        requirements_discovered_at: new Date().toISOString(),
        requirements_source_url: source_url,
      });
      return Response.json({ status: "failed", requirements_status: "failed", message: "Could not fetch an official requirements page." });
    }

    // Extract structured requirements.
    let extracted;
    try {
      extracted = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt:
          `You are a degree-requirement extraction engine. The following is official content from the "${program.program_name}" (${program.degree_type}) program at "${institution?.name || ""}".\n` +
          `Extract the COMPLETE degree-requirement structure as groups + requirements. Preserve the school's EXACT wording in official_name (e.g. "300\u2013400 Level Business Electives" must NOT become "Business Electives").\n` +
          `Map each requirement to an engine_type:\n` +
          `- required_course: one specific course (put its code in course_codes)\n` +
          `- choose_x_of_y: complete N of the listed courses (set choose_count + course_codes)\n` +
          `- min_credits: earn X credits from the listed courses; if it's "X credits of 300/400-level coursework" with NO specific course list, leave course_codes EMPTY and set level_min/level_max\n` +
          `- elective_credits: earn X credits from any course\n` +
          `- concentration: complete the listed course set\n` +
          `Set normalized_type: business_elective | advanced_course | upper_level | major_elective | free_elective | general_education | major_requirement | required_course | concentration | other.\n` +
          `course_codes must contain ONLY courses explicitly listed as eligible/required on the page. NEVER infer that every 300/400-level business course qualifies — if the page doesn't list specific courses, leave course_codes empty and use level_min/level_max.\n` +
          `Set completeness: "complete" if the page shows the full degree-requirement structure, "partial" if some requirements are present but the structure is incomplete, "none" if no requirements could be found.\n` +
          `Do NOT invent values.\n\nCONTENT:\n${blob.slice(0, HTML_CAP)}`,
        response_json_schema: REQUIREMENTS_SCHEMA,
        model: "gemini_3_flash",
      });
    } catch (e) {
      await base44.asServiceRole.entities.Program.update(program.id, {
        requirements_status: "failed",
        requirements_discovered_at: new Date().toISOString(),
        requirements_source_url: source_url,
      });
      return Response.json({ status: "failed", requirements_status: "failed", message: "Extraction failed: " + (e.message || "") });
    }

    const completeness = norm(extracted?.completeness) || "none";
    const rawGroups = Array.isArray(extracted?.groups) ? extracted.groups : [];

    if (completeness === "none" || rawGroups.length === 0) {
      await base44.asServiceRole.entities.Program.update(program.id, {
        requirements_status: "failed",
        requirements_discovered_at: new Date().toISOString(),
        requirements_source_url: source_url,
      });
      return Response.json({ status: "failed", requirements_status: "failed", message: "No requirements found on the official page." });
    }

    const verification = completeness === "complete" ? "verified" : "partial";

    // Dedup + create groups.
    const existingGroups = await base44.asServiceRole.entities.RequirementGroup.filter({ program_id }, "sort_order", 200);
    const existingGroupNames = new Set(existingGroups.map((g) => low(g.name)));

    const newGroupRecs = [];
    for (const g of rawGroups) {
      const name = norm(g.name);
      if (!name) continue;
      const key = low(name);
      if (existingGroupNames.has(key)) continue;
      existingGroupNames.add(key);
      newGroupRecs.push({
        program_id,
        name,
        official_name: norm(g.official_name) || name,
        group_type: VALID_GROUP_TYPES.includes(g.group_type) ? g.group_type : "core",
        credits_required: Number(g.credits_required) || null,
        normalized_category: norm(g.normalized_type) || "",
        source_url,
        verification_status: verification,
        sort_order: 0,
      });
    }
    if (newGroupRecs.length) {
      await base44.asServiceRole.entities.RequirementGroup.bulkCreate(newGroupRecs);
    }

    // Re-fetch all groups (existing + newly created) to resolve ids by name.
    const allGroups = await base44.asServiceRole.entities.RequirementGroup.filter({ program_id }, "sort_order", 200);
    const nameToId = new Map();
    for (const g of allGroups) {
      if (!nameToId.has(low(g.name))) nameToId.set(low(g.name), g.id);
    }

    // Dedup + create requirements.
    const existingReqs = await base44.asServiceRole.entities.Requirement.filter({ program_id }, "sort_order", 500);
    const reqDupKeys = new Set(existingReqs.map((r) => `${r.group_id}::${low(r.official_requirement_name || r.description || "")}::${r.requirement_type}`));

    const newReqRecs = [];
    for (const g of rawGroups) {
      const gid = nameToId.get(low(norm(g.name)));
      if (!gid) continue;
      const reqs = Array.isArray(g.requirements) ? g.requirements : [];
      reqs.forEach((r, idx) => {
        const engineType = VALID_ENGINE_TYPES.includes(r.engine_type) ? r.engine_type : "min_credits";
        const officialName = norm(r.official_name);
        const desc = norm(r.description);
        const dupKey = `${gid}::${low(officialName || desc)}::${engineType}`;
        if (reqDupKeys.has(dupKey)) return;
        reqDupKeys.add(dupKey);
        const codes = Array.isArray(r.course_codes) ? r.course_codes.map(norm).filter(Boolean) : [];
        newReqRecs.push({
          program_id,
          group_id: gid,
          requirement_type: engineType,
          course_codes: codes,
          choose_count: r.choose_count != null ? Number(r.choose_count) : null,
          min_credits: r.min_credits != null ? Number(r.min_credits) : null,
          level_min: r.level_min != null ? Number(r.level_min) : null,
          level_max: r.level_max != null ? Number(r.level_max) : null,
          normalized_type: norm(r.normalized_type) || "",
          official_requirement_name: officialName,
          subject_area: norm(r.subject_area) || "",
          min_grade: norm(r.min_grade) || "",
          prerequisite_codes: Array.isArray(r.prerequisite_codes) ? r.prerequisite_codes.map(norm).filter(Boolean) : [],
          description: desc,
          source_url,
          verification_status: verification,
          sort_order: idx,
        });
      });
    }
    if (newReqRecs.length) {
      await base44.asServiceRole.entities.Requirement.bulkCreate(newReqRecs);
    }

    const groupsCreated = newGroupRecs.length;
    const requirementsCreated = newReqRecs.length;

    await base44.asServiceRole.entities.Program.update(program.id, {
      requirements_status: verification,
      requirements_discovered_at: new Date().toISOString(),
      requirements_source_url: source_url,
    });

    return Response.json({
      status: "discovered",
      requirements_status: verification,
      groups_created: groupsCreated,
      requirements_created: requirementsCreated,
      total_groups: allGroups.length,
      total_requirements: existingReqs.length + requirementsCreated,
      source_url,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Requirement discovery failed" }, { status: 500 });
  }
}