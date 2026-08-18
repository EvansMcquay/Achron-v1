// Deterministic Degree / Requirement Progress Engine.
//
// Pure functions: NO database access, NO LLM, NO non-deterministic input. Given
// the same (program, catalog, groups, requirements, courses) it always produces
// the same result. The backend function `computeDegreeProgress` reads entities
// and calls `evaluateProgress` here.
//
// Rules enforced (see the approved Requirement Engine mandate):
//   - A course satisfies a requirement only when status === "completed" AND its
//     grade meets the requirement's min_grade (or the group default).
//   - failed / withdrawn never satisfy; in_progress is distinct from completed.
//   - Repeated attempts: the authoritative attempt is the completed attempt with
//     the highest grade rank; history is preserved but credits/satisfaction
//     count once.
//   - transfer / AP / CLEP courses satisfy a SPECIFIC course requirement only
//     when equivalency_code matches and the group accepts transfer credits.
//     They may still count toward credit pools.
//   - Prerequisites: a not-yet-completed requirement whose prerequisite_codes are
//     unmet is flagged "blocked".
//   - Overall percentage is DERIVED from satisfied/total requirements, never
//     stored as the source of truth.
//   - Credits are not double-counted: each unique course contributes its credits
//     once to the overall totals.

export const GRADE_RANK = {
  "A": 12, "A-": 11, "B+": 10, "B": 9, "B-": 8,
  "C+": 7, "C": 6, "C-": 5, "D+": 4, "D": 3, "D-": 2,
  "F": 0, "P": 12, "NP": 0, "W": 0, "I": 0,
};

export function gradeRank(grade) {
  if (!grade) return -1;
  return GRADE_RANK[String(grade).trim().toUpperCase()] ?? -1;
}

export function gradeMet(courseGrade, minGrade) {
  if (!minGrade) return true; // no minimum => any completion satisfies
  return gradeRank(courseGrade) >= gradeRank(minGrade);
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function isTransferLike(source) {
  return ["transfer", "ap", "clep", "ib"].includes(source);
}

// Build the attempt index from a student's course records.
//   byCode:           normalized code -> all attempts (history preserved)
//   completed:         authoritative completed attempt per code (best grade)
//   inProgress:        one in_progress attempt per code
//   allCompletedCodes: set of codes with >=1 completed attempt (for repeat warnings)
export function buildAttemptIndex(courses) {
  const byCode = new Map();
  for (const c of courses || []) {
    const code = normalizeCode(c.code);
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(c);
  }
  const completed = [];   // authoritative completed attempts (one per code)
  const inProgress = [];
  const repeats = [];
  for (const [code, attempts] of byCode) {
    const comp = attempts.filter((a) => a.status === "completed");
    const ip = attempts.filter((a) => a.status === "in_progress");
    if (ip.length) inProgress.push(ip[0]);
    if (comp.length) {
      comp.sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade));
      completed.push(comp[0]);
      if (comp.length > 1) {
        repeats.push({ code, attempts: comp.length });
      }
    }
  }
  return { byCode, completed, inProgress, repeats };
}

// Find the completed attempt that satisfies a given requirement code, respecting
// equivalency for transfer-like sources.
function findCompletedMatch(code, completed, group) {
  const norm = normalizeCode(code);
  return completed.find((a) => {
    if (normalizeCode(a.code) === norm) return true;
    if (isTransferLike(a.source) && group.accept_transfer_credits !== false) {
      return normalizeCode(a.equivalency_code) === norm;
    }
    return false;
  });
}

function findInProgressMatch(code, inProgress) {
  const norm = normalizeCode(code);
  return inProgress.find((a) => normalizeCode(a.code) === norm);
}

function prerequisitesMet(req, completed) {
  const codes = req.prerequisite_codes || [];
  if (!codes.length) return true;
  return codes.every((pc) =>
    completed.some((a) => normalizeCode(a.code) === normalizeCode(pc))
  );
}

