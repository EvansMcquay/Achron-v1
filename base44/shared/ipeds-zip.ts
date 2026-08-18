// Minimal dependency-free ZIP (stored + deflate-raw) and CSV parsing for IPEDS
// complete-data files. Shared by the IPEDS importers so the parsing logic is not
// copied between functions.

import { inflateRawSync } from "node:zlib";

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

// Extracts every .csv entry from a ZIP buffer as { name, text }.
export function extractAllCsvs(zipBuf) {
  const eocd = findEocd(zipBuf);
  if (eocd < 0) throw new Error("ZIP EOCD not found");
  const dvE = new DataView(zipBuf, eocd);
  const cdSize = u32(dvE, 12);
  const cdOff = u32(dvE, 16);
  let p = cdOff;
  const end = cdOff + cdSize;
  const out = [];
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
    if (method === 0) text = new TextDecoder().decode(compData);
    else if (method === 8) text = new TextDecoder().decode(inflateRawSync(compData));
    else throw new Error("Unsupported zip compression method: " + method);
    out.push({ name, text });
  }
  if (!out.length) throw new Error("No CSV entry found in zip archive");
  return out;
}

// Returns the first .csv entry (name + text) for convenience.
export async function extractFirstCsv(zipBuf) {
  const all = extractAllCsvs(zipBuf);
  return all[0];
}

// RFC-4180-ish CSV parser. Returns array of string[] rows (header = rows[0]).
export function parseCsv(text) {
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

// Convert parsed rows into [{ col: val, ... }, ...] objects keyed by header.
export function toObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0];
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });
  const keys = Object.keys(idx);
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 1 && row[0] === "") continue;
    const obj = {};
    for (const k of keys) obj[k] = row[idx[k]] ?? "";
    out.push(obj);
  }
  return out;
}