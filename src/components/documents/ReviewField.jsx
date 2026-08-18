import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, X } from "lucide-react";

// A single APPLIED academic field in the document review. Shown with one of
// three calm statuses — never a red error simply because the document lacked it:
//   FOUND        — extracted from the document (with confidence)
//   NOT FOUND    — absent on the document (neutral); optional manual entry
//   USER ENTERED — the student typed a value manually (validated inline)
// Only an INVALID manually-entered value produces a red error state.

function fmt(v, numeric) {
  if (v === undefined || v === null || v === "") return "—";
  if (numeric) return Number(v).toFixed(Number(v) % 1 === 0 ? 0 : 2);
  return String(v);
}

function confidenceTone(c) {
  if (c == null) return "secondary";
  if (c >= 0.85) return "default";
  if (c >= 0.6) return "secondary";
  return "destructive";
}

export default function ReviewField({ field, extractedValue, currentValue, confidence, onFieldChange }) {
  const { key, label, numeric } = field;
  const hasExtracted = extractedValue !== undefined && extractedValue !== null && extractedValue !== "";
  const hasCurrent = currentValue !== undefined && currentValue !== null && currentValue !== "";
  const [choice, setChoice] = useState(hasExtracted ? "extracted" : hasCurrent ? "current" : "none");
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [error, setError] = useState("");

  const validateManual = (v) => {
    if (v === "") return "";
    if (numeric) {
      const n = Number(v);
      if (Number.isNaN(n)) return "Enter a number.";
      if (key === "gpa" && (n < 0 || n > 4)) return "GPA must be between 0 and 4.";
      if (key !== "gpa" && n < 0) return "Enter a non-negative number.";
    }
    return "";
  };

  useEffect(() => {
    let value;
    let err = "";
    if (manualMode) {
      err = validateManual(manualValue);
      value = err === "" && manualValue.trim() !== "" ? (numeric ? Number(manualValue) : manualValue.trim()) : undefined;
    } else if (choice === "extracted" && hasExtracted) {
      value = extractedValue;
    } else if (choice === "current" && hasCurrent) {
      value = currentValue;
    }
    onFieldChange?.(key, { value, error: err });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMode, manualValue, choice, hasExtracted, hasCurrent, extractedValue, currentValue]);

  const startManual = () => {
    setManualMode(true);
    setChoice("none");
    setManualValue("");
    setError("");
  };

  const onManualChange = (e) => {
    const v = e.target.value;
    setManualValue(v);
    setError(validateManual(v));
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {hasExtracted ? (
          <Badge variant={confidenceTone(confidence)}>
            {confidence != null ? `${Math.round(confidence * 100)}% confident` : "found"}
          </Badge>
        ) : (
          <Badge variant="secondary">not found on document</Badge>
        )}
      </div>

      {hasExtracted ? (
        <div className="grid grid-cols-2 gap-2">
          <label
            className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer ${
              choice === "extracted" ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <input
              type="radio"
              name={key}
              checked={choice === "extracted"}
              onChange={() => { setChoice("extracted"); setManualMode(false); }}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">From document</p>
              <p className="text-sm truncate">{fmt(extractedValue, numeric)}</p>
            </div>
          </label>
          <label
            className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer ${
              choice === "current" ? "border-primary bg-primary/5" : "border-border"
            } ${!hasCurrent ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <input
              type="radio"
              name={key}
              checked={choice === "current"}
              disabled={!hasCurrent}
              onChange={() => { setChoice("current"); setManualMode(false); }}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Current</p>
              <p className="text-sm truncate">{hasCurrent ? fmt(currentValue, numeric) : "—"}</p>
            </div>
          </label>
        </div>
      ) : (
        <div className="space-y-2">
          {hasCurrent && (
            <div className="flex items-center justify-between rounded-md border border-border p-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Current</p>
                <p className="text-sm truncate">{fmt(currentValue, numeric)}</p>
              </div>
              {!manualMode && (
                <Button
                  type="button"
                  size="sm"
                  variant={choice === "current" ? "default" : "outline"}
                  onClick={() => setChoice("current")}
                >
                  Keep current
                </Button>
              )}
            </div>
          )}
          {!manualMode ? (
            <Button type="button" size="sm" variant="outline" onClick={startManual}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              {hasCurrent ? "Enter a different value" : "Enter manually"}
            </Button>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Input
                  type={numeric ? "number" : "text"}
                  value={manualValue}
                  onChange={onManualChange}
                  placeholder={label}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => { setManualMode(false); setManualValue(""); setError(""); }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}