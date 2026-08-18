// Official NCES CIP 2020 taxonomy reference — authoritative CIPCODE → exact title.
//
// Source: https://nces.ed.gov/ipeds/cipcode/Files/CIPCode2020.csv
// The CSV lists every CIP code (2-digit family, 4-digit group, 6-digit
// specialization) with its exact NCES title. We load it once per cold start and
// build a lookup of 6-digit (and 4/2-digit fallback) → cleaned title, so the
// national-baseline importer can label each program with its REAL 6-digit CIP
// title instead of a broad category bucket.
//
// This is reference (taxonomy) data, not institution data — it is stable and
// shared across all institutions, which is what gives Achron cross-school
// canonical identity: the same 6-digit CIP resolves to the same title at every
// school, while distinct CIPs stay distinct.

const CIP2020_URL = "https://nces.ed.gov/ipeds/cipcode/Files/CIPCode2020.csv";

let cache: { cip6: Map<string, string>; cip4: Map<string, string>; cip2: Map<string, string> } | null = null;

// RFC-4180 CSV parser tolerant of the file's leading "=" formula-protection
// (e.g. ="01.0101"). Returns rows of string arrays with the leading "=" stripped.
function parseCipCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0, field = "", row: string[] = [], inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ",") { row.push(field); field = ""; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += ch; i++;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  for (const r of rows) for (let k = 0; k < r.length; k++) if (r[k].startsWith("=")) r[k] = r[k].slice(1);
  return rows;
}

function cleanTitle(t: string): string {
  return String(t || "").replace(/\s*\.\s*$/, "").trim();
}

function toDigits(cipCode: string): string {
  return String(cipCode || "").replace(/[^0-9]/g, "");
}

export async function loadCip2020() {
  if (cache) return cache;
  const res = await fetch(CIP2020_URL);
  if (!res.ok) throw new Error(`CIP 2020 reference fetch failed: ${res.status}`);
  const text = await res.text();
  const rows = parseCipCsv(text);
  const cip6 = new Map<string, string>();
  const cip4 = new Map<string, string>();
  const cip2 = new Map<string, string>();
  if (rows.length < 2) { cache = { cip6, cip4, cip2 }; return cache; }
  // header: CIPFamily, CIPCode, Action, TextChange, CIPTitle, CIPDefinition, CrossReferences, Examples
  const header = rows[0].map((h) => h.trim());
  const codeIdx = header.findIndex((h) => h.toUpperCase() === "CIPCODE");
  const titleIdx = header.findIndex((h) => h.toUpperCase() === "CIPTITLE");
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;
    const code = toDigits(r[codeIdx]);
    const title = cleanTitle(r[titleIdx]);
    if (!code || !title) continue;
    if (code.length >= 6) cip6.set(code.slice(0, 6), title);
    else if (code.length >= 4) cip4.set(code.slice(0, 4), title);
    else if (code.length >= 2) cip2.set(code.slice(0, 2), title);
  }
  cache = { cip6, cip4, cip2 };
  return cache;
}

// Look up the exact title for a 6-digit (preferred) / 4-digit / 2-digit CIP.
export function lookupCipTitle(cipDigits: string, ref: { cip6: Map<string, string>; cip4: Map<string, string>; cip2: Map<string, string> } | null): string | null {
  if (!ref) return null;
  const d = toDigits(cipDigits);
  if (!d) return null;
  if (d.length >= 6) { const t = ref.cip6.get(d.slice(0, 6)); if (t) return t; }
  if (d.length >= 4) { const t = ref.cip4.get(d.slice(0, 4)); if (t) return t; }
  if (d.length >= 2) { const t = ref.cip2.get(d.slice(0, 2)); if (t) return t; }
  return null;
}