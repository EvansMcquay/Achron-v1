import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { inflateRawSync } from "node:zlib";

// National institution backbone import.
//
// IPEDS (via the Department of Education College Scorecard institution-level
// data file — IPEDS-sourced, UnitID-keyed, official ED data) is the AUTHORITATIVE
// source for institution EXISTENCE. Importing it populates the existing
// Institution table with the full national directory, so normal institution
// searches resolve against a local cache and no longer require AI discovery.
//
// Architecture rule (enforced): IPEDS establishes existence ONLY. It does NOT
// create Catalog, Program, or Requirement records. Those remain subject to the
// existing catalog/program verification workflow. This function creates
// Institution records only, with verification_status = "verified" (existence
// verified) and source = "nces_ipeds".
//
// Security: admin-only trigger. Creates run through the service role (RLS on
// Institution.create is admin-only). Students can read verified institutions
// (existing RLS) but cannot create or modify them. Existing verified records
// (the 22 already present) are PRESERVED — never overwritten — and dedup by
// UnitID + normalized-name/state prevents duplicates.

// Official NCES IPEDS "Directory information" (HD) complete data file — the
// authoritative source for institution existence, identity, and level/control.
const SCORECARD_ZIP_URL =
  "https://nces.ed.gov/ipeds/complete-data-files/HD2025.zip";

const BATCH_SIZE = 500;

// ---------- minimal ZIP + CSV handling (no external deps) ----------

function u16(dv, o) { return dv.getUint16(o, true); }
function u32(dv, o) { return dv.getUint32(o, true); }

function findEocd(buf) {
  const sig = 0x06054b50;
  const maxBack = Math.min(buf.byteLength, 65557);
  for (let i = buf.byteLength - 22; i >= buf.byteLength - maxBack; i--) {
    if (new DataView(buf, i, 4).getUint32(0, true) === sig) return i;
  }
  return -1;
}