// Evaluate a single requirement against the attempt index.
export function evaluateRequirement(req, ctx, group) {
  const minGrade = req.min_grade || group.min_grade;
  const result = {
    requirement_id: req.id || null,
    group_id: group.id || null,
    requirement_type: req.requirement_type,
    normalized_type: req.normalized_type || "",
    official_requirement_name: req.official_requirement_name || "",
    level_min: req.level_min != null ? Number(req.level_min) : null,
    level_max: req.level_max != null ? Number(req.level_max) : null,
    description: req.description || "",
    status: "not_satisfied",
    satisfied_by: null,
    explanation: "",
    needed: null,
    have: null,
  };
  const prereqMet = prerequisitesMet(req, ctx.completed);

  switch (req.requirement_type) {
    case "required_course": {
      const codes = req.course_codes || [];
      if (!codes.length) {
        result.status = "not_satisfied";
        result.explanation = "No course code defined for this requirement.";
        break;
      }
      const matches = codes
        .map((code) => findCompletedMatch(code, ctx.completed, group))
        .filter(Boolean);
      const passing = matches.filter((c) => gradeMet(c.grade, minGrade));
      if (passing.length) {
        const c = passing[0];
        result.status = "satisfied";
        result.satisfied_by = {
          code: c.code,
          grade: c.grade || null,
          credits: Number(c.credits) || 0,
          source: c.source,
        };
        result.explanation = `SATISFIED — ${c.code}, grade ${c.grade || "—"}, ${Number(c.credits) || 0} credits.`;
      } else if (matches.length) {
        const c = matches[0];
        result.status = "not_satisfied";
        result.satisfied_by = {
          code: c.code,
          grade: c.grade || null,
          credits: Number(c.credits) || 0,
          source: c.source,
        };
        result.explanation = `NOT SATISFIED — ${c.code} completed with grade ${c.grade || "—"}, below required ${minGrade}.`;
      } else {
        const inProg = codes.some((code) => findInProgressMatch(code, ctx.inProgress));
        if (inProg) {
          result.status = "in_progress";
          result.explanation = `IN PROGRESS — currently enrolled in ${codes.join(", ")}.`;
        } else if (!prereqMet) {
          result.status = "blocked";
          result.explanation = `BLOCKED — prerequisite not completed: ${(req.prerequisite_codes || []).join(", ")}.`;
        } else {
          result.status = "not_satisfied";
          result.explanation = `NOT SATISFIED — required ${codes.join(", ")} not completed.`;
        }
      }
      break;
    }

    case "choose_x_of_y": {
      const codes = req.course_codes || [];
      const need = req.choose_count || 0;
      const passing = [];
      const inProgressNames = [];
      for (const code of codes) {
        const c = findCompletedMatch(code, ctx.completed, group);
        if (c && gradeMet(c.grade, minGrade)) passing.push(c);
        if (findInProgressMatch(code, ctx.inProgress)) inProgressNames.push(code);
      }
      result.needed = need;
      result.have = passing.length;
      if (need && passing.length >= need) {
        result.status = "satisfied";
        result.satisfied_by = passing.map((c) => ({
          code: c.code, grade: c.grade || null, credits: Number(c.credits) || 0, source: c.source,
        }));
        result.explanation = `SATISFIED — ${passing.length} of ${need}: ${passing.map((c) => c.code).join(", ")}.`;
      } else if (need && passing.length + inProgressNames.length >= need) {
        result.status = "in_progress";
        result.explanation = `IN PROGRESS — ${passing.length} of ${need} completed, ${inProgressNames.length} in progress.`;
      } else {
        result.status = !prereqMet ? "blocked" : "not_satisfied";
        result.explanation = `${!prereqMet ? "BLOCKED — " : ""}${passing.length} of ${need} completed.`;
      }
      break;
    }

    case "min_credits":
    case "elective_credits": {
      const need = Number(req.min_credits) || 0;
      // Level-based credit requirements (e.g. "12 credits of 300/400-level
      // coursework" with no specific course list): filter eligible completed /
      // in-progress courses by course_level. Only applied when course_codes is
      // empty — when an explicit eligible list exists, the list is authoritative.
      const levelMin = req.level_min != null ? Number(req.level_min) : null;
      const levelMax = req.level_max != null ? Number(req.level_max) : null;
      const hasLevel = levelMin != null || levelMax != null;
      const levelOk = (c) => {
        if (!hasLevel) return true;
        const lvl = Number(c.course_level);
        if (Number.isNaN(lvl)) return false;
        if (levelMin != null && lvl < levelMin) return false;
        if (levelMax != null && lvl > levelMax) return false;
        return true;
      };
      let earnedPool = [];
      let inProgCredits = 0;
      if (req.course_codes && req.course_codes.length) {
        for (const code of req.course_codes) {
          const c = findCompletedMatch(code, ctx.completed, group);
          if (c && gradeMet(c.grade, minGrade)) earnedPool.push(c);
          const ip = findInProgressMatch(code, ctx.inProgress);
          if (ip) inProgCredits += Number(ip.credits) || 0;
        }
      } else {
        earnedPool = ctx.completed.filter((c) => gradeMet(c.grade, minGrade) && levelOk(c));
        inProgCredits = ctx.inProgress.filter(levelOk).reduce((s, c) => s + (Number(c.credits) || 0), 0);
      }
      const earned = earnedPool.reduce((s, c) => s + (Number(c.credits) || 0), 0);
      result.needed = need;
      result.have = earned;
      if (need && earned >= need) {
        result.status = "satisfied";
        result.explanation = `SATISFIED — ${earned} of ${need} credits earned.`;
      } else if (need && earned + inProgCredits >= need) {
        result.status = "in_progress";
        result.explanation = `IN PROGRESS — ${earned} earned + ${inProgCredits} in progress of ${need} credits.`;
      } else {
        result.status = "not_satisfied";
        result.explanation = `NOT SATISFIED — ${earned} of ${need} credits earned.`;
      }
      break;
    }

    case "concentration": {
      const codes = req.course_codes || [];
      const need = req.choose_count || codes.length;
      const passing = codes.filter((code) => {
        const c = findCompletedMatch(code, ctx.completed, group);
        return c && gradeMet(c.grade, minGrade);
      });
      result.needed = need;
      result.have = passing.length;
      if (passing.length >= need) {
        result.status = "satisfied";
        result.explanation = `SATISFIED — concentration complete: ${passing.join(", ")}.`;
      } else if (!prereqMet) {
        result.status = "blocked";
        result.explanation = `BLOCKED — ${passing.length} of ${need} concentration courses, prerequisite unmet.`;
      } else {
        result.status = "not_satisfied";
        result.explanation = `NOT SATISFIED — ${passing.length} of ${need} concentration courses completed.`;
      }
      break;
    }

    default:
      result.status = "not_satisfied";
      result.explanation = `Unknown requirement type: ${req.requirement_type}.`;
  }
  return result;
}

