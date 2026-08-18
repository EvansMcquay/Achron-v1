// Shared, deterministic transform from EXTRACTED (provisional) course data to
// authoritative Course records — used by both Onboarding and Profile so the
// import rules stay identical.
//
// Provenance model (preserved):
//   - Document.extracted_data  = PROVISIONAL (OCR/AI output, not authoritative)
//   - Course records           = RESOLVED (student confirmed them in the review
//                                 dialog, so verification_status = "verified")
//
// Source / equivalency rules (preserved, now correctly applied):
//   - The per-course `source` captured at extraction is the CREDIT ORIGIN
//     (institutional | transfer | ap | clep), NOT the import provenance. This
//     matters for the Degree Engine: transfer/ap/clep courses only satisfy a
//     specific-course requirement when equivalency_code matches (and the group
//     accepts transfer credits); otherwise they count only toward credit pools.
//   - equivalency_code is passed through when the extraction captured it.
//
// Duplicate prevention: a row identical to an existing Course record
// (same code + term + year + grade) is skipped, so re-extracting/re-applying a
// transcript never creates duplicate records.
//
// This module does NOT touch the Institution/Catalog/Program/Requirement
// architecture or the Requirement Engine.

import { base44 } from "@/api/base44Client";
import { getCurrentTerm } from "@/lib/academic-datetime";

const VALID_STATUSES = ["completed", "in_progress", "planned", "withdrawn", "failed"];
const VALID_SOURCES = ["institutional", "transfer", "ap", "clep"];

function academicYearFromTermYear(term, yearStr) {
  const yr = parseInt(yearStr, 10);
  if (!yr) return "";
  if (term === "Fall") return `${yr}-${yr + 1}`;
  if (term === "Spring" || term === "Summer") return `${yr - 1}-${yr}`;
  return "";
}

function dupKey(c) {
  return `${String(c.code || "").toUpperCase()}|${c.term || ""}|${c.year || ""}|${String(c.grade || "").toUpperCase()}`;
}

/**
 * Import confirmed (student-selected) extracted courses as authoritative
 * Course records, skipping duplicates of existing records.
 *
 * @param {Array} rawCourses - courses the student kept in the review dialog
 * @returns {Promise<{created: number, skipped: number}>}
 */
export async function importExtractedCourses(rawCourses) {
  if (!Array.isArray(rawCourses) || rawCourses.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // Existing records for duplicate prevention (owner-scoped by RLS).
  const existing = await base44.entities.Course.list("-updated_date", 500);
  const existingKeys = new Set(existing.map(dupKey));

  const toCreate = [];
  let skipped = 0;

  for (const c of rawCourses) {
    if (!c.name && !c.code) continue;

    const term = ["Fall", "Spring", "Summer"].includes(c.term) ? c.term : getCurrentTerm();
    const year = c.year ? String(c.year) : String(new Date().getFullYear());
    const status = VALID_STATUSES.includes(c.status) ? c.status : "planned";
    const source = VALID_SOURCES.includes(c.source) ? c.source : "institutional";

    const rec = {
      name: c.name || c.code,
      code: String(c.code || "").trim(),
      course_level: String(c.course_level || "").trim(),
      credits: Number(c.credits) || 0,
      term,
      year,
      academic_year: c.academic_year || academicYearFromTermYear(term, year),
      status,
      grade: String(c.grade || "").trim(),
      source,
      equivalency_code: String(c.equivalency_code || "").trim(),
      // Confirmed in the review dialog → resolved.
      verification_status: "verified",
      extraction_confidence: c.confidence != null ? Number(c.confidence) : undefined,
    };

    // Skip only when we can positively identify an identical existing record.
    if (rec.code) {
      const key = dupKey(rec);
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }
      existingKeys.add(key);
    }
    toCreate.push(rec);
  }

  if (toCreate.length) await base44.entities.Course.bulkCreate(toCreate);
  return { created: toCreate.length, skipped };
}