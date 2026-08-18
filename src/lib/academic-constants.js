// Single source of truth for categorical academic values used in dropdowns.
// Pages import from here instead of hard-coding option sets, so options stay
// consistent across Dashboard, Profile, Degree Progress, Planner and Onboarding.

export const DEGREE_TYPES = [
  { value: "Associate", label: "Associate" },
  { value: "Bachelor", label: "Bachelor" },
  { value: "Master", label: "Master" },
  { value: "Doctorate", label: "Doctorate" },
  { value: "Certificate", label: "Certificate" },
  { value: "Diploma", label: "Diploma" },
];

export const ACADEMIC_STATUSES = [
  { value: "Freshman", label: "Freshman" },
  { value: "Sophomore", label: "Sophomore" },
  { value: "Junior", label: "Junior" },
  { value: "Senior", label: "Senior" },
  { value: "Graduate", label: "Graduate" },
  { value: "Other", label: "Other" },
];

export const TERMS = [
  { value: "Fall", label: "Fall" },
  { value: "Spring", label: "Spring" },
  { value: "Summer", label: "Summer" },
];

export const COURSE_STATUSES = [
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In Progress" },
  { value: "planned", label: "Planned" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "failed", label: "Failed" },
];

export const COURSE_SOURCES = [
  { value: "institutional", label: "Institutional" },
  { value: "transfer", label: "Transfer" },
  { value: "transcript", label: "From transcript" },
  { value: "manual", label: "Manual entry" },
  { value: "ap", label: "AP credit" },
  { value: "clep", label: "CLEP" },
];

export const GRADUATION_STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_track", label: "On Track" },
  { value: "ready", label: "Ready to Graduate" },
  { value: "graduated", label: "Graduated" },
];

export const DOCUMENT_TYPES = [
  { value: "transcript", label: "Transcript" },
  { value: "degree_audit", label: "Degree Audit" },
  { value: "other", label: "Other Document" },
];

export const EXTRACTION_STATUSES = {
  none: { label: "Not processed", tone: "secondary" },
  pending: { label: "Processing", tone: "default" },
  extracted: { label: "Extracted", tone: "default" },
  failed: { label: "Extraction failed", tone: "destructive" },
};

// Document upload constraints (used by DocumentUploader validation).
export const DOCUMENT_UPLOAD = {
  maxBytes: 10 * 1024 * 1024, // 10 MB
  acceptedMimeTypes: [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
  ],
  acceptedExtensions: [".pdf", ".png", ".jpg", ".jpeg", ".webp"],
};

export function labelFor(list, value) {
  const match = list.find((o) => o.value === value);
  return match ? match.label : value || "—";
}