import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import {
  canonicalForCip,
  degreeLevelForInstitutionType,
  degreeTypeForLevel,
} from '../../shared/cip-normalization.ts';

// National program baseline import (admin-only).
//
// Uses the U.S. Department of Education College Scorecard API (api.data.gov),
// which is built on NCES IPEDS and keyed by IPEDS UnitID. For each Achron
// Institution that has an IPEDS UnitID (stored as external_id), this reads the
// institution's awarded-program inventory (`latest.academics.program_percentage`,
// keyed by CIP code) and creates one national-baseline Program record per CIP
// family the institution offers, preserving the CIP code, the CIP title, and a
// coarse degree level inferred from the institution's IPEDS level.
//
//   source              = "IPEDS"
//   verification_status = "national_baseline"  (NOT official-verified)
//
// This is the national skeleton. The existing discoverPrograms official-site
// crawler remains the authoritative layer and upgrades matching baseline
// records to "verified" when it finds the school's actual program.
//
// Idempotent: dedups against existing programs of ANY status by (canonical_major
// + degree_level) and (cip_code + degree_level), so re-runs never create
// duplicates and never overwrite or downgrade officially-verified records.
// Re-invokable; each call processes a bounded batch (`limit`, default 5) so a
// single call stays inside the function timeout.

const SCORECARD_BASE = "https://api.data.gov/ed/collegescorecard/v1/schools";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    let body = {};
    try { body = await req.json(); } catch {}
    const apiKey = secrets.get("COLLEGE_SCORECARD_API_KEY");
    if (!apiKey) {
      return Response.json(
        { error: "Missing COLLEGE_SCORECARD_API_KEY secret. Add your free api.data.gov key via Dashboard → Secrets → Add Secret." },
        { status: 500 }
      );
    }
    // Probe mode: verify the backend can read the secret WITHOUT running the
    // import or ever returning the key value. Used for configuration checks.
    if (body.probe) {
      const key = secrets.get("COLLEGE_SCORECARD_API_KEY");
      return Response.json({
        secret_name: "COLLEGE_SCORECARD_API_KEY",
        configured: Boolean(key),
        backend_access: Boolean(key),
      });
    }

    const limit = Math.max(1, Math.min(50, Number(body.limit) || 5));
    const dryRun = !!body.dry_run;
    const onlyIds = Array.isArray(body.institution_ids) ? body.institution_ids.slice(0, limit) : null;

    // Cursor-paginate institutions that have an IPEDS UnitID (external_id).
    const targets = [];
    if (onlyIds) {
      for (const id of onlyIds) {
        try {
          const inst = await base44.asServiceRole.entities.Institution.get(id);
          if (inst && inst.verification_status === "verified" && inst.external_id) targets.push(inst);
        } catch {}
      }
    } else {
      let cursor = null;
      while (targets.length < limit) {
        const q = { verification_status: "verified", external_id: { $exists: true } };
        if (cursor !== null) q.name = { $gt: cursor };
        const page = await base44.asServiceRole.entities.Institution.filter(q, "name", 500);
        if (!page.length) break;
        for (const i of page) {
          if (i.external_id) {
            targets.push(i);
            if (targets.length >= limit) break;
          }
        }
        const last = page[page.length - 1];
        if (!last || !last.name) break;
        cursor = last.name;
        if (page.length < 500) break;
      }
    }

    if (dryRun) {
      return Response.json({
        dry_run: true,
        count: targets.length,
        selected: targets.map((i) => ({ id: i.id, name: i.name, unitid: i.external_id })),
      });
    }

    const stats = {
      institutions_processed: 0,
      programs_created: 0,
      duplicates_skipped: 0,
      no_unitid: 0,
      fetch_errors: 0,
      per_institution: [],
    };

    for (const inst of targets) {
      stats.institutions_processed++;
      const unitId = String(inst.external_id).trim();
      if (!unitId) { stats.no_unitid++; continue; }

      // Fetch the institution's CIP program inventory from College Scorecard.
      let cipMap = null;
      try {
        const url =
          `${SCORECARD_BASE}?api_key=${encodeURIComponent(apiKey)}` +
          `&id=${encodeURIComponent(unitId)}` +
          `&fields=latest.academics.program_percentage`;
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        if (!r.ok) { stats.fetch_errors++; continue; }
        const data = await r.json();
        const rec = data && data.results && data.results[0];
        cipMap = rec ? (rec["latest.academics.program_percentage"] || rec.latest?.academics?.program_percentage) : null;
      } catch {
        stats.fetch_errors++;
        continue;
      }
      if (!cipMap || typeof cipMap !== "object") {
        stats.per_institution.push({ id: inst.id, name: inst.name, created: 0, skipped: 0 });
        continue;
      }

      // Load existing programs for this institution (any status) for idempotency.
      const existing = await base44.asServiceRole.entities.Program.filter(
        { institution_id: inst.id }, "program_name", 1000
      );
      const existingKeys = new Set();
      for (const p of existing) {
        if (p.canonical_major) existingKeys.add(`${p.canonical_major}::${p.degree_level || ""}`);
        if (p.cip_code) existingKeys.add(`${p.cip_code}::${p.degree_level || ""}`);
        if (p.program_name) existingKeys.add(`${p.program_name}::${p.degree_level || ""}`);
      }

      const level = degreeLevelForInstitutionType(inst.institution_type);
      const degreeType = degreeTypeForLevel(level);
      const toCreate = [];
      let skipped = 0;
      const seenThisRun = new Set();
      for (const cipRaw of Object.keys(cipMap)) {
        const pct = cipMap[cipRaw];
        if (typeof pct !== "number" || pct <= 0) continue;
        const cip = String(cipRaw).replace(/[^0-9]/g, "");
        if (!cip || cip.length < 2) continue;
        const { canonical_major, cip_title } = canonicalForCip(cip);
        const key = `${canonical_major}::${level}`;
        const cipKey = `${cip.slice(0, 4)}::${level}`;
        if (existingKeys.has(key) || existingKeys.has(cipKey)) { skipped++; continue; }
        if (seenThisRun.has(key) || seenThisRun.has(cipKey)) { skipped++; continue; }
        seenThisRun.add(key);
        seenThisRun.add(cipKey);
        toCreate.push({
          institution_id: inst.id,
          catalog_id: "",
          degree_type: degreeType,
          program_name: canonical_major,
          display_name: cip_title || canonical_major,
          normalized_name: canonical_major,
          normalized_category: canonical_major,
          offering_type: "major",
          official_degree_name: "",
          parent_program_name: "",
          source: "IPEDS",
          verification_status: "national_baseline",
          canonical_major,
          cip_code: cip.slice(0, 4),
          cip_title,
          degree_level: level,
          credits_required: 0,
          external_program_id: "",
          source_url: inst.source_url || "",
          active: true,
          last_verified: "",
        });
      }

      let created = 0;
      if (toCreate.length) {
        await base44.asServiceRole.entities.Program.bulkCreate(toCreate);
        created = toCreate.length;
        stats.programs_created += created;
      }
      stats.duplicates_skipped += skipped;
      stats.per_institution.push({ id: inst.id, name: inst.name, unitid: unitId, created, skipped });
    }

    return Response.json({ status: "success", stats });
  } catch (error) {
    return Response.json({ error: error?.message || "Import failed" }, { status: 500 });
  }
}