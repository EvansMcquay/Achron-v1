import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Recursive, exhaustive official program discovery.
//
//   School selected
//     -> verified majors already exist?  YES -> return them (unless refresh)
//     -> NO -> crawl the school's official programs directory RECURSIVELY:
//          1. find the official programs index URL (1 web-LLM call)
//          2. BFS over the official domain: index + college/category/pagination
//             branch pages are fetched (capped). Program detail links are
//             harvested by regex (no LLM cap), so a large single-page index
//             (e.g. Commonwealth's 70-program A-Z directory) is captured in full.
//          3. Classify the COMPLETE accumulated official HTML in chunks via LLM,
//             reading each entry's "Degrees & Offerings" classification
//             (major | concentration | minor | certificate | ...). The index
//             directory is an official source with the authoritative
//             classification, so chunked classification yields the full
//             inventory without per-program detail fetches.
//          4. If the directory pages lack per-program classification (sparse),
//             fall back to capped detail-page verification for the unclassified
//             harvested links.
//          -> majors -> verified + active (student-selectable)
//          -> non-majors -> pending (retained for the degree-audit engine)
//          -> parent-major synthesis for concentrations naming a degree parent
//          -> write discovery completeness back onto the Institution:
//               complete (BFS exhausted + no caps + classified) | partial | failed
//     -> only if NO reliable official program info can be found -> not_found

const MAX_INDEX_PAGES = 25;      // BFS cap across index + branches + pagination
const MAX_PROGRAM_LINKS = 250;   // unique program detail links harvested
const PAGE_HTML_CAP = 200000;    // accumulated official HTML fed to classification
const CHUNK_CAP = 35000;         // per-chunk LLM classification size
const CHUNK_OVERLAP = 2500;      // overlap so boundary programs aren't dropped
const DETAIL_FALLBACK_CAP = 60;  // max detail-page verifications in the fallback
const DETAIL_BATCH = 20;
const FETCH_CONCURRENCY = 8;
const DETAIL_HTML_CAP = 6000;
const FETCH_TIMEOUT_MS = 10000;
const MAJOR = "major";

const BRANCH_KEYWORDS =
  /(college|school|department|areas-of-study|area-of-study|catalog|bulletin|degrees|program-type|by-college|colleges|all-programs|view-all|undergraduate|graduate)/i;

const URL_SCHEMA = {
  type: "object",
  properties: {
    programs_url: { type: "string", description: "Official URL of the institution's academic programs directory" },
    catalog_url: { type: "string", description: "Official academic catalog URL if different" },
  },
  required: ["programs_url"],
};

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    programs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          program_name: { type: "string", description: "The offering's own official name exactly as shown on the page (the listing/anchor text), e.g. 'Fisheries and Aquatic Biology' or 'Accounting'." },
          degree_type: { type: "string", description: "Associate | Bachelor | Master | Doctorate | Certificate | Diploma" },
          offering_type: { type: "string", description: "Classification from the school's official 'Degrees & Offerings' section, NOT the page title or URL: major | concentration | minor | certificate | track | specialization | option | endorsement | pre-professional | other. ONLY a degree-granting program is 'major'. A concentration/track/specialization/option/endorsement/pre-professional/other is NEVER 'major' even if its page is detailed." },
          official_degree_name: { type: "string", description: "Official degree abbreviation e.g. B.S.B.A., B.A., B.S., B.S.Ed., A.A.S., A.A., M.S. For a concentration/track/specialization/option this is the PARENT degree-granting program's degree abbreviation. If the entry only says 'Minor' or 'Certificate' (no degree abbreviation), use that word here." },
          parent_program_name: { type: "string", description: "For a concentration/track/specialization/option: the degree-granting PARENT program name as shown, e.g. 'Health Science' for 'Applied Health Studies' under 'Health Science (B.S.)'; 'Biology' for 'Fisheries and Aquatic Biology' under 'Biology (B.S.)'; 'Business Administration' for 'Information Technology and Analytics' under 'Business Administration (B.S.B.A.)'. Strip any trailing degree parenthetical like '(B.S.)'. Empty for a major." },
          parent_program_source_url: { type: "string", description: "URL of the parent degree-granting program page when known." },
          normalized_name: { type: "string", description: "Short searchable category" },
          credits_required: { type: "number" },
          cip_code: { type: "string" },
          source_url: { type: "string", description: "The detail-page URL (the entry's own anchor href) this record was confirmed from. Must be an absolute URL." },
        },
        required: ["program_name", "degree_type", "offering_type", "source_url"],
      },
    },
  },
  required: ["programs"],
};

