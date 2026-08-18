import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Extracts academic information from an uploaded transcript / degree audit /
// other document. Uses InvokeLLM (vision-capable, so it handles text PDFs and
// scanned/OCR images) with the uploaded file as context and returns BOTH the
// parsed academic data AND per-field / per-course confidence in a single
// structured response.
//
// It NEVER writes to the AcademicProfile or Course entities. It returns the
// parsed data so the frontend can show it to the student for review and
// explicit confirmation before anything becomes authoritative. The Document
// record's `extracted_data` is the PROVISIONAL store; only after the student
// confirms in the review dialog does confirmed data become Course records.
//
// In addition to the LLM output, this function performs deterministic
// post-processing: term/year normalization, academic_year derivation, source
// normalization, duplicate detection, and per-course / top-level flags for
// ambiguous codes, grades, credits, missing terms, and uncertain institution
// matches — so the UI can surface issues instead of letting OCR/AI guesses
// silently become authoritative.

const ACADEMIC_SCHEMA = {
  type: "object",
  properties: {
    institution: { type: "string", description: "School or university name as written on the document" },
    student_name: { type: "string", description: "Student name as printed, if present" },
    student_id: { type: "string", description: "Student ID number as printed, if present" },
    degree_type: { type: "string", description: "Associate, Bachelor, Master, Doctorate, Certificate, or Diploma" },
    major: { type: "string", description: "Primary major / field of study as written" },
    minor: { type: "string", description: "Minor if present" },
    degree_start_year: { type: "string", description: "The academic year the student began this degree, e.g. 2024-2025, if shown on the document" },
    academic_status: { type: "string", description: "Freshman, Sophomore, Junior, Senior, Graduate, or Other" },
    credits_completed: { type: "number", description: "Total credits earned so far" },
    credits_required: { type: "number", description: "Total credits required for the degree" },
    gpa: { type: "number", description: "Grade point average as a number" },
    expected_graduation: { type: "string", description: "Expected graduation term e.g. Spring 2027" },
    graduation_status: { type: "string", description: "not_started, in_progress, on_track, ready, or graduated" },
    campus: { type: "string", description: "Campus or location if printed" },
    concentration: { type: "string", description: "Concentration / specialization / track as written, if present" },
    catalog_year: { type: "string", description: "Catalog year the program is bound to, e.g. 2025-2026, if shown (common on degree audits)" },
    credits_attempted: { type: "number", description: "Total credits attempted" },
    credits_remaining: { type: "number", description: "Credits still needed to complete the degree, if shown" },
    graduation_date: { type: "string", description: "Actual or anticipated graduation date as printed" },
    requirements: {
      type: "object",
      description: "Degree-requirement summary captured from a degree audit (informational; NOT authoritative — the school's catalog requirements are authoritative). Omit entirely if the document doesn't state requirements. Do NOT invent values.",
      properties: {
        advanced_courses: {
          type: "object",
          description: "Upper-level / advanced-course requirement as stated on the document. Omit if not present.",
          properties: {
            required_credits: { type: "number" },
            completed_credits: { type: "number" },
            remaining_credits: { type: "number" },
            description: { type: "string", description: "Exact wording as printed, e.g. 'Advanced coursework — 12 credits required'" }
          }
        },
        business_electives: {
          type: "object",
          description: "Business-elective requirement as stated, including level restriction if specified. Omit if not present.",
          properties: {
            required_credits: { type: "number" },
            completed_credits: { type: "number" },
            remaining_credits: { type: "number" },
            level: { type: "string", description: "Level restriction as printed, e.g. '300-400', or empty if none stated" },
            description: { type: "string", description: "Exact wording as printed" }
          }
        },
        items: {
          type: "array",
          description: "Any other named degree requirements stated on the document, each with exact wording preserved",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              required_credits: { type: "number" },
              completed_credits: { type: "number" },
              remaining_credits: { type: "number" },
              description: { type: "string" }
            }
          }
        }
      }
    },
    field_confidence: {
      type: "object",
      description: "Confidence score from 0.0 to 1.0 for each extracted academic field. Omit a field's key entirely if the value was not found on the document.",
      properties: {
        institution: { type: "number" },
        degree_type: { type: "number" },
        major: { type: "number" },
        concentration: { type: "number" },
        degree_start_year: { type: "number" },
        catalog_year: { type: "number" },
        credits_completed: { type: "number" },
        credits_attempted: { type: "number" },
        credits_required: { type: "number" },
        credits_remaining: { type: "number" },
        gpa: { type: "number" },
        expected_graduation: { type: "number" }
      }
    },
    courses: {
      type: "array",
      description: "Every course row listed on the document, in document order",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Course title as printed" },
          code: { type: "string", description: "Course code/subject e.g. 'CS 101'. Empty string if not clearly readable." },
          credits: { type: "number", description: "Credit hours. Null if unclear." },
          term: { type: "string", description: "One of: Fall, Spring, Summer. Empty string if not stated." },
          year: { type: "string", description: "Calendar year of the term as a string e.g. '2024'. Empty string if not stated." },
          status: { type: "string", description: "One of: completed, in_progress, planned, withdrawn, failed. Map W/Withdrawal->withdrawn, F->failed, Incomplete(I)->completed, currently enrolled/IP->in_progress, future/registered->planned." },
          grade: { type: "string", description: "Letter grade as printed e.g. A, A-, B+, P, NP, W, I, or a numeric grade. Empty string if none." },
          source: { type: "string", description: "Credit origin: 'institutional' (home institution), 'transfer' (another college, dual-enrollment, concurrent), 'ap', or 'clep'. Default 'institutional' when on the home transcript." },
          equivalency_code: { type: "string", description: "For transfer/ap/clep: the home-institution course code this credit was accepted as, if shown. Empty string otherwise." },
          confidence: { type: "number", description: "0.0-1.0 confidence this course row was parsed correctly" }
        }
      }
    }
  }
};

