import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { evaluateProgress } from '../../shared/degree-engine.ts';

// Deterministic Degree / Requirement Progress computation. No LLM, no writes.
//
// Two modes:
//   1. profile_id  -> reads the student's verified chain + their courses, then
//                     evaluates. RLS enforces: students only read their own profile
//                     and courses, and only verified program/catalog records.
//   2. program_id  -> reads (or accepts overrides for) groups/requirements/courses.
//                     Powers "what-if" planning and deterministic test scenarios.
//
// Both paths use user-scoped reads so the existing Institution -> Catalog ->
// Program security boundaries apply automatically.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let body;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const {
      profile_id,
      program_id,
      catalog_id,
      courses: overrideCourses,
      groups: overrideGroups,
      requirements: overrideRequirements,
    } = body || {};

    let program, catalog, groups, requirements, courses;

    if (profile_id) {
      // Student mode: read their own profile + verified chain (RLS-enforced).
      const profile = await base44.entities.AcademicProfile.get(profile_id);
      if (!profile) {
        return Response.json({ error: "Academic profile not found." }, { status: 404 });
      }
      // Manual/pending mode: school verified, no program bound yet. Return a
      // structured no-program state instead of erroring so the dashboard can
      // render the "program pending" state.
      if (!profile.program_id) {
        return Response.json({
          status: "success",
          progress: {
            program_bound: false,
            program_name: null,
            degree_type: profile.degree_type || null,
            catalog_year: profile.catalog_year || null,
            overall_percentage: 0,
            credits: {
              required: profile.credits_required || 0,
              completed: 0,
              in_progress: 0,
              remaining: profile.credits_required || 0,
            },
            requirements: { total: 0, completed: [], in_progress: [], remaining: [], blocked: [] },
            groups: [],
            warnings: [],
            message:
              "Your program isn't verified yet. Once your school's catalog is verified, you can select your program and track degree progress.",
          },
        });
      }
      program = await base44.entities.Program.get(profile.program_id);
      catalog = await base44.entities.Catalog.get(profile.catalog_id);
      groups = await base44.entities.RequirementGroup.filter({
        program_id: profile.program_id,
      });
      requirements = await base44.entities.Requirement.filter({
        program_id: profile.program_id,
      });
      courses = await base44.entities.Course.list("-created_date", 500);
    } else if (program_id) {
      program = await base44.entities.Program.get(program_id);
      catalog = catalog_id ? await base44.entities.Catalog.get(catalog_id) : null;
      groups = overrideGroups || await base44.entities.RequirementGroup.filter({
        program_id,
      });
      requirements = overrideRequirements || await base44.entities.Requirement.filter({
        program_id,
      });
      courses = overrideCourses || await base44.entities.Course.list("-created_date", 500);
    } else {
      return Response.json(
        { error: "Provide profile_id or program_id." },
        { status: 400 }
      );
    }

    if (!program || program.verification_status !== "verified") {
      return Response.json(
        { error: "Program is not available or not yet verified." },
        { status: 400 }
      );
    }
    if (catalog && catalog.verification_status !== "verified") {
      return Response.json(
        { error: "Catalog is not available or not yet verified." },
        { status: 400 }
      );
    }
    // Reject an invalid catalog/program relationship (scenario 13). In student
    // mode saveAcademicProfile already prevents this; this guards the override
    // / what-if path too.
    if (catalog && program && catalog.institution_id && program.institution_id &&
        catalog.institution_id !== program.institution_id) {
      return Response.json(
        { error: "Catalog does not belong to the selected program's institution." },
        { status: 400 }
      );
    }

    const progress = evaluateProgress({ program, catalog, groups, requirements, courses });
    return Response.json({
      status: "success",
      progress,
      program_id: program.id || null,
      requirements_status: program.requirements_status || "pending",
    });
  } catch (error) {
    return Response.json({ error: error.message || "Computation failed" }, { status: 500 });
  }
}