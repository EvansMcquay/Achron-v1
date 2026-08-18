// Shared web-discovery helpers for the official-source discovery pipeline
// (program inventory + program requirement discovery). Generic HTML fetching
// and cleaning only — no business logic. Functions import from here instead of
// duplicating fetch/sanitize code.

export const FETCH_TIMEOUT_MS = 10000;

export function resolveUrl(href, base) {
  if (!href) return "";
  const h = String(href).trim();
  if (!h || h.startsWith("#") || h.startsWith("javascript:") || h.startsWith("mailto:")) return "";
  try {
    return new URL(h, base).href;
  } catch {
    return "";
  }
}

export async function fetchPage(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AchronAcademicBot/1.0)" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!r.ok) return "";
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("text") && !ct.includes("html")) return "";
    return await r.text();
  } catch {
    return "";
  }
}

export function stripNoise(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}