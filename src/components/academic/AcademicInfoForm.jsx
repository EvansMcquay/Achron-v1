import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SelectField from "@/components/form/SelectField";
import {
  ACADEMIC_STATUSES,
  TERMS,
  GRADUATION_STATUSES,
} from "@/lib/academic-constants";
import {
  getAcademicYearOptions,
  getDegreeStartYearOptions,
  getCurrentAcademicYear,
  getCurrentTerm,
} from "@/lib/academic-datetime";

// Authoritative academic profile form. Reused by Onboarding (academic step),
// Profile (edit + read-only), and the Extraction review dialog so the same
// fields, labels and dropdown options appear everywhere — no duplicated sets.

export function createEmptyAcademicProfile() {
  return {
    full_name: "",
    // Authoritative references (populated by InstitutionSearch + ProgramSelector).
    institution_id: "",
    catalog_id: "",
    program_id: "",
    program_name: "",
    // Denormalized display snapshots kept in sync with the references above.
    institution: "",
    degree_type: "",
    major: "",
    minor: "",
    catalog_year: "",
    degree_start_year: "",
    academic_year: getCurrentAcademicYear(),
    current_term: getCurrentTerm(),
    academic_status: "",
    credits_completed: undefined,
    credits_required: undefined,
    gpa: undefined,
    expected_graduation: "",
    graduation_status: "in_progress",
  };
}

function NumberField({ id, label, value, onChange, step, placeholder, disabled }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step || "1"}
        min="0"
        placeholder={placeholder}
        value={value === undefined || value === null ? "" : value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : Number(v));
        }}
        className="h-11"
        disabled={disabled}
      />
    </div>
  );
}

export default function AcademicInfoForm({ value = {}, onChange, disabled }) {
  const set = (field) => (v) => onChange({ ...value, [field]: v });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input
          id="full_name"
          value={value.full_name || ""}
          onChange={(e) => set("full_name")(e.target.value)}
          placeholder="Your name as it appears on records"
          className="h-11"
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="minor">Minor</Label>
        <Input
          id="minor"
          value={value.minor || ""}
          onChange={(e) => set("minor")(e.target.value)}
          placeholder="Optional"
          className="h-11"
          disabled={disabled}
        />
      </div>
      <SelectField
        id="academic_status"
        label="Academic status"
        value={value.academic_status}
        onChange={set("academic_status")}
        options={ACADEMIC_STATUSES}
        placeholder="Select status"
        disabled={disabled}
      />

      <SelectField
        id="degree_start_year"
        label="Degree start year"
        description="When you began this degree."
        value={value.degree_start_year}
        onChange={set("degree_start_year")}
        options={getDegreeStartYearOptions()}
        placeholder="Select year"
        disabled={disabled}
      />
      <SelectField
        id="academic_year"
        label="Current academic year"
        value={value.academic_year}
        onChange={set("academic_year")}
        options={getAcademicYearOptions()}
        placeholder="Select year"
        disabled={disabled}
      />
      <SelectField
        id="current_term"
        label="Current term"
        value={value.current_term}
        onChange={set("current_term")}
        options={TERMS}
        placeholder="Select term"
        disabled={disabled}
      />

      <SelectField
        id="graduation_status"
        label="Graduation status"
        value={value.graduation_status}
        onChange={set("graduation_status")}
        options={GRADUATION_STATUSES}
        placeholder="Select status"
        disabled={disabled}
      />

      <NumberField
        id="credits_completed"
        label="Credits completed"
        value={value.credits_completed}
        onChange={set("credits_completed")}
        placeholder="0"
        disabled={disabled}
      />
      <NumberField
        id="credits_required"
        label="Credits required"
        value={value.credits_required}
        onChange={set("credits_required")}
        placeholder="120"
        disabled={disabled}
      />

      <NumberField
        id="gpa"
        label="GPA"
        value={value.gpa}
        onChange={set("gpa")}
        step="0.01"
        placeholder="0.00"
        disabled={disabled}
      />
      <div className="space-y-2">
        <Label htmlFor="expected_graduation">Expected graduation</Label>
        <Input
          id="expected_graduation"
          value={value.expected_graduation || ""}
          onChange={(e) => set("expected_graduation")(e.target.value)}
          placeholder="e.g. Spring 2027"
          className="h-11"
          disabled={disabled}
        />
      </div>
    </div>
  );
}