import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import DocumentUploader from "@/components/documents/DocumentUploader";
import ConflictResolutionDialog from "@/components/documents/ConflictResolutionDialog";
import { FileStack } from "lucide-react";

// Orchestrates document upload, extraction, and review for a user.
// Used by both Onboarding (documents step) and Profile (upload-later).
// `currentProfile` seeds the extraction review form; `onApplyAcademicData` and
// `onApplyCourses` let the parent persist confirmed data to the authoritative
// AcademicProfile / Course entities.
export default function DocumentsPanel({
  docs,
  onDocsChange,
  currentProfile = {},
  onApplyAcademicData,
  onApplyCourses,
}) {
  const [extractingId, setExtractingId] = useState(null);
  const [review, setReview] = useState({ open: false, extracted: {}, confidence: {}, warnings: [], institution_match: "unknown", doc: null });

  const transcript = docs.find((d) => d.document_type === "transcript");
  const degreeAudit = docs.find((d) => d.document_type === "degree_audit");
  const others = docs.filter((d) => d.document_type === "other");

  const refresh = async () => {
    const list = await base44.entities.Document.list("-created_date", 50);
    onDocsChange(list);
  };

  const handleCreated = async () => refresh();
  const handleRemoved = async () => refresh();

  const handleExtract = async (doc) => {
    setExtractingId(doc.id);
    // Optimistically mark as pending so the UI reflects processing.
    onDocsChange(
      docs.map((d) => (d.id === doc.id ? { ...d, extraction_status: "pending" } : d))
    );
    try {
      const res = await base44.functions.invoke("extractDocumentData", {
        file_url: doc.file_url,
        document_type: doc.document_type,
        expected_institution: currentProfile?.institution || "",
      });
      const data = res?.data || {};
      if (data.status === "success") {
        const extracted = data.extracted_data || {};
        const confidence = data.confidence || {};
        const warnings = Array.isArray(data.warnings) ? data.warnings : [];
        const institution_match = data.institution_match || "unknown";
        await base44.entities.Document.update(doc.id, {
          extraction_status: "extracted",
          extracted_data: extracted,
        });
        await refresh();
        setReview({ open: true, extracted, confidence, warnings, institution_match, doc });
      } else {
        await base44.entities.Document.update(doc.id, { extraction_status: "failed" });
        await refresh();
        toast({
          title: "Could not extract data",
          description: data.error || "The document could not be parsed. You can still keep it and enter details manually.",
          variant: "destructive",
        });
      }
    } catch (err) {
      await base44.entities.Document.update(doc.id, { extraction_status: "failed" }).catch(() => {});
      await refresh();
      toast({
        title: "Extraction failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setExtractingId(null);
    }
  };

  const handleApply = async ({ academicData, courses }) => {
    try {
      if (onApplyAcademicData) await onApplyAcademicData(academicData);
      let created = 0;
      let skipped = 0;
      if (courses && courses.length && onApplyCourses) {
        const res = await onApplyCourses(courses);
        if (res && typeof res === "object") {
          created = res.created || 0;
          skipped = res.skipped || 0;
        }
      }
      const description =
        created || skipped
          ? `${created} course(s) added${skipped ? `, ${skipped} duplicate(s) skipped` : ""}.`
          : "Reviewed data has been applied to your profile.";
      toast({ title: "Information updated", description });
      setReview({ open: false, extracted: {}, confidence: {}, warnings: [], institution_match: "unknown", doc: null });
    } catch (err) {
      toast({ title: "Could not apply", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DocumentUploader
          documentType="transcript"
          existingDoc={transcript}
          onCreated={handleCreated}
          onRemoved={handleRemoved}
          onExtract={handleExtract}
          extracting={extractingId === transcript?.id}
        />
        <DocumentUploader
          documentType="degree_audit"
          existingDoc={degreeAudit}
          onCreated={handleCreated}
          onRemoved={handleRemoved}
          onExtract={handleExtract}
          extracting={extractingId === degreeAudit?.id}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileStack className="w-4 h-4" />
          Other documents
        </div>
        {others.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {others.map((doc) => (
              <DocumentUploader
                key={doc.id}
                documentType="other"
                existingDoc={doc}
                onCreated={handleCreated}
                onRemoved={handleRemoved}
              />
            ))}
          </div>
        )}
        <DocumentUploader
          documentType="other"
          existingDoc={null}
          onCreated={handleCreated}
          onRemoved={handleRemoved}
        />
        {others.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No other documents yet. Add syllabi, transfer letters, or anything useful.
          </p>
        )}
      </div>

      <ConflictResolutionDialog
        open={review.open}
        onOpenChange={(o) => setReview({ ...review, open: o })}
        extracted={review.extracted}
        confidence={review.confidence}
        warnings={review.warnings}
        institutionMatch={review.institution_match}
        currentProfile={currentProfile}
        onApply={handleApply}
      />
    </div>
  );
}