function cleanPrograms(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => ({
      ...p,
      program_name: String(p.program_name || "").trim(),
      degree_type: String(p.degree_type || "").trim(),
      offering_type: String(p.offering_type || "major").trim().toLowerCase(),
      parent_program_name: String(p.parent_program_name || "").trim(),
      parent_program_source_url: String(p.parent_program_source_url || "").trim(),
      source_url: String(p.source_url || "").trim(),
    }))
    .filter((p) => p.program_name && p.degree_type && p.offering_type);
}

function resolveUrl(href, base) {
  if (!href) return "";
  const h = String(href).trim();
  if (!h || h.startsWith("#") || h.startsWith("javascript:") || h.startsWith("mailto:")) return "";
  try {
    return new URL(h, base).href;
  } catch {
    return "";
  }
}

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}

// Directory prefix of a URL's path, with trailing slash. For an index at
// https://x.edu/academics/programs this is "/academics/programs/"; program
// detail pages live at prefix + <slug>.
function dirPrefix(url) {
  try {
    let p = new URL(url).pathname;
    if (!p.endsWith("/")) p = p.substring(0, p.lastIndexOf("/") + 1);
    return p || "/";
  } catch { return "/"; }
}

async function fetchPage(url) {
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

function stripNoise(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAnchors(html) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const text = stripNoise(m[2] || "").trim();
    if (href && text) out.push({ href, text });
  }
  return out;
}

// Classify a harvested anchor URL relative to the program directory prefix.
//   "program"    -> a program detail leaf (prefix + single slug)
//   "branch"     -> a college/category/catalog sub-index or subdirectory to recurse into
//   "pagination" -> a query-string pagination/filter URL leading to more programs
//   "skip"       -> unrelated
function classifyLink(abs, prefix, baseHost) {
  if (!abs) return "skip";
  let u;
  try { u = new URL(abs); } catch { return "skip"; }
  if (u.hostname !== baseHost) return "skip";
  const path = u.pathname;
  const q = u.search || "";
  if (q && /[?&](page|p|start|offset|pg|college|category|cat|type|level|area|view|show|alpha|letter)=/i.test(q)) {
    return "pagination";
  }
  if (prefix && path.startsWith(prefix)) {
    const rest = path.substring(prefix.length);
    if (!rest) return "skip";
    if (!rest.includes("/")) {
      // single slug directly under the program directory
      return BRANCH_KEYWORDS.test(rest) ? "branch" : "program";
    }
    // subdirectory under the program directory -> recurse (college sub-index)
    return "branch";
  }
  // broader academics branch on the same domain
  if (/\/academics/i.test(path) && BRANCH_KEYWORDS.test(path)) return "branch";
  return "skip";
}

function chunkText(text, cap, overlap) {
  if (!text) return [];
  if (text.length <= cap) return [text];
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + cap));
    if (i + cap >= text.length) break;
    i += cap - overlap;
  }
  return chunks;
}

