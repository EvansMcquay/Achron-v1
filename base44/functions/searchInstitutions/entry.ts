import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// National institution search — resolves against the LOCAL IPEDS-backed
// Institution cache. No AI for normal searches.
//
// Supports: exact / partial institution name, common abbreviations
// (short_name), aliases (incl. "PSU", "CCP", "ACC", "Pitt"), city, and UnitID
// (external_id). Optional filters: state, institution_type, control.
//
// The IPEDS import (importIpedsInstitutions) is the authoritative source for
// institution EXISTENCE. AI discovery (discoverInstitution) remains available as
// a SEPARATE enrichment/fallback the UI offers only when the cache has no match
// — students never author institution data directly through this function.
//
// Security: reads verified+active institutions through the service role; RLS
// already exposes verified institutions to authenticated students and hides
// pending ones to all but admins. This function creates/updates nothing.

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rankList(list, q) {
  const ql = q.toLowerCase();
  return list
    .map((i) => {
      const name = (i.name || "").toLowerCase();
      const disp = (i.display_name || "").toLowerCase();
      const short = (i.short_name || "").toLowerCase();
      const aliases = Array.isArray(i.aliases)
        ? i.aliases.map((a) => String(a).toLowerCase())
        : [];
      const aliasExact = aliases.includes(ql) || short === ql;
      const aliasStart = aliasExact || short.startsWith(ql) || aliases.some((a) => a.startsWith(ql));
      let score;
      if (name === ql || disp === ql || aliasExact) score = 0;
      else if (name.startsWith(ql) || disp.startsWith(ql) || aliasStart) score = 1;
      else if (name.includes(ql) || disp.includes(ql)) score = 2;
      else score = 3;
      return { i, score, name: i.name || "" };
    })
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .map((x) => x.i);
}

// Light abbreviation expansion so "Austin CC" matches "Austin Community College"
// and "Texas A&M" matches "Texas A & M". Keeps the original query as a variant.
function expandQuery(q) {
  const variants = new Set([q]);
  variants.add(q.replace(/\bCC\b/gi, "Community College"));
  variants.add(q.replace(/\bA&M\b/gi, "A & M"));
  return [...variants].filter(Boolean);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let body;
    try { body = await req.json(); } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { query, state, institution_type, control } = body || {};
    const q = String(query || "").trim();
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 50);
    const offset = Math.max(Number(body.offset) || 0, 0);

    if (q.length < 2) {
      return Response.json({
        results: [], total: 0, discovered: 0, pending_requested: 0, has_more: false,
      });
    }

    const isNumeric = /^\d{3,8}$/.test(q);

    const baseFilter = { verification_status: "verified", active: true };
    if (state) baseFilter.state = String(state).trim();
    if (institution_type) baseFilter.institution_type = String(institution_type).trim();
    if (control) baseFilter.control = String(control).trim();

    const orClauses = [];
    for (const v of expandQuery(q)) {
      const ev = escapeRegex(v);
      orClauses.push({ name: { $regex: ev, $options: "i" } });
      orClauses.push({ display_name: { $regex: ev, $options: "i" } });
      orClauses.push({ short_name: { $regex: ev, $options: "i" } });
      orClauses.push({ aliases: { $regex: ev, $options: "i" } });
      orClauses.push({ city: { $regex: ev, $options: "i" } });
    }
    if (isNumeric) orClauses.push({ external_id: q });

    let results;
    try {
      results = await base44.asServiceRole.entities.Institution.filter(
        { ...baseFilter, $or: orClauses }, "name", 100
      );
    } catch {
      // Fallback if $or / array-regex unsupported by the query engine.
      const fq2 = isNumeric
        ? { ...baseFilter, external_id: q }
        : { ...baseFilter, name: { $regex: escapeRegex(q), $options: "i" } };
      results = await base44.asServiceRole.entities.Institution.filter(fq2, "name", 100);
    }

    const ranked = rankList(results, q);
    const paged = ranked.slice(offset, offset + limit);

    return Response.json({
      results: paged,
      total: ranked.length,
      discovered: 0,
      pending_requested: 0,
      has_more: offset + limit < ranked.length,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Search failed" }, { status: 500 });
  }
}