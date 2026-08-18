import React, { useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { BookOpen, GraduationCap, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { COURSE_STATUSES, COURSE_SOURCES, labelFor } from "@/lib/academic-constants";
import ReviewField from "@/components/documents/ReviewField";

// Document review UX. Missing information is NOT an error.
// Every field shows a calm status:
//   FOUND        — extracted from the document (✓)
//   NOT FOUND    — absent on the document (○, neutral) with optional manual entry
//   USER ENTERED — the student typed a value manually (validated inline; only an
//                  INVALID manual value turns red)
// Reference fields (institution/degree/major/concentration/catalog year/campus/
// credits attempted/remaining/graduation date) are detected and displayed but NOT
// applied — the curated Program/Catalog selection is authoritative for those.
// Only APPLIED_FIELDS (which exist on the AcademicProfile) are applied, and only
// the values the student keeps/enters.

const APPLIED_FIELDS = [
  { key: "degree_start_year", label: "Degree start year" },
  { key: "minor", label: "Minor" },
  { key: "academic_status", label: "Academic status" },
  { key: "credits_completed", label: "Credits completed", numeric: true },
  { key: "credits_required", label: "Credits required", numeric: true },
  { key: "gpa", label: "GPA", numeric: true },
  { key: "expected_graduation", label: "Expected graduation" },
  { key: "graduation_status", label: "Graduation status" },
];

const INFO_FIELDS = [
  { key: "institution", label: "Institution" },
  { key: "degree_type", label: "Degree" },
  { key: "major", label: "Major" },
  { key: "concentration", label: "Concentration" },
  { key: "catalog_year", label: "Catalog year" },
  { key: "campus", label: "Campus" },
  { key: "credits_attempted", label: "Credits attempted", numeric: true },
  { key: "credits_remaining", label: "Credits remaining", numeric: true },
  { key: "graduation_date", label: "Graduation date" },
];

function fmt(v, numeric) {
  if (v === undefined || v === null || v === "") return "—";
  if (numeric) return Number(v).toFixed(Number(v) % 1 === 0 ? 0 : 2);
  return String(v);
}

export default function ConflictResolutionDialog({
  open,
  onOpenChange,
  extracted = {},
  confidence = {},
  warnings = [],
  institutionMatch = "unknown",
  currentProfile = {},
  onApply,
}) {
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [fields, setFields] = useState({});

  const onFieldChange = useCallback((key, { value, error }) => {
    setFields((prev) => (prev[key]?.value === value && prev[key]?.error === error ? prev : { ...prev, [key]: { value, error } }));
  }, []);

  const courses = Array.isArray(extracted?.courses) ? extracted.courses : [];

  React.useEffect(() => {
    if (!open) return;
    setSelectedCourses(courses.map(() => true));
    setFields({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, extracted]);

  const hasError = useMemo(() => Object.values(fields).some((f) => !!f?.error), [fields]);
  const resolvedCount = useMemo(
    () => Object.values(fields).filter((f) => f?.value !== undefined && f?.value !== null && f?.value !== "").length,
    [fields]
  );

  const handleConfirm = () => {
    const academicData = { ...currentProfile };
    Object.entries(fields).forEach(([k, f]) => {
      if (f?.value !== undefined && f?.value !== null && f?.value !== "") {
        academicData[k] = f.value;
      }
    });
    const coursesToImport = courses.filter((_, i) => selectedCourses[i]);
    onApply?.({ academicData, courses: coursesToImport });
  };

  const infoFound = INFO_FIELDS.filter((f) => {
    const v = extracted?.[f.key];
    return v !== undefined && v !== null && v !== "";
  });
  const appliedFound = APPLIED_FIELDS.filter((f) => {
    const v = extracted?.[f.key];
    return v !== undefined && v !== null && v !== "";
  });
  const totalFound = infoFound.length + appliedFound.length;
  const requirements = extracted?.requirements || null;
  const hasRequirements = requirements && (
    requirements.advanced_courses || requirements.business_electives || (Array.isArray(requirements.items) && requirements.items.length)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            Review extracted information
          </DialogTitle>
          <DialogDescription>
            We extracted everything we could find. Missing fields are normal — they're
            shown as "not found" and you can enter them manually or continue and add them
            later. Nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-300 bg-amber-50/60 p-3 space-y-2">
          <p className="text-xs font-medium flex items-center gap-1.5 text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5" />
            Provisional extraction — nothing is saved until you confirm below.
          </p>
          {(institutionMatch === "mismatch" || institutionMatch === "uncertain") && (
            <p className="text-xs text-amber-800">
              The institution on this document {institutionMatch === "mismatch" ? "doesn't match" : "may not match"} your
              selected school ({currentProfile?.institution || "—"}). Please confirm before applying.
            </p>
          )}
          {warnings?.map((w, i) => (
            <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{w.message}</span>
            </p>
          ))}
          {(extracted?.student_name || extracted?.student_id) && (
            <p className="text-xs text-muted-foreground">
              Detected student: {extracted.student_name || "—"}
              {extracted.student_id ? ` · ID ${extracted.student_id}` : ""}
            </p>
          )}
        </div>

        {/* Detected (not applied) — shown found / not found, neutral. */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Info className="w-4 h-4" /> Detected on document
          </h4>
          <p className="text-xs text-muted-foreground">
            These are shown for reference only and are not applied — your selected program
            and catalog are authoritative.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {INFO_FIELDS.map((f) => {
              const v = extracted?.[f.key];
              const found = v !== undefined && v !== null && v !== "";
              return (
                <div key={f.key} className="rounded-md border border-border p-2">
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  {found ? (
                    <p className="text-sm font-medium truncate flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate">{fmt(v, f.numeric)}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not found</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Applied academic fields — FOUND / NOT FOUND / USER ENTERED */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <GraduationCap className="w-4 h-4" /> Academic information
          </h4>
          <div className="space-y-2">
            {APPLIED_FIELDS.map((f) => (
              <ReviewField
                key={f.key}
                field={f}
                extractedValue={extracted?.[f.key]}
                currentValue={currentProfile?.[f.key]}
                confidence={confidence?.[f.key]}
                onFieldChange={onFieldChange}
              />
            ))}
          </div>
        </div>

        {/* Degree-requirement hints from a degree audit (informational). */}
        {hasRequirements && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Info className="w-4 h-4" /> Requirements detected on document
            </h4>
            <p className="text-xs text-muted-foreground">
              Captured from your degree audit for reference. Your school's official catalog
              requirements are authoritative for the roadmap.
            </p>
            <div className="space-y-2">
              {requirements.advanced_courses && (
                <RequirementRow name="Advanced courses" r={requirements.advanced_courses} />
              )}
              {requirements.business_electives && (
                <RequirementRow
                  name={requirements.business_electives.level ? `Business electives (${requirements.business_electives.level} level)` : "Business electives"}
                  r={requirements.business_electives}
                />
              )}
              {(requirements.items || []).map((r, i) => (
                <RequirementRow key={i} name={r.name || "Requirement"} r={r} />
              ))}
            </div>
          </div>
        )}

        {/* Courses */}
        {courses.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Detected courses ({courses.length})
            </h4>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {courses.map((c, i) => (
                <label
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/50"
                >
                  <Checkbox
                    checked={!!selectedCourses[i]}
                    onCheckedChange={() =>
                      setSelectedCourses((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {c.name || c.code || "Untitled course"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        c.code,
                        c.course_level ? `${c.course_level}-level` : null,
                        c.credits != null ? `${c.credits} cr` : null,
                        c.academic_year || [c.term, c.year].filter(Boolean).join(" "),
                        c.grade ? `Grade ${c.grade}` : null,
                        c.status ? labelFor(COURSE_STATUSES, c.status) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No details"}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.source && c.source !== "institutional" && (
                        <Badge variant="secondary" className="text-[10px] py-0">
                          {labelFor(COURSE_SOURCES, c.source)}
                        </Badge>
                      )}
                      {c.equivalency_code && (
                        <Badge variant="outline" className="text-[10px] py-0">
                          equiv {c.equivalency_code}
                        </Badge>
                      )}
                      {c.flags && c.flags.length > 0 && (
                        <Badge variant="destructive" className="text-[10px] py-0">
                          <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                          {c.flags.length} flag{c.flags.length > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    {c.flags && c.flags.length > 0 && (
                      <p className="text-[11px] text-destructive mt-0.5">
                        {c.flags.map((f) => f.replace(/_/g, " ")).join(" · ")}
                      </p>
                    )}
                  </div>
                  {c.confidence != null && (
                    <Badge variant={c.confidence >= 0.85 ? "default" : c.confidence >= 0.6 ? "secondary" : "destructive"}>
                      {Math.round(c.confidence * 100)}%
                    </Badge>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium">Summary</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            We found {totalFound} academic field{totalFound === 1 ? "" : "s"} and {courses.length} course{courses.length === 1 ? "" : "s"}.
            {resolvedCount > 0 && ` ${resolvedCount} field(s) will be updated.`}
            {totalFound === 0 && courses.length === 0 && " You can still continue and enter your information manually."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={hasError}>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequirementRow({ name, r }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-sm font-medium">{name}</p>
      {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
        <div><span className="text-muted-foreground">Needed: </span>{r.required_credits ?? "—"}</div>
        <div><span className="text-muted-foreground">Completed: </span>{r.completed_credits ?? "—"}</div>
        <div><span className="text-muted-foreground">Remaining: </span>{r.remaining_credits ?? "—"}</div>
      </div>
    </div>
  );
}