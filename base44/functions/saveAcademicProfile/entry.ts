import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Authoritative write path for a student's AcademicProfile. It is the ONLY way
// the institution / catalog / program references should be persisted, because it
// validates the full chain server-side before writing:
//
//   Institution (verified) -> Catalog (verified, belongs to institution)
//                          -> Program  (verified, belongs to catalog)
//
// This enforces two rules the UI alone cannot guarantee:
//   1. A student can never bind their profile to a pending/rejected institution
//      or program — even by crafting the IDs. RLS already hides pending records
//      from student reads, so the lookups below simply fail for them.
//   2. A student can never save an invalid combination (School B + Program A):
//      catalog.institution_id and program.catalog_id must agree.
//
// It also refreshes the denormalized display snapshots from the authoritative
// entities (IDs = truth, snapshots = display). It deliberately does NOT require
// the catalog to be `active` — a superseded (historical) catalog stays valid for
// an existing student's record; "inactive" only means "not selectable for new
// students".

async function getVerified(getFn, id) {
  if (!id || typeof id !== "string") return null;
  let rec;
  try {
    rec = await getFn(id);
  } catch {
    return null;
  }
  return rec && rec.verification_status === "verified" ? rec : null;
}

export default async function(req) {
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

    const { profile_id, data } = body || {};
    if (!data || typeof data !== "object") {
      return Response.json({ error: "data is required" }, { status: 400 });
    }

    const { institution_id, catalog_id, program_id, manual_mode } = data;
    const isManual = manual_mode === true;
    if (!institution_id) {
      return Response.json(
        { error: "institution_id is required" },
        { status: 400 }
      );
    }

    // The Institution is ALWAYS validated (RLS-enforced): a student can only
    // resolve a verified institution. There is never a free-text school.
    const institution = await getVerified(
      (id) => base44.entities.Institution.get(id),
      institution_id
    );
    if (!institution) {
      return Response.json(
        { error: "Institution is not available or not yet verified." },
        { status: 400 }
      );
    }

    // `manual_mode` lets a student finish onboarding when their school is
    // verified but its catalog/program is not yet. The institution is bound;
    // catalog_id/program_id are cleared (pending). The student never binds to
    // an unverified catalog/program, and never supplies a free-text major.
    let payload = { ...data };

    if (isManual && !catalog_id && !program_id) {
      payload.institution = institution.name;
      payload.catalog_id = null;
      payload.program_id = null;
    } else {
      if (!catalog_id || !program_id) {
        return Response.json(
          { error: "institution_id, catalog_id, and program_id are required" },
          { status: 400 }
        );
      }
      // Validate the chain. These run as the app user, so RLS applies: a
      // student can only resolve verified records. A pending/rejected ID (or
      // a foreign ID the student cannot read) returns null here and is rejected.
      const catalog = await getVerified(
        (id) => base44.entities.Catalog.get(id),
        catalog_id
      );
      if (!catalog) {
        return Response.json(
          { error: "Catalog is not available or not yet verified." },
          { status: 400 }
        );
      }
      if (catalog.institution_id !== institution_id) {
        return Response.json(
          { error: "Catalog does not belong to the selected institution." },
          { status: 400 }
        );
      }
      const program = await getVerified(
        (id) => base44.entities.Program.get(id),
        program_id
      );
      if (!program) {
        return Response.json(
          { error: "Program is not available or not yet verified." },
          { status: 400 }
        );
      }
      if (program.catalog_id !== catalog_id) {
        return Response.json(
          { error: "Program does not belong to the selected catalog." },
          { status: 400 }
        );
      }
      if (program.institution_id !== institution_id) {
        return Response.json(
          { error: "Program does not belong to the selected institution." },
          { status: 400 }
        );
      }
      // The degree type the student selected must match the program's actual
      // degree type. A crafted frontend cannot pair a major with the wrong
      // degree level (e.g. a Bachelor program submitted as "Master").
      if (data.degree_type && program.degree_type !== data.degree_type) {
        return Response.json(
          { error: "Program does not match the selected degree type." },
          { status: 400 }
        );
      }
      // Only degree-granting majors may be bound to a profile. Concentrations,
      // minors, certificates, tracks, and specializations are never selectable.
      if (program.offering_type && program.offering_type !== "major") {
        return Response.json(
          { error: "Program is not a degree-granting major." },
          { status: 400 }
        );
      }
      // Refresh denormalized display snapshots from the authoritative entities.
      payload.institution = institution.name;
      payload.catalog_year = catalog.catalog_year;
      payload.degree_type = program.degree_type;
      payload.major = program.program_name;
      payload.program_name = program.program_name;
      payload.credits_required = program.credits_required;
    }

    // Write as the user (owner-scoped via RLS). A foreign profile_id is rejected
    // by the owner update rule, so a student cannot overwrite another student's
    // profile by passing their id.
    let saved;
    if (profile_id) {
      saved = await base44.entities.AcademicProfile.update(profile_id, payload);
    } else {
      saved = await base44.entities.AcademicProfile.create(payload);
    }

    return Response.json({ status: "success", profile: saved });
  } catch (error) {
    return Response.json({ error: error.message || "Save failed" }, { status: 500 });
  }
}