const ACADEMIC_FIELDS = [
  "institution", "student_name", "student_id", "campus", "degree_type", "major", "minor",
  "concentration", "degree_start_year", "academic_status", "catalog_year",
  "credits_completed", "credits_attempted", "credits_required", "credits_remaining", "gpa",
  "expected_graduation", "graduation_status", "graduation_date"
];

const VALID_STATUSES = ["completed", "in_progress", "planned", "withdrawn", "failed"];
const VALID_SOURCES = ["institutional", "transfer", "ap", "clep"];
const KNOWN_GRADES = new Set([
  "A", "A-", "A+", "B", "B-", "B+", "C", "C-", "C+", "D", "D-", "D+",
  "F", "P", "NP", "W", "I", "AU", "S", "U"
]);
// Recognizes codes like "CS 101", "CS101", "MATH-1010", "BIO 1A".
const CODE_RE = /^[A-Z]{1,8}[\s\-]?\d{1,4}[A-Z]?$/i;

function normalizeInst(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|university|college|of|community|institute|school)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function institutionMatch(expected, found) {
  if (!found) return "none";
  if (!expected) return "unknown";
  const a = normalizeInst(expected);
  const b = normalizeInst(found);
  if (!b) return "none";
  if (!a) return "unknown";
  if (a === b) return "match";
  if (a.includes(b) || b.includes(a)) return "match";
  // Token overlap heuristic for partial/alias matches.
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  let overlap = 0;
  tb.forEach((t) => { if (ta.has(t) && t.length > 2) overlap++; });
  if (overlap >= 2) return "uncertain";
  return "mismatch";
}

function academicYearFromTermYear(term, yearStr) {
  const yr = parseInt(yearStr, 10);
  if (!yr) return "";
  if (term === "Fall") return `${yr}-${yr + 1}`;
  if (term === "Spring" || term === "Summer") return `${yr - 1}-${yr}`;
  return "";
}

