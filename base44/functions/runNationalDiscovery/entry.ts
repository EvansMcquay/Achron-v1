import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// National program discovery orchestrator (admin-only).
//
// Processes a bounded batch of verified Institutions that still need official
// program discovery, invoking the per-institution discoverPrograms function
// for each. Re-invokable; each call processes up to `limit` institutions
// (default 3) so a single call stays inside the function timeout. Progresses
// naturally: processed institutions are filtered out of subsequent batches.
//
// Options:
//   limit            max institutions to crawl this call (1-50, default 3)
//   refresh          re-crawl even institutions that already have majors
//   dry_run          return the selected batch without crawling (preview)
//   institution_ids  target specific institution ids instead of auto-selecting
//
// Never deletes existing verified programs — refresh re-crawls and dedups.

const SKIP_STATUS = new Set(["complete", "crawling"]);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    let body;
    try { body = await req.json(); } catch { body = {}; }
    const { refresh = false, dry_run = false, institution_ids } = body || {};
    const cap = Math.max(1, Math.min(50, Number(body?.limit) || 2));

    let batch;
    if (Array.isArray(institution_ids) && institution_ids.length) {
      batch = [];
      for (const id of institution_ids.slice(0, cap)) {
        try {
          const inst = await base44.asServiceRole.entities.Institution.get(id);
          if (inst && inst.verification_status === "verified") batch.push(inst);
        } catch {}
      }
    } else {
      // Cursor-paginate (name $gt) so the orchestrator can reach EVERY institution
      // beyond the 5000-record page cap, without loading all into memory at once.
      batch = [];
      let cursor = null;
      while (batch.length < cap) {
        const q = { verification_status: "verified" };
        if (cursor !== null) q.name = { $gt: cursor };
        const page = await base44.asServiceRole.entities.Institution.filter(q, "name", 500);
        if (!page.length) break;
        for (const i of page) {
          if (!SKIP_STATUS.has(i.discovery_status) && (refresh || !(i.verified_major_count > 0))) {
            batch.push(i);
            if (batch.length >= cap) break;
          }
        }
        const last = page[page.length - 1];
        if (!last || !last.name) break;
        cursor = last.name;
        if (page.length < 500) break;
      }
    }

    if (dry_run) {
      return Response.json({
        dry_run: true,
        count: batch.length,
        selected: batch.map((i) => ({
          id: i.id,
          name: i.name,
          discovery_status: i.discovery_status || null,
          verified_major_count: i.verified_major_count || 0,
        })),
      });
    }

    // Rescue schools stranded at "crawling" by a previous run that died or timed
    // out, so they're retried (failed is selectable) instead of stuck forever.
    await base44.asServiceRole.entities.Institution.updateMany(
      { discovery_status: "crawling" },
      { $set: { discovery_status: "failed" } }
    ).catch(() => {});

    const results = [];
    for (const inst of batch) {
      const willCrawl = refresh || !(inst.verified_major_count > 0);
      if (willCrawl) {
        await base44.asServiceRole.entities.Institution.update(inst.id, {
          discovery_status: "crawling",
          last_discovered_at: new Date().toISOString(),
        });
      }
      try {
        const res = await base44.functions.invoke("discoverPrograms", {
          institution_id: inst.id,
          refresh,
        });
        const data = res?.data || res || {};
        results.push({
          id: inst.id,
          name: inst.name,
          status: data.status,
          discovery_status: data.discovery_status,
          verified: data.verified,
          non_major: data.non_major,
          message: data.message,
        });
      } catch (e) {
        // A timed-out / crashed crawl must not strand the institution at
        // "crawling" (which is skipped forever). Reset to "failed" so it is
        // retryable in a later batch.
        if (willCrawl) {
          await base44.asServiceRole.entities.Institution.update(inst.id, {
            discovery_status: "failed",
            last_discovered_at: new Date().toISOString(),
          }).catch(() => {});
        }
        results.push({
          id: inst.id,
          name: inst.name,
          status: "error",
          error: (e && e.message) || "Discovery call failed",
        });
      }
    }

    return Response.json({ processed: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message || "Orchestrator failed" }, { status: 500 });
  }
}