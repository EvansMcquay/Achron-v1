import React from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Controlled select with label + placeholder, used everywhere categorical
// academic fields appear so styling and behavior stay consistent.
export default function SelectField({
  id,
  label,
  description,
  value,
  onChange,
  options,
  placeholder = "Select…",
  className,
  disabled,
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {description && (
        <p className="text-xs text-muted-foreground -mt-1">{description}</p>
      )}
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="h-11">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}