function normalizeCourse(c, idx) {
  const flags = [];
  const code = String(c.code || "").trim();
  if (!code) flags.push("missing_code");
  else if (!CODE_RE.test(code)) flags.push("ambiguous_code");

  // Derive course level from the numeric part of the code when reliable
  // (e.g. "ACCT 223" -> 200, "FIN 313" -> 300, "ITAN 415" -> 400). Empty when
  // the code format is ambiguous or lacks a clear leading digit.
  let course_level = "";
  if (code && CODE_RE.test(code)) {
    const m = code.match(/(\d)\d{0,3}/);
    if (m) course_level = String(Number(m[1]) * 100);
  }

  const rawCredits = c.credits;
  const credits = Number(rawCredits);
  if (rawCredits == null || Number.isNaN(credits)) {
    flags.push("ambiguous_credits");
  } else if (credits <= 0) {
    flags.push("zero_credits");
  }

  const term = ["Fall", "Spring", "Summer"].includes(c.term) ? c.term : "";
  if (!term) flags.push("missing_term");

  const year = c.year ? String(c.year) : "";
  if (!year) flags.push("missing_year");

  let status = VALID_STATUSES.includes(c.status) ? c.status : "";
  if (!status) {
    flags.push("ambiguous_status");
    status = "planned";
  }

  const grade = String(c.grade || "").trim();
  if (grade && !KNOWN_GRADES.has(grade.toUpperCase()) && !/^\d+(\.\d+)?$/.test(grade)) {
    flags.push("unusual_grade");
  }
  if (grade && grade.toUpperCase() === "I") flags.push("incomplete_grade");

  let source = VALID_SOURCES.includes(c.source) ? c.source : "";
  if (!source) {
    flags.push("ambiguous_source");
    source = "institutional";
  }

  return {
    name: c.name || code,
    code,
    course_level,
    credits: Number.isNaN(credits) ? 0 : credits,
    term,
    year,
    academic_year: c.academic_year || academicYearFromTermYear(term, year),
    status,
    grade,
    source,
    equivalency_code: String(c.equivalency_code || "").trim(),
    confidence: c.confidence != null ? Number(c.confidence) : null,
    flags,
  };
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

    const { file_url, document_type, expected_institution } = body || {};
    if (!file_url || typeof file_url !== "string") {
      return Response.json({ error: "file_url is required" }, { status: 400 });
    }

    const allowedTypes = ["transcript", "degree_audit", "other"];
    if (document_type && !allowedTypes.includes(document_type)) {
      return Response.json({ error: "Invalid document_type" }, { status: 400 });
    }

    const prompt = `You are a meticulous academic-records extraction engine. Analyze the attached ${document_type || "academic document"} — it may be a text PDF, a scanned/OCR image, faint, rotated, or photographed. Extract information EXACTLY as printed. Never infer, normalize, or guess values that are not on the document.

Rules:
- If the document is a scan/photo, carefully read the printed text. If a field or a course value is illegible, OMIT it rather than guess.
- For every course row, capture: title (name), code, credits, term, year, grade, status, and credit origin.
- Credit origin ('source'): 'institutional' for courses taken at the home institution; 'transfer' for transfer, dual-enrollment, or concurrent credits from another college; 'ap' for Advanced Placement; 'clep' for CLEP. Default 'institutional' when the row is part of the home transcript and not marked otherwise.
- degree_start_year: the academic year the student began this degree (e.g. 2024-2025), if shown. Omit if not present.
- Status mapping: completed (graded course, passed or not), in_progress (currently enrolled / marked IP), planned (future / registered), withdrawn (W / Withdrawal), failed (F). An Incomplete (I) is status 'completed' with grade 'I'.
- If a transfer/AP/CLEP course shows the home-institution equivalent course code it was accepted as, put that code in equivalency_code.
- term must be one of: Fall, Spring, Summer. year is the calendar year of that term as a string.
- Preserve official wording of names/titles; do not normalize.
- field_confidence: for each academic field you could read, include it with a 0.0-1.0 score; OMIT a key entirely if the field was not found.
- courses: include a per-course 'confidence' (0.0-1.0) for how sure you are you read that row correctly.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [file_url],
      response_json_schema: ACADEMIC_SCHEMA
    });

    const extracted = (result && typeof result === "object") ? result : {};
    const confidence = extracted.field_confidence || {};

    // ---- Deterministic post-processing ----
    const rawCourses = Array.isArray(extracted.courses) ? extracted.courses : [];
    const courses = rawCourses.map((c, i) => normalizeCourse(c, i));

    // Duplicate detection: same normalized code + term + year.
    const seen = new Map();
    const warnings = [];
    for (const c of courses) {
      if (!c.code) continue;
      const key = `${c.code.toUpperCase()}|${c.term}|${c.year}`.toLowerCase();
      if (seen.has(key)) {
        c.flags.push("possible_duplicate");
        if (!warnings.some((w) => w.type === "duplicate_course")) {
          warnings.push({
            type: "duplicate_course",
            message: "One or more course rows share the same code, term, and year. Duplicates are flagged for review.",
          });
        }
      } else {
        seen.set(key, true);
      }
    }

    // Institution match against the student's selected institution (if provided).
    const instMatch = institutionMatch(expected_institution, extracted.institution);
    if (instMatch === "mismatch" || instMatch === "uncertain") {
      warnings.push({
        type: "institution_match",
        level: instMatch,
        message:
          instMatch === "mismatch"
            ? `The institution on the document ("${extracted.institution || "—"}") does not appear to match your selected institution ("${expected_institution}"). Please confirm.`
            : `The institution on the document ("${extracted.institution || "—"}") may not match your selected institution ("${expected_institution}"). Please confirm.`,
      });
    }

    // Low-confidence courses summary.
    const lowConf = courses.filter((c) => c.confidence != null && c.confidence < 0.6).length;
    if (lowConf) {
      warnings.push({
        type: "low_confidence_courses",
        message: `${lowConf} course row(s) were parsed with low confidence. Please review carefully.`,
      });
    }

    return Response.json({
      status: "success",
      extracted_data: {
        institution: extracted.institution || "",
        student_name: extracted.student_name || "",
        student_id: extracted.student_id || "",
        campus: extracted.campus || "",
        degree_type: extracted.degree_type || "",
        major: extracted.major || "",
        minor: extracted.minor || "",
        concentration: extracted.concentration || "",
        degree_start_year: extracted.degree_start_year || "",
        academic_status: extracted.academic_status || "",
        catalog_year: extracted.catalog_year || "",
        credits_completed: extracted.credits_completed,
        credits_attempted: extracted.credits_attempted,
        credits_required: extracted.credits_required,
        credits_remaining: extracted.credits_remaining,
        gpa: extracted.gpa,
        expected_graduation: extracted.expected_graduation || "",
        graduation_status: extracted.graduation_status || "",
        graduation_date: extracted.graduation_date || "",
        requirements: extracted.requirements || null,
        courses,
      },
      confidence,
      warnings,
      institution_match: instMatch,
      // Top-level source = extraction provenance (this record came from a transcript).
      // Per-course `source` (within each course) = credit origin.
      source: "transcript",
      extracted_at: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ error: error.message || "Extraction failed" }, { status: 500 });
  }
}