// Evaluate an entire program against a student's courses.
export function evaluateProgress({ program, catalog, groups, requirements, courses }) {
  const ctx = buildAttemptIndex(courses);
  const groupsById = new Map();
  for (const g of groups || []) groupsById.set(g.id, g);

  // Attach each requirement to its group.
  const byGroup = new Map();
  for (const g of groups || []) byGroup.set(g.id, { group: g, requirements: [] });
  for (const r of requirements || []) {
    if (byGroup.has(r.group_id)) byGroup.get(r.group_id).requirements.push(r);
  }

  const groupResults = [];
  const allReqs = [];
  const completedReqs = [];
  const inProgressReqs = [];
  const remainingReqs = [];
  const blockedReqs = [];

  // Track unique satisfied courses for credit accounting (no double counting).
  const usedCourseKeys = new Set();

  for (const g of groups || []) {
    const reqs = (byGroup.get(g.id) && byGroup.get(g.id).requirements) || [];
    const evals = reqs
      .map((r) => evaluateRequirement(r, ctx, g))
      .sort((a, b) => (a.requirement_type || "").localeCompare(b.requirement_type || ""));

    for (const e of evals) {
      allReqs.push(e);
      if (e.status === "satisfied") completedReqs.push(e);
      else if (e.status === "in_progress") inProgressReqs.push(e);
      else if (e.status === "blocked") blockedReqs.push(e);
      else remainingReqs.push(e);

      // collect course keys used to satisfy (for credit dedup)
      if (e.satisfied_by) {
        const list = Array.isArray(e.satisfied_by) ? e.satisfied_by : [e.satisfied_by];
        for (const s of list) {
          if (s && s.code) usedCourseKeys.add(normalizeCode(s.code));
        }
      }
    }

    // group status
    const sat = evals.filter((e) => e.status === "satisfied").length;
    const ip = evals.filter((e) => e.status === "in_progress").length;
    const rem = evals.filter((e) => e.status === "not_satisfied").length;
    const blk = evals.filter((e) => e.status === "blocked").length;
    let status;
    if (g.choose_count && g.choose_count > 0) {
      if (sat >= g.choose_count) status = "satisfied";
      else if (sat + ip >= g.choose_count) status = "in_progress";
      else status = "not_satisfied";
    } else {
      if (rem === 0 && blk === 0 && ip === 0) status = "satisfied";
      else if (rem === 0 && blk === 0) status = "in_progress";
      else status = "not_satisfied";
    }

    groupResults.push({
      id: g.id,
      name: g.official_name || g.name,
      group_type: g.group_type,
      normalized_category: g.normalized_category || "",
      status,
      completed_count: sat,
      in_progress_count: ip,
      remaining_count: rem,
      blocked_count: blk,
      total_count: evals.length,
      credits_required: g.credits_required || null,
      requirements: evals,
    });
  }

  // Credit accounting — each unique completed course contributes once.
  const creditsCompleted = ctx.completed
    .reduce((s, c) => s + (Number(c.credits) || 0), 0);
  const creditsInProgress = ctx.inProgress
    .reduce((s, c) => s + (Number(c.credits) || 0), 0);
  const creditsRequired =
    Number(program.credits_required) ||
    (groups || []).reduce((s, g) => s + (Number(g.credits_required) || 0), 0) ||
    0;
  const creditsRemaining = Math.max(0, creditsRequired - creditsCompleted);

  const totalReqs = allReqs.length;
  const completedCount = completedReqs.length;
  const overallPercentage = totalReqs
    ? Math.round((completedCount / totalReqs) * 100)
    : 0;

  // Warnings / informational notes.
  const warnings = [];
  for (const r of ctx.repeats) {
    warnings.push({
      type: "repeated_course",
      message: `Repeated course ${r.code}: ${r.attempts} completed attempts on record. Best grade used; credits counted once.`,
    });
  }
  for (const c of ctx.completed) {
    if (isTransferLike(c.source) && !c.equivalency_code) {
      warnings.push({
        type: "transfer_no_equivalency",
        message: `Transfer/${c.source} course ${c.code} has no accepted equivalency; counts toward credit pools but cannot satisfy a specific-course requirement.`,
      });
    }
  }

  return {
    catalog_year: catalog ? catalog.catalog_year : null,
    program_name: program.program_name || null,
    degree_type: program.degree_type || null,
    overall_percentage: overallPercentage,
    credits: {
      required: creditsRequired,
      completed: creditsCompleted,
      in_progress: creditsInProgress,
      remaining: creditsRemaining,
    },
    requirements: {
      total: totalReqs,
      completed: completedReqs,
      in_progress: inProgressReqs,
      remaining: remainingReqs,
      blocked: blockedReqs,
    },
    groups: groupResults,
    warnings,
    // Course history preserved — engine decides authority, never deletes records.
    course_summary: {
      total_records: (courses || []).length,
      unique_completed: ctx.completed.length,
      in_progress: ctx.inProgress.length,
      repeated_codes: ctx.repeats.map((r) => r.code),
    },
  };
}