async function extractFirstCsv(zipBuf) {
  const eocd = findEocd(zipBuf);
  if (eocd < 0) throw new Error("ZIP EOCD not found");
  const dvE = new DataView(zipBuf, eocd);
  const cdSize = u32(dvE, 12);
  const cdOff = u32(dvE, 16);
  let p = cdOff;
  const end = cdOff + cdSize;
  while (p < end) {
    const dv = new DataView(zipBuf, p, 46);
    if (u32(dv, 0) !== 0x02014b50) break;
    const method = u16(dv, 10);
    const compSize = u32(dv, 20);
    const nameLen = u16(dv, 28);
    const extraLen = u16(dv, 30);
    const commentLen = u16(dv, 32);
    const localOff = u32(dv, 42);
    const name = new TextDecoder().decode(new Uint8Array(zipBuf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!name.toLowerCase().endsWith(".csv")) continue;

    const lh = new DataView(zipBuf, localOff, 30);
    if (u32(lh, 0) !== 0x04034b50) throw new Error("Bad local file header");
    const lNameLen = u16(lh, 26);
    const lExtraLen = u16(lh, 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const compData = new Uint8Array(zipBuf, dataStart, compSize);

    let text;
    if (method === 0) {
      text = new TextDecoder().decode(compData);
    } else if (method === 8) {
      text = new TextDecoder().decode(inflateRawSync(compData));
    } else {
      throw new Error("Unsupported zip compression method: " + method);
    }
    return { name, text };
  }
  throw new Error("No CSV entry found in zip archive");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* ignore */ }
      else field += ch;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------- mapping / dedup ----------

function normName(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function mapType(iclevel, preddeg) {
  if (iclevel === "1") return "4-year";
  if (iclevel === "2") return "2-year";
  if (iclevel === "3") return "less-than-2-year";
  if (preddeg === "3" || preddeg === "4") return "4-year";
  if (preddeg === "2") return "2-year";
  return "less-than-2-year";
}

function mapControl(control) {
  if (control === "1") return "public";
  if (control === "2") return "private-not-for-profit";
  if (control === "3") return "private-for-profit";
  return "";
}

function cleanUrl(u) {
  let s = String(u || "").trim();
  s = s.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return s;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function buildRecord(row, idx) {
  const get = (k) => (k in row ? row[k] : "");
  const unitId = String(get("UNITID")).trim();
  const instnm = String(get("INSTNM")).trim();
  const city = String(get("CITY")).trim();
  const state = String(get("STABBR")).trim();
  const zip = String(get("ZIP")).trim();
  const control = mapControl(String(get("CONTROL")).trim());
  const iclevel = String(get("ICLEVEL")).trim();
  const preddeg = String(get("PREDDEG")).trim();
  const insturl = cleanUrl(get("INSTURL")) || cleanUrl(get("WEBADDR"));
  const aliasRaw = String(get("IALIAS")).trim();
  const aliases = aliasRaw
    ? aliasRaw.split(/[;|]/).map((s) => s.trim()).filter(Boolean)
    : [];

  const errors = [];
  if (!unitId) errors.push("missing_unitid");
  if (!instnm) errors.push("missing_name");
  if (!state) errors.push("missing_state");
  if (errors.length) {
    return { _invalid: true, errors, unitId, instnm, state, rowNumber: idx + 1 };
  }
  return {
    name: instnm,
    display_name: instnm,
    short_name: "",
    aliases,
    external_id: unitId,
    city,
    state,
    zip,
    website: insturl,
    institution_type: mapType(iclevel, preddeg),
    control,
    source: "nces_ipeds",
    source_url: `https://nces.ed.gov/collegenavigator/?id=${unitId}`,
    last_verified: todayISO(),
    active: true,
    verification_status: "verified",
  };
}

// ---------- load existing (paginate) ----------

async function loadAllInstitutions(base44) {
  const all = [];
  let skip = 0;
  const PAGE = 4000; // stay under the platform's per-call result cap
  for (let guard = 0; guard < 50; guard++) {
    const batch = await base44.asServiceRole.entities.Institution.filter(
      {}, "name", PAGE, skip
    );
    all.push(...batch);
    if (!batch.length || batch.length < PAGE) break;
    skip += PAGE;
  }
  return all;
}

export default async function(req) {
  let phase = "init";
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") {
      return Response.json({ error: "Admin only" }, { status: 403 });
    }

    let body = {};
    try { body = await req.json(); } catch {}
    const dryRun = !!body.dry_run;
    const maxImport = Number(body.max_import) || 0; // 0 = unlimited

    if (body.probe) {
      phase = "probe-fetch";
      const r = await fetch("https://example.com");
      const t = await r.text();
      return Response.json({ status: r.status, len: t.length, sample: t.slice(0, 120) });
    }

    if (body.probe_dataset) {
      phase = "ds-fetch";
      const r = await fetch(SCORECARD_ZIP_URL);
      phase = "ds-buffer";
      const buf = await r.arrayBuffer();
      const bytes = new Uint8Array(buf, 0, 4);
      return Response.json({
        status: r.status,
        contentLength: r.headers.get("content-length"),
        byteLength: buf.byteLength,
        signature: [bytes[0], bytes[1], bytes[2], bytes[3]],
        isZip: bytes[0] === 0x50 && bytes[1] === 0x4b,
      });
    }

    // 1. Fetch + extract the official dataset.
    if (typeof fetch !== "function") throw new Error("fetch unavailable in runtime");
    if (typeof inflateRawSync !== "function") throw new Error("node:zlib inflateRawSync unavailable in runtime");
    phase = "fetch";
    const resp = await fetch(SCORECARD_ZIP_URL);
    if (!resp.ok) throw new Error("Dataset fetch failed: HTTP " + resp.status);
    phase = "arrayBuffer";
    const zipBuf = await resp.arrayBuffer();
    phase = "unzip";
    const { name: csvName, text } = await extractFirstCsv(zipBuf);
    phase = "parse";
    const rows = parseCsv(text);
    if (!rows.length) return Response.json({ error: "Empty CSV" }, { status: 500 });

    // Build a header-index map for robust column lookup.
    const header = rows[0];
    const colIndex = {};
    header.forEach((h, i) => { colIndex[h] = i; });
    const dataRows = rows.slice(1).map((r) => {
      const obj = {};
      for (const k in colIndex) obj[k] = r[colIndex[k]] ?? "";
      return obj;
    });

    // 2. Validate + map every row.
    const failedRecords = [];
    const valid = [];
    for (let i = 0; i < dataRows.length; i++) {
      const rec = buildRecord(dataRows[i], i);
      if (rec._invalid) { failedRecords.push(rec); continue; }
      valid.push(rec);
    }

    // DRY RUN: report structure + samples, write nothing.
    if (dryRun) {
      return Response.json({
        status: "success",
        dry_run: true,
        csv_file: csvName,
        total_rows: dataRows.length,
        valid_rows: valid.length,
        failed_records: failedRecords.length,
        columns_all: header,
        columns_present: ["UNITID", "INSTNM", "CITY", "STABBR", "ZIP", "CONTROL", "ICLEVEL", "IALIAS", "WEBADDR", "INSTURL", "PREDDEG"]
          .filter((c) => colIndex[c] !== undefined),
        sample_records: valid.slice(0, 3),
        sample_failures: failedRecords.slice(0, 3),
      });
    }

    // 3. Load existing institutions for dedup (preserve existing verified).
    const existing = await loadAllInstitutions(base44);
    const existingByUnitId = new Set();
    const existingNameState = new Set();
    for (const e of existing) {
      if (e.external_id) existingByUnitId.add(String(e.external_id).trim());
      if (e.name && e.state) existingNameState.add(`${normName(e.name)}|${e.state.toUpperCase()}`);
    }

    // 4. Dedup candidates.
    const seenUnitId = new Set(existingByUnitId);
    const seenNameState = new Set(existingNameState);
    let duplicatesPrevented = 0;
    const toImport = [];
    for (const rec of valid) {
      const nk = `${normName(rec.name)}|${rec.state.toUpperCase()}`;
      if (seenUnitId.has(rec.external_id)) { duplicatesPrevented++; continue; }
      if (seenNameState.has(nk)) { duplicatesPrevented++; continue; }
      seenUnitId.add(rec.external_id);
      seenNameState.add(nk);
      toImport.push(rec);
      if (maxImport && toImport.length >= maxImport) break;
    }

    // 5. Batched bulk-create.
    let imported = 0;
    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      const slice = toImport.slice(i, i + BATCH_SIZE);
      await base44.asServiceRole.entities.Institution.bulkCreate(slice);
      imported += slice.length;
    }

    // 6. Post-import count verification.
    const after = await loadAllInstitutions(base44);
    const verifiedCount = after.filter((i) => i.verification_status === "verified").length;
    const afterArithmetic = existing.length + imported;

    return Response.json({
      status: "success",
      dataset: csvName,
      source: "nces_ipeds",
      counts: {
        before: existing.length,
        dataset_rows: dataRows.length,
        valid_rows: valid.length,
        failed_records: failedRecords.length,
        duplicates_prevented: duplicatesPrevented,
        imported,
        after_arithmetic: afterArithmetic,
        after_queried: after.length,
        verified_after_queried: verifiedCount,
        count_matches: after.length === afterArithmetic,
      },
      existing_preserved: existing.length, // none overwritten; all pre-import IDs intact
      failed_sample: failedRecords.slice(0, 5),
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error), phase, stack: error?.stack }, { status: 500 });
  }
}