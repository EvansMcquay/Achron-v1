import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Achron National Program coverage report (admin-only).
//
// Reports program coverage across every verified Institution, broken down by
// provenance tier (official_verified vs national_baseline vs manual), degree
// level, and CIP family — the layers described in the Achron national-coverage
// architecture.
//
// Institutions are paginated by a `name` > cursor (reaches beyond the 5000-record
// page cap). Programs are read in a single high page for now (MVP counts are
// small); full program pagination is a follow-up once programs exceed the cap.

const PAGE = 500;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const statusCounts = { complete: 0, partial: 0, failed: 0, no_official_source: 0, crawling: 0, pending: 0 };
    let withMajors = 0, zeroMajors = 0, noSource = 0, totalInstitutions = 0, withUnitId = 0;
    const perInstitution = [];

    let cursor = null;
    while (true) {
      const q = { verification_status: "verified" };
      if (cursor !== null) q.name = { $gt: cursor };
      const page = await base44.asServiceRole.entities.Institution.filter(q, "name", PAGE);
      if (!page.length) break;
      totalInstitutions += page.length;
      for (const i of page) {
        const s = i.discovery_status;
        if (s && statusCounts[s] !== undefined) statusCounts[s]++;
        else statusCounts.pending++;
        if (i.external_id) withUnitId++;
        if ((i.verified_major_count || 0) > 0) withMajors++; else zeroMajors++;
        if (!i.discovery_source_url) noSource++;
        if (s || (i.verified_major_count || 0) > 0) {
          perInstitution.push({
            id: i.id,
            name: i.name,
            unitid: i.external_id || "",
            official_source: i.discovery_source_url || i.website || "",
            verified_majors: i.verified_major_count || 0,
            non_majors: i.non_major_count || 0,
            status: s || "pending",
            last_verified: i.last_verified || i.last_discovered_at || "",
          });
        }
      }
      const last = page[page.length - 1];
      if (!last || !last.name) break;
      cursor = last.name;
      if (page.length < PAGE) break;
    }

    // Programs: single high page (MVP; counts are small now).
    const programs = await base44.asServiceRole.entities.Program.list("created_date", 5000);

    // Provenance tiers.
    let officialVerified = 0, nationalBaseline = 0, pendingPrograms = 0, otherPrograms = 0;
    let verifiedMajors = 0, baselineMajors = 0;
    const byLevel = { certificate: 0, associate: 0, bachelor: 0, master: 0, doctorate: 0, unknown: 0 };
    const byCipFamily = {};
    const byType = { major: 0, concentration: 0, minor: 0, certificate: 0, track: 0, specialization: 0, option: 0, endorsement: 0, "pre-professional": 0, other: 0 };

    for (const p of programs) {
      const t = p.offering_type || "major";
      if (byType[t] !== undefined) byType[t]++; else byType.other++;

      if (p.verification_status === "verified") { officialVerified++; if (t === "major") verifiedMajors++; }
      else if (p.verification_status === "national_baseline") { nationalBaseline++; if (t === "major") baselineMajors++; }
      else if (p.verification_status === "pending") pendingPrograms++;
      else otherPrograms++;

      const lvl = p.degree_level || "unknown";
      byLevel[lvl] = (byLevel[lvl] || 0) + 1;

      if (p.cip_code) {
        const fam = String(p.cip_code).slice(0, 2);
        byCipFamily[fam] = (byCipFamily[fam] || 0) + 1;
      }
    }

    const cipFamilies = Object.entries(byCipFamily)
      .map(([fam, count]) => ({ cip_family: fam, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    perInstitution.sort((a, b) => b.verified_majors - a.verified_majors);

    const manualProfiles = await base44.asServiceRole.entities.AcademicProfile.filter(
      { manual_mode: true }, "created_date", 500
    );

    return Response.json({
      report: {
        institutions_scanned: totalInstitutions,
        institutions_capped: false,
        institutions_with_iped_unitid: withUnitId,
        complete: statusCounts.complete,
        partial: statusCounts.partial,
        failed: statusCounts.failed,
        no_official_source: statusCounts.no_official_source,
        crawling: statusCounts.crawling,
        pending: statusCounts.pending,
        institutions_with_majors: withMajors,
        institutions_zero_majors: zeroMajors,
        institutions_without_official_source: noSource,
        // Provenance tiers
        total_programs: programs.length,
        programs_capped: programs.length >= 5000,
        official_verified_programs: officialVerified,
        national_baseline_programs: nationalBaseline,
        programs_pending_review: pendingPrograms,
        other_programs: otherPrograms,
        // Majors specifically
        total_verified_majors: verifiedMajors,
        total_national_baseline_majors: baselineMajors,
        total_concentrations: byType.concentration,
        total_minors: byType.minor,
        total_certificates: byType.certificate,
        total_other_offerings: byType.track + byType.specialization + byType.option + byType.endorsement + byType["pre-professional"] + byType.other,
        // Breakdowns
        by_degree_level: byLevel,
        by_cip_family: cipFamilies,
        manual_majors: manualProfiles.length,
      },
      per_institution: perInstitution.slice(0, 500),
    });
  } catch (error) {
    return Response.json({ error: error.message || "Report failed" }, { status: 500 });
  }
}