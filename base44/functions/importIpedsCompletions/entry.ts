import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  extractAllCsvs,
  parseCsv,
  toObjects,
} from '../../shared/ipeds-zip.ts';
import {
  resolveCip,
  degreeTypeForLevel,
} from '../../shared/cip-normalization.ts';
import { loadCip2020 } from '../../shared/cip-2020-reference.ts';

// National program baseline import — REAL IPEDS CIP-LEVEL COMPLETIONS.
//
// Source: the official NCES/IPEDS Completions (C) survey complete data file:
//   C2025_A.zip / c2025_a.csv — awards/degrees conferred by 6-digit CIP code,
//   award level, and institution (UNITID, CIPCODE, MAJORNUM, AWLEVEL, CTOTALT,
//   + demographic counts). This is the only file needed: B and C in the same
//   set are institution grand-total and by-award-level summaries (no CIP
//   detail), so they are not used.
//
// For each target institution, this reads the institution's CIP-level completion
// rows and creates one national-baseline Program record per (CIP code, award
// level) with the REAL 6-digit CIP code, the CIP title (from the curated CIP
// map, with family fallback), and the ACTUAL award/degree level from the
// source — NOT broad category buckets.
//
//   source              = "IPEDS"
//   verification_status = "national_baseline"  (NOT official-verified)
//
// Preserves all existing official_verified programs — never downgrades or
// deletes them. Idempotent: dedups by (institution_id, cip_code, degree_level)
// and against existing programs of any status. Re-invokable; bounded batch
// (limit, default 5). Uses name-cursor pagination for the eventual national run.
//
// Admin-only.

const A_URL = "https://nces.ed.gov/ipeds/complete-data-files/C2025_A.zip";
const NAVIGATOR_BASE = "https://nces.ed.gov/collegenavigator/?id=";

// Authoritative IPEDS Completions AWLEVEL -> Achron degree_level, from the
// IPEDS Completions data dictionary (survey-materials crosswalk):
//   1 / 1A / 1B = less-than-1-year certificate
//   2 = 1-to-<2-year certificate
//   3 = Associate's degree
//   4 = 2-to-<4-year certificate (postsecondary award)
//   5 = Bachelor's degree
//   6 = Postbaccalaureate certificate
//   7 = Master's degree
//   8 = Post-Master's certificate
//   17 = Doctor's degree - research/scholarship
//   18 = Doctor's degree - professional practice
//   19 = Doctor's degree - other
const AWLEVEL_MAP = {
  "1": "certificate", "1A": "certificate", "1B": "certificate",
  "2": "certificate",
  "3": "associate",
  "4": "certificate",
  "5": "bachelor",
  "6": "certificate",
  "7": "master",
  "8": "certificate",
  "17": "doctorate", "18": "doctorate", "19": "doctorate",
  // 20 and 21 are the two new sub-categories of the former "less than 1-year"
  // certificate (the old code 1 was split into two categories per the IPEDS
  // 2020-21 Completions change; the complete-data A file no longer contains
  // code 1, only 20 and 21). Both are certificates.
  "20": "certificate", "21": "certificate",
};

// Normalize a 6-digit CIP string from IPEDS ("01.0999" or "010101") into a
// 6-digit numeric string ("010199"). Preserves full precision per Achron spec.
function normalizeCip(raw) {
  const n = String(raw || "").replace(/[^0-9]/g, "");
  if (!n) return "";
  if (n.length >= 6) return n.slice(0, 6);
  return n.padEnd(6, "0");
}

