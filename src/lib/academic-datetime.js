// Centralized date/time & academic-calendar logic.
// Every page imports from here — no page independently computes the current
// year, academic year, or term. All values are derived from the real current
// date so the app keeps working in future years without manual updates.

// US academic calendar with a Fall start:
//   Spring: Jan–May (months 0–4)
//   Summer: Jun–Jul (months 5–6)
//   Fall:   Aug–Dec (months 7–11)
// An academic year that starts in Fall of year Y runs Fall Y + Spring (Y+1) +
// Summer (Y+1), and is labeled "Y–Y+1".

const SPRING_MONTHS = [0, 1, 2, 3, 4];   // Jan–May
const SUMMER_MONTHS = [5, 6];            // Jun–Jul
// everything else is Fall

export function now() {
  return new Date();
}

export function getCurrentDate() {
  return now();
}

export function getCurrentYear() {
  return now().getFullYear();
}

export function getCurrentMonth() {
  return now().getMonth(); // 0-indexed
}

export function getTermForMonth(month) {
  if (SPRING_MONTHS.includes(month)) return "Spring";
  if (SUMMER_MONTHS.includes(month)) return "Summer";
  return "Fall";
}

export function getCurrentTerm() {
  return getTermForMonth(getCurrentMonth());
}

// Year component of a term in a given academic year.
// Fall belongs to the start year; Spring/Summer belong to start year + 1.
export function termYear(academicYearStart, term) {
  if (term === "Fall") return String(academicYearStart);
  return String(academicYearStart + 1);
}

// The calendar year that "starts" the current academic year.
// In Fall: it's the current year. In Spring/Summer: it's last year.
export function getCurrentAcademicYearStart() {
  const date = now();
  const month = date.getMonth();
  const year = date.getFullYear();
  return getTermForMonth(month) === "Fall" ? year : year - 1;
}

export function getCurrentAcademicYear() {
  const start = getCurrentAcademicYearStart();
  return `${start}–${start + 1}`;
}

// The next term the student will enter, with its calendar year.
export function getUpcomingTerm() {
  const month = getCurrentMonth();
  const year = getCurrentYear();
  const current = getTermForMonth(month);
  if (current === "Fall") return { term: "Spring", year: year + 1 };
  if (current === "Spring") return { term: "Summer", year: year };
  return { term: "Fall", year: year };
}

export function getUpcomingAcademicYear() {
  const { year, term } = getUpcomingTerm();
  const start = term === "Fall" ? year : year - 1;
  return `${start}–${start + 1}`;
}

// Generate academic-year options centered on the current academic year.
// e.g. range -4..+4 around the current AY start → "2022–2023" … "2030–2031".
export function getAcademicYearOptions(span = 4) {
  const currentStart = getCurrentAcademicYearStart();
  const options = [];
  for (let offset = -span; offset <= span; offset++) {
    const start = currentStart + offset;
    const value = `${start}–${start + 1}`;
    options.push({ value, label: value });
  }
  return options;
}

// Degree start-year options: every academic year from 1990-1991 through the
// current academic year, newest first. Generated dynamically from the real
// current date so the newest option is always the current academic year —
// never hardcoded. Used by the "Degree start year" selector (a student fact,
// independent of the school's catalog year).
export function getDegreeStartYearOptions(earliestStart = 1990) {
  const currentStart = getCurrentAcademicYearStart();
  const options = [];
  for (let start = currentStart; start >= earliestStart; start--) {
    const value = `${start}–${start + 1}`;
    options.push({ value, label: value });
  }
  return options;
}

// Plain calendar-year options, useful for catalog years.
export function getYearOptions(span = 6) {
  const current = getCurrentYear();
  const options = [];
  for (let offset = -span; offset <= span; offset++) {
    const value = String(current + offset);
    options.push({ value, label: value });
  }
  return options;
}

// Human-friendly formatting helpers.
export function formatToday() {
  return now().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatTimestamp(date) {
  const d = date ? new Date(date) : now();
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}