export default async function (req) {
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
    const { institution_id, catalog_year, refresh } = body || {};
    if (!institution_id || typeof institution_id !== "string") {
      return Response.json({ error: "institution_id is required" }, { status: 400 });
    }

    let inst;
    try {
      inst = await base44.entities.Institution.get(institution_id);
    } catch {
      inst = null;
    }
    if (!inst || inst.verification_status !== "verified") {
      return Response.json({ error: "Institution is not available or not verified." }, { status: 400 });
    }

    const existingVerified = await base44.asServiceRole.entities.Program.filter(
      { institution_id, verification_status: "verified" }, "program_name", 500
    );
    if (existingVerified.length > 0 && !refresh) {
      return Response.json({
        status: "available",
        message: "Verified programs already exist for this institution.",
        verified_count: existingVerified.length,
        discovery_status: inst.discovery_status || "complete",
      });
    }

    await base44.asServiceRole.entities.Institution.update(inst.id, {
      discovery_status: "crawling",
      last_discovered_at: new Date().toISOString(),
    });

    const year = catalog_year || "2026-2027";
    const location = [inst.city, inst.state].filter(Boolean).join(", ");

    // 1. Find the official programs index URL.
    let programsUrl = "";
    let catalogUrl = "";
    try {
      const urlRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt:
          `Find the official academic programs directory URL for "${inst.name}"` +
          (location ? ` (${location})` : "") +
          (inst.website ? ` (website: ${inst.website})` : "") +
          `. Look for a page like "/academics/programs" or "/programs" that lists the school's majors/programs. ` +
          `Return the exact URL in programs_url and the official catalog URL (if different) in catalog_url.`,
        add_context_from_internet: true,
        model: "gemini_3_flash",
        response_json_schema: URL_SCHEMA,
      });
      programsUrl = (urlRes && String(urlRes.programs_url || "").trim()) || "";
      catalogUrl = (urlRes && String(urlRes.catalog_url || "").trim()) || "";
    } catch {
      programsUrl = "";
    }
    if (!programsUrl) {
      await base44.asServiceRole.entities.Institution.update(inst.id, {
        discovery_status: "no_official_source",
        last_discovered_at: new Date().toISOString(),
      });
      return Response.json({
        status: "not_found",
        discovery_status: "no_official_source",
        message: `Could not find an official programs page for ${inst.name}.`,
      });
    }

    const baseHost = hostnameOf(programsUrl);
    const prefix = dirPrefix(programsUrl);

    // 2. Recursive crawl over the official domain.
    //    BRANCH pages (college/category/catalog sub-indexes) are followed first —
    //    they're the real completeness risk (programs not on the main index).
    //    PAGINATION/filter links (?letter=A, ?page=2) only partition the SAME
    //    index, so they're followed only when the index looks paginated (few
    //    programs on the main page) and skipped once the index is clearly
    //    comprehensive. Program detail links are harvested by regex (no LLM cap);
    //    all fetched official HTML is accumulated for chunked classification.
    const programLinks = new Map();   // href -> { name, href }
    const visited = new Set();
    const queuedAll = new Set([programsUrl]);
    let pageHtmlStore = "";
    let htmlCapped = false;
    let linkCapHit = false;
    let pagesVisited = 0;
    const branchQueue = [];
    const paginationQueue = [];

    async function crawlPage(url) {
      visited.add(url);
      pagesVisited++;
      const html = await fetchPage(url);
      if (!html) return;
      const clean = stripNoise(html);
      if (clean && pageHtmlStore.length < PAGE_HTML_CAP) {
        const room = PAGE_HTML_CAP - pageHtmlStore.length;
        pageHtmlStore += (pageHtmlStore ? " " : "") + clean.slice(0, room);
        if (pageHtmlStore.length >= PAGE_HTML_CAP) htmlCapped = true;
      }
      for (const a of extractAnchors(html)) {
        const abs = resolveUrl(a.href, url);
        if (!abs) continue;
        const kind = classifyLink(abs, prefix, baseHost);
        if (kind === "program") {
          if (!programLinks.has(abs)) {
            if (programLinks.size >= MAX_PROGRAM_LINKS) { linkCapHit = true; continue; }
            programLinks.set(abs, { name: a.text, href: abs });
          }
        } else if (kind === "branch" || kind === "pagination") {
          if (!visited.has(abs) && !queuedAll.has(abs)) {
            queuedAll.add(abs);
            if (kind === "branch") branchQueue.push(abs);
            else paginationQueue.push(abs);
          }
        }
      }
    }

    // Index first.
    await crawlPage(programsUrl);

    // Branches: college/category/catalog sub-indexes (real completeness risk).
    const MAX_BRANCH_PAGES = 18;
    while (branchQueue.length && pagesVisited < MAX_INDEX_PAGES && pagesVisited < 1 + MAX_BRANCH_PAGES) {
      const batch = branchQueue.splice(0, FETCH_CONCURRENCY);
      await Promise.all(batch.map((u) => crawlPage(u)));
    }
    const branchesExhausted = branchQueue.length === 0;

    // Pagination/filter: only if the index + branches look paginated (few
    // programs found), since these links partition the same index. Stop early
    // once the index is clearly comprehensive.
    const MAX_PAGINATION_PAGES = 6;
    while (
      paginationQueue.length &&
      programLinks.size < 30 &&
      pagesVisited < MAX_INDEX_PAGES &&
      pagesVisited - 1 - Math.min(MAX_BRANCH_PAGES, branchesExhausted ? 0 : 0) < 1 + MAX_BRANCH_PAGES + MAX_PAGINATION_PAGES
    ) {
      const batch = paginationQueue.splice(0, FETCH_CONCURRENCY);
      await Promise.all(batch.map((u) => crawlPage(u)));
      if (programLinks.size >= 30) break; // index is comprehensive — stop partitioning
    }
    const bfsExhausted = branchesExhausted && !linkCapHit && !htmlCapped;

    if (programLinks.size === 0 && !pageHtmlStore) {
      await base44.asServiceRole.entities.Institution.update(inst.id, {
        discovery_status: "failed",
        discovered_count: 0,
        last_discovered_at: new Date().toISOString(),
        discovery_source_url: programsUrl,
      });
      return Response.json({
        status: "not_found",
        discovery_status: "failed",
        message: `Could not find reliable program information for ${inst.name} from an official source.`,
      });
    }

    // 3. Classify the COMPLETE accumulated official HTML in chunks. The official
    //    programs directory includes each entry's "Degrees & Offerings"
    //    classification, so chunked classification yields the full inventory
    //    (majors, concentrations, minors, certificates) authoritatively.
    let programs = [];
    if (pageHtmlStore) {
      const chunks = chunkText(pageHtmlStore, CHUNK_CAP, CHUNK_OVERLAP);
      const seenSrc = new Set();
      for (const chunk of chunks) {
        try {
          const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt:
              `The following is HTML from the official academic programs directory of "${inst.name}". ` +
              `It lists the school's programs (majors, concentrations, minors, certificates, etc.), each with its ` +
              `"Degrees & Offerings" classification. Extract EVERY program entry visible in this HTML. ` +
              `For each program return: program_name (the offering's own name as shown), degree_type ` +
              `(Associate|Bachelor|Master|Doctorate|Certificate|Diploma), offering_type from the official ` +
              `"Degrees & Offerings" classification (major|concentration|minor|certificate|track|specialization|option|endorsement|pre-professional|other — ONLY a degree-granting program is "major"; any non-major type is NEVER "major"), ` +
              `official_degree_name (the degree abbreviation e.g. B.S., B.A., B.S.B.A., B.S.Ed., A.A.S., A.A.; for a concentration/track this is the PARENT program's degree; if the entry shows "Minor"/"Certificate" as the label, use that word), ` +
              `parent_program_name (for a concentration/track/specialization/option: the degree-granting PARENT program name shown, e.g. "Health Science" for "Applied Health Studies" under "Health Science (B.S.)" and "Business Administration" for a concentration under "Business Administration (B.S.B.A.)"; strip any "(B.S.)" parenthetical; empty for a major), ` +
              `parent_program_source_url, normalized_name, credits_required, cip_code, ` +
              `source_url (the entry's own anchor href, an absolute URL). ` +
              `If an entry is not actually a program, omit it. Do not invent programs not present in the HTML.\n\nHTML:\n${chunk}`,
            response_json_schema: CLASSIFY_SCHEMA,
            model: "gemini_3_flash",
          });
          for (const p of cleanPrograms(res?.programs || [])) {
            const key = (p.source_url || "") + "::" + p.program_name.toLowerCase();
            if (!seenSrc.has(key)) {
              seenSrc.add(key);
              programs.push(p);
            }
          }
        } catch {
          // a single chunk failure shouldn't abort the whole classification
        }
      }
    }

    // 4. Fallback: if the directory pages lacked per-program classification
    //    (sparse), verify the unclassified harvested detail links in batches.
    const classifiedHrefs = new Set(programs.map((p) => p.source_url));
    const uncoveredLinks = [...programLinks.values()].filter(
      (l) => !classifiedHrefs.has(l.href)
    );
    let detailFailures = 0;
    let usedFallback = false;

    if (programs.length === 0 && uncoveredLinks.length > 0) {
      usedFallback = true;
      const targets = uncoveredLinks.slice(0, DETAIL_FALLBACK_CAP);
      for (let i = 0; i < targets.length; i += DETAIL_BATCH) {
        const batchLinks = targets.slice(i, i + DETAIL_BATCH);
        const htmls = await Promise.all(batchLinks.map((l) => fetchPage(l.href)));
        const pages = [];
        batchLinks.forEach((l, idx) => {
          if (htmls[idx]) pages.push({ url: l.href, html: htmls[idx] });
          else detailFailures++;
        });
        if (!pages.length) continue;
        try {
          let prompt =
            `The following are ${pages.length} official program detail pages from "${inst.name}". ` +
            `For each page, determine the offering's classification from the school's official ` +
            `"Degrees & Offerings" section — NOT from the page title or URL. Return a JSON "programs" array; for each: ` +
            `program_name, degree_type (Associate|Bachelor|Master|Doctorate|Certificate|Diploma), ` +
            `offering_type (major|concentration|minor|certificate|track|specialization|option|endorsement|pre-professional|other — any non-major type is NEVER "major"), ` +
            `official_degree_name, parent_program_name (parent degree-granting program for a concentration/track/etc., empty for a major), ` +
            `parent_program_source_url, normalized_name, credits_required, cip_code, source_url (the page URL shown). ` +
            `If a page is not actually a program, omit it.\n\n`;
          pages.forEach((p, idx) => {
            prompt += `=== PAGE ${idx + 1} URL: ${p.url} ===\n${stripNoise(p.html).slice(0, DETAIL_HTML_CAP)}\n\n`;
          });
          const progs = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt,
            response_json_schema: CLASSIFY_SCHEMA,
            model: "gemini_3_flash",
          });
          for (const p of cleanPrograms(progs?.programs || [])) {
            if (!p.source_url) p.source_url = pages.find((pg) => pg.url)?.url || programsUrl;
            programs.push(p);
          }
        } catch {
          detailFailures += pages.length;
        }
      }
    }

    if (programs.length === 0) {
      await base44.asServiceRole.entities.Institution.update(inst.id, {
        discovery_status: "failed",
        discovered_count: programLinks.size,
        last_discovered_at: new Date().toISOString(),
        discovery_source_url: programsUrl,
      });
      return Response.json({
        status: "not_found",
        discovery_status: "failed",
        message: `Could not extract reliable program information for ${inst.name} from an official source.`,
      });
    }

    // Ensure a verified catalog.
    let catalog = (await base44.asServiceRole.entities.Catalog.filter(
      { institution_id, verification_status: "verified" }, "-catalog_year", 1
    ))[0];
    if (!catalog) {
      catalog = await base44.asServiceRole.entities.Catalog.create({
        institution_id: inst.id,
        catalog_year: year,
        source_url: catalogUrl || programsUrl || inst.website || "",
        verification_status: "verified",
        last_verified: new Date().toISOString().slice(0, 10),
        active: true,
      });
    }

    // --- Parent-major synthesis -------------------------------------------------
    const stripDegreeParen = (s) => String(s || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    const majorDupKey = (p) =>
      `${p.program_name}::${p.degree_type}::${p.official_degree_name || ""}`.toLowerCase();
    const existingMajorKeys = new Set(
      programs.filter((p) => p.offering_type === MAJOR).map(majorDupKey)
    );
    const synthesizedMajors = [];
    for (const p of programs) {
      if (p.offering_type === MAJOR) continue;
      const pmn = stripDegreeParen(p.parent_program_name);
      if (!pmn) continue;
      const key = `${pmn}::${p.degree_type}::${p.official_degree_name || ""}`.toLowerCase();
      if (existingMajorKeys.has(key)) continue;
      existingMajorKeys.add(key);
      synthesizedMajors.push({
        program_name: pmn,
        degree_type: p.degree_type,
        offering_type: MAJOR,
        official_degree_name: p.official_degree_name || "",
        normalized_name: pmn,
        credits_required: 0,
        cip_code: "",
        source_url: p.parent_program_source_url || p.source_url || "",
      });
    }
    if (synthesizedMajors.length) programs = [...programs, ...synthesizedMajors];

    // Dedup against existing programs.
    const existingAll = await base44.asServiceRole.entities.Program.filter(
      { institution_id }, "program_name", 1000
    );
    const dupKey = (p) =>
      `${p.program_name}::${p.degree_type}::${p.offering_type}::${p.official_degree_name || ""}::${stripDegreeParen(p.parent_program_name)}`.toLowerCase();
    const existingKeys = new Set(existingAll.map(dupKey));

    const today = new Date().toISOString().slice(0, 10);
    const toCreate = programs.filter((p) => !existingKeys.has(dupKey(p)));
    let verifiedCount = 0;
    let pendingCount = 0;

    if (toCreate.length) {
      await base44.asServiceRole.entities.Program.bulkCreate(
        toCreate.map((p) => {
          const isMajor = p.offering_type === MAJOR;
          if (isMajor) verifiedCount++;
          else pendingCount++;
          return {
            institution_id: inst.id,
            catalog_id: catalog.id,
            degree_type: p.degree_type,
            program_name: p.program_name,
            display_name: p.program_name,
            normalized_name: p.normalized_name || "",
            normalized_category: p.normalized_name || "",
            offering_type: p.offering_type,
            official_degree_name: p.official_degree_name || "",
            parent_program_name: isMajor ? "" : stripDegreeParen(p.parent_program_name),
            parent_program_source_url: p.parent_program_source_url || "",
            source: "official_institution",
            credits_required: p.credits_required || 0,
            cip_code: p.cip_code || "",
            external_program_id: "",
            source_url: p.source_url || catalogUrl || programsUrl || "",
            verification_status: isMajor ? "verified" : "pending",
            active: isMajor ? true : false,
            last_verified: isMajor ? today : "",
          };
        })
      );
    }

    // --- Link non-majors to their parent major record --------------------------
    const allInstPrograms = await base44.asServiceRole.entities.Program.filter(
      { institution_id }, "program_name", 1000
    );
    const majorIdMap = new Map();
    for (const p of allInstPrograms) {
      if (p.offering_type === MAJOR) {
        const k = `${p.program_name}::${p.degree_type}::${p.official_degree_name || ""}`.toLowerCase();
        if (!majorIdMap.has(k)) majorIdMap.set(k, p.id);
      }
    }
    const linkUpdates = [];
    for (const p of allInstPrograms) {
      if (p.offering_type === MAJOR) continue;
      const pmn = stripDegreeParen(p.parent_program_name);
      if (!pmn) continue;
      const k = `${pmn}::${p.degree_type}::${p.official_degree_name || ""}`.toLowerCase();
      const pid = majorIdMap.get(k);
      if (pid && pid !== p.parent_program_id) linkUpdates.push({ id: p.id, parent_program_id: pid });
    }
    if (linkUpdates.length) {
      await base44.asServiceRole.entities.Program.bulkUpdate(linkUpdates);
    }

    const existingNonMajor = existingAll.filter((p) => p.verification_status !== "verified").length;
    const totalVerifiedMajors = existingVerified.length + verifiedCount;
    const totalNonMajors = existingNonMajor + pendingCount;

    const discovery_status =
      bfsExhausted && !htmlCapped && !linkCapHit && !usedFallback && detailFailures === 0
        ? "complete"
        : "partial";

    await base44.asServiceRole.entities.Institution.update(inst.id, {
      discovery_status,
      discovered_count: programLinks.size,
      verified_major_count: totalVerifiedMajors,
      non_major_count: totalNonMajors,
      last_discovered_at: new Date().toISOString(),
      discovery_source_url: programsUrl,
    });

    return Response.json({
      status: "available",
      discovery_status,
      message: `Found ${totalVerifiedMajors} major(s) for ${inst.name}.`,
      discovered: programLinks.size,
      verified: totalVerifiedMajors,
      non_major: totalNonMajors,
      pending_created: pendingCount,
      source: programsUrl,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Discovery failed" }, { status: 500 });
  }
}