function navigatorUrl(unitId) {
  return NAVIGATOR_BASE + encodeURIComponent(String(unitId || ""));
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    let body = {};
    try { body = await req.json(); } catch {}

    // ---- probe_dataset: download A, report structure + AWLEVEL distribution ----
    if (body.probe_dataset) {
      const r = await fetch(A_URL);
      if (!r.ok) return Response.json({ error: "IPEDS A fetch failed", status: r.status }, { status: 502 });
      const buf = await r.arrayBuffer();
      const csv = extractAllCsvs(buf)[0];
      const rows = parseCsv(csv.text);
      const header = rows[0] || [];
      const objs = toObjects(rows);
      const keys = objs.length ? Object.keys(objs[0]) : header;
      const unitidCol = keys.find((k) => k.toUpperCase() === "UNITID") || "UNITID";
      const awlevelCol = keys.find((k) => k.toUpperCase() === "AWLEVEL") || "AWLEVEL";
      const cipcodeCol = keys.find((k) => k.toUpperCase() === "CIPCODE") || keys.find((k) => /^cipcode/i.test(k));
      const totalCol = keys.find((k) => k.toUpperCase() === "CTOTALT") || keys.find((k) => /ctotalt/i.test(k));
      const awDist = {};
      if (objs.length) for (const o of objs) {
        const a = String(o[awlevelCol] || "").trim();
        if (a) awDist[a] = (awDist[a] || 0) + 1;
      }
      // Sample rows for a requested unitid, if provided.
      let sample = [];
      if (body.unitid && objs.length) {
        const uid = String(body.unitid).trim();
        sample = objs.filter((o) => String(o[unitidCol] || "").trim() === uid)
          .slice(0, 10)
          .map((o) => ({ UNITID: o[unitidCol], CIPCODE: o[cipcodeCol], AWLEVEL: o[awlevelCol], CTOTALT: o[totalCol] }));
      }
      return Response.json({
        file: csv.name, rowCount: objs.length, header,
        columns: { unitidCol, cipcodeCol, awlevelCol, totalCol },
        awlevelDistribution: awDist,
        sampleForUnitid: sample,
      });
    }

    const limit = Math.max(1, Math.min(50, Number(body.limit) || 5));
    const dryRun = !!body.dry_run;
    const unitIdRe = /^\d{4,8}$/;

    // Resolve target institutions: explicit institution_ids OR numeric unitids OR
    // cursor-paginated institutions that have a numeric IPEDS UnitID.
    const targets = [];
    if (Array.isArray(body.institution_ids) && body.institution_ids.length) {
      for (const id of body.institution_ids.slice(0, limit)) {
        try {
          const inst = await base44.asServiceRole.entities.Institution.get(id);
          if (inst && inst.verification_status === "verified" && unitIdRe.test(String(inst.external_id || ""))) {
            targets.push(inst);
          }
        } catch {}
      }
    } else if (Array.isArray(body.unitids) && body.unitids.length) {
      const wanted = body.unitids.slice(0, limit).map((u) => String(u).trim());
      let cursor = null;
      while (targets.length < wanted.length) {
        const q = { verification_status: "verified" };
        if (cursor !== null) q.name = { $gt: cursor };
        const page = await base44.asServiceRole.entities.Institution.filter(q, "name", 500);
        if (!page.length) break;
        for (const i of page) {
          if (unitIdRe.test(String(i.external_id || "")) && wanted.includes(String(i.external_id).trim())) {
            targets.push(i);
          }
        }
        cursor = page[page.length - 1]?.name;
        if (!cursor || page.length < 500) break;
      }
    } else {
      let cursor = null;
      while (targets.length < limit) {
        const q = { verification_status: "verified" };
        if (cursor !== null) q.name = { $gt: cursor };
        const page = await base44.asServiceRole.entities.Institution.filter(q, "name", 500);
        if (!page.length) break;
        for (const i of page) {
          if (unitIdRe.test(String(i.external_id || ""))) { targets.push(i); if (targets.length >= limit) break; }
        }
        cursor = page[page.length - 1]?.name;
        if (!cursor || page.length < 500) break;
      }
    }

    if (dryRun) {
      return Response.json({
        dry_run: true,
        count: targets.length,
        selected: targets.map((i) => ({ id: i.id, name: i.name, unitid: i.external_id })),
      });
    }

    if (!targets.length) {
      return Response.json({ status: "no_targets", message: "No verified institutions with a numeric IPEDS UnitID matched the request." });
    }

    // ---- refresh_titles: re-label existing national-baseline records with the
    //      EXACT 6-digit CIP title from the official CIP 2020 reference. Does not
    //      create or delete records; only updates cip_title / program_name /
    //      display_name / canonical_major where an exact title is available. ----
    if (body.refresh_titles) {
      const cipRef = await loadCip2020();
      const stats = {
        institutions_processed: 0,
        titles_updated: 0,
        already_exact: 0,
        no_cip: 0,
        per_institution: [],
      };
      for (const inst of targets) {
        stats.institutions_processed++;
        const existing = await base44.asServiceRole.entities.Program.filter(
          { institution_id: inst.id, source: "IPEDS", verification_status: "national_baseline" },
          "program_name", 1000
        );
        const updates = [];
        let alreadyExact = 0, noCip = 0;
        for (const p of existing) {
          if (!p.cip_code || String(p.cip_code).length < 6) { noCip++; continue; }
          const { canonical_major, cip_title, exact } = resolveCip(p.cip_code, cipRef);
          if (!exact) continue; // no exact 6-digit title available; leave the curated/family label
          if (
            cip_title === p.cip_title &&
            cip_title === p.program_name &&
            canonical_major === p.canonical_major
          ) { alreadyExact++; continue; }
          updates.push({
            id: p.id,
            cip_title,
            program_name: cip_title || p.program_name,
            display_name: cip_title || p.display_name || p.program_name,
            canonical_major,
          });
        }
        if (updates.length) await base44.asServiceRole.entities.Program.bulkUpdate(updates);
        stats.titles_updated += updates.length;
        stats.already_exact += alreadyExact;
        stats.no_cip += noCip;
        stats.per_institution.push({
          id: inst.id, name: inst.name,
          updated: updates.length, already_exact: alreadyExact, no_cip: noCip,
        });
      }
      return Response.json({ status: "success", refresh_titles: true, stats });
    }

    // ---- Download + parse the IPEDS Completions A file ----
    const aRes = await fetch(A_URL);
    if (!aRes.ok) return Response.json({ error: "IPEDS dataset fetch failed", status: aRes.status }, { status: 502 });
    const aBuf = await aRes.arrayBuffer();
    const aCsv = extractAllCsvs(aBuf)[0];
    const aRows = parseCsv(aCsv.text);
    if (aRows.length < 2) return Response.json({ error: "Empty completions file" }, { status: 500 });
    const header = aRows[0];
    const unitidIdx = header.findIndex((h) => h.toUpperCase() === "UNITID");
    const cipIdx = header.findIndex((h) => /^cipcode/i.test(h));
    const awlIdx = header.findIndex((h) => h.toUpperCase() === "AWLEVEL");
    const totalIdx = header.findIndex((h) => h.toUpperCase() === "CTOTALT");
    if (unitidIdx < 0 || cipIdx < 0 || awlIdx < 0 || totalIdx < 0) {
      return Response.json({ error: "Completions file missing required columns", header }, { status: 500 });
    }

    // Index rows for the target UnitIDs only (stream over raw CSV rows; no
    // per-row object materialization to keep memory flat for 300K+ rows).
    const targetUnitIds = new Set(targets.map((t) => String(t.external_id).trim()));
    const completionsByUnit = new Map(); // unitId -> Map(cip6 -> Map(awlevel -> total))
    for (let i = 1; i < aRows.length; i++) {
      const row = aRows[i];
      if (!row || (row.length === 1 && row[0] === "")) continue;
      const uid = String(row[unitidIdx] || "").trim();
      if (!uid || !targetUnitIds.has(uid)) continue;
      const total = Number(row[totalIdx]);
      if (!Number.isFinite(total) || total <= 0) continue;
      const cip6 = normalizeCip(row[cipIdx]);
      if (!cip6) continue;
      const awl = String(row[awlIdx] || "").trim();
      if (!awl) continue;
      let byCip = completionsByUnit.get(uid);
      if (!byCip) { byCip = new Map(); completionsByUnit.set(uid, byCip); }
      let byAwl = byCip.get(cip6);
      if (!byAwl) { byAwl = new Map(); byCip.set(cip6, byAwl); }
      const prev = byAwl.get(awl) || 0;
      if (total > prev) byAwl.set(awl, total);
    }
    // Free the raw rows before the DB phase.
    aRows.length = 0;

    // ---- Load the official CIP 2020 reference (exact 6-digit titles) ----
    const cipRef = await loadCip2020();

    // ---- Build national-baseline program records per target ----
    const stats = {
      institutions_processed: 0,
      programs_created: 0,
      duplicates_skipped: 0,
      unknown_awlevel_skipped: 0,
      no_unitid: 0,
      per_institution: [],
    };

    for (const inst of targets) {
      stats.institutions_processed++;
      const unitId = String(inst.external_id || "").trim();
      if (!unitIdRe.test(unitId)) {
        stats.no_unitid++;
        stats.per_institution.push({ id: inst.id, name: inst.name, created: 0, skipped: 0, programs_found: 0, error: "non-numeric external_id" });
        continue;
      }

      const byCip = completionsByUnit.get(unitId);
      const programsFound = byCip ? [...byCip.values()].reduce((n, m) => n + m.size, 0) : 0;

      if (!byCip) {
        stats.per_institution.push({ id: inst.id, name: inst.name, unitid: unitId, created: 0, skipped: 0, programs_found: 0, note: "no IPEDS completion rows for this UnitID" });
        continue;
      }

      // Load existing programs for this institution (any status) for idempotency.
      const existing = await base44.asServiceRole.entities.Program.filter({ institution_id: inst.id }, "program_name", 1000);
      // Dedup by (cip_code, degree_level) only — each 6-digit CIP at each award
      // level is a distinct program. Cross-school identity is carried by
      // canonical_major (deterministic from CIP), so we do NOT collapse different
      // CIPs that share a canonical or title within one school.
      const existingKeys = new Set();
      for (const p of existing) {
        if (p.cip_code) existingKeys.add(`${p.cip_code}::${p.degree_level || ""}`);
      }

      const toCreate = [];
      let skipped = 0;
      const seenThisRun = new Set();
      for (const [cip6, byAwl] of byCip) {
        for (const [awl, total] of byAwl) {
          const level = AWLEVEL_MAP[awl];
          if (!level) { stats.unknown_awlevel_skipped++; skipped++; continue; }

          const dedupKey = `${cip6}::${level}`;
          if (existingKeys.has(dedupKey) || seenThisRun.has(dedupKey)) { skipped++; continue; }
          seenThisRun.add(dedupKey);

          const { canonical_major, cip_title } = resolveCip(cip6, cipRef);
          // program_name = the EXACT 6-digit CIP title from the official CIP 2020
          // reference (the real specific major), falling back to the curated
          // title/canonical only when the 6-digit code is not in the reference.
          const program_name = cip_title || canonical_major;

          toCreate.push({
            institution_id: inst.id,
            catalog_id: "",
            degree_type: degreeTypeForLevel(level),
            program_name,
            display_name: cip_title || canonical_major,
            normalized_name: canonical_major,
            normalized_category: canonical_major,
            offering_type: "major",
            official_degree_name: "",
            parent_program_name: "",
            parent_program_source_url: "",
            source: "IPEDS",
            verification_status: "national_baseline",
            canonical_major,
            cip_code: cip6,
            cip_title,
            degree_level: level,
            credits_required: 0,
            external_program_id: "",
            source_url: navigatorUrl(unitId),
            last_verified: "",
            active: true,
          });
        }
      }

      let created = 0;
      if (toCreate.length) {
        await base44.asServiceRole.entities.Program.bulkCreate(toCreate);
        created = toCreate.length;
        stats.programs_created += created;
      }
      stats.duplicates_skipped += skipped;
      stats.per_institution.push({
        id: inst.id, name: inst.name, unitid: unitId,
        programs_found: programsFound, created, skipped,
        sample: toCreate.slice(0, 15).map((p) => ({
          program_name: p.program_name, cip_code: p.cip_code, cip_title: p.cip_title, degree_level: p.degree_level, verification_status: p.verification_status,
        })),
      });
    }

    return Response.json({ status: "success", stats });
  } catch (error) {
    return Response.json({ error: error?.message || "Import failed" }, { status: 500 });
  }
}