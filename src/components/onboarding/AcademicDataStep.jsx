import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import DocumentUploader from "@/components/documents/DocumentUploader";
import ConflictResolutionDialog from "@/components/documents/ConflictResolutionDialog";
import { FileText, ClipboardList, PencilLine, Loader2, GraduationCap } from "lucide-react";

// Onboarding-focused "Let's build your academic roadmap" step.
//
// Presents three explicit choices — upload a transcript, upload a degree audit,
// or enter information manually — and reuses the shared upload → extract →
// review → confirm → degree-engine pipeline. Extracted data is NEVER
// authoritative until the student confirms it in the review dialog.
//
// Manual entry is always available; uploading is never required. Both a
// transcript and a degree audit may be uploaded; imported courses are
// deduplicated by the shared course-import module (code + term + year + grade).
export default function AcademicDataStep({
  docs,
  onDocsChange,
  currentProfile = {},
  onApplyAcademicData,
  onApplyCourses,
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [manualChosen, setManualChosen] = useState(false);
  const [extractingType, setExtractingType] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [review, setReview] = useState({
    open: false,
    extracted: {},
    confidence: {},
    warnings: [],
    institution_match: "unknown",
    doc: null,
  });

  const transcript = docs.find((d) => d.document_type === "transcript");
  const degreeAudit = docs.find((d) => d.document_type === "degree_audit");

  const refresh = async () => {
    const list = await base44.entities.Document.list("-created_date", 50);
    onDocsChange(list);
  };

  const handleCreated = async () => refresh();
  const handleRemoved = async () => refresh();

  const handleExtract = async (doc) => {
    setExtractingType(doc.document_type);
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
          title: "We couldn't reliably read this document",
          description: "You can try another file or enter your information manually.",
          variant: "destructive",
        });
      }
    } catch (err) {
      await base44.entities.Document
        .update(doc.id, { extraction_status: "failed" })
        .catch(() => {});
      await refresh();
      toast({
        title: "We couldn't reliably read this document",
        description: err?.message || "You can try another file or enter your information manually.",
        variant: "destructive",
      });
    } finally {
      setExtractingType(null);
    }
  };

  const handleApply = async ({ academicData, courses }) => {
    setProcessing(true);
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
          : "Your academic profile has been updated.";
      toast({ title: "Information updated", description });
      setReview({
        open: false,
        extracted: {},
        confidence: {},
        warnings: [],
        institution_match: "unknown",
        doc: null,
      });
    } catch (err) {
      toast({ title: "Could not apply", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const options = [
    {
      key: "transcript",
      label: "Upload my transcript",
      desc: "Automatically scan your transcript and add your courses, grades, credits, terms, school, and academic history.",
      icon: FileText,
      active: showTranscript || !!transcript,
      onClick: () => setShowTranscript(true),
    },
    {
      key: "degree_audit",
      label: "Upload my degree audit",
      desc: "Use your degree audit to identify completed, in-progress, and remaining requirements.",
      icon: ClipboardList,
      active: showAudit || !!degreeAudit,
      onClick: () => setShowAudit(true),
    },
    {
      key: "manual",
      label: "Enter my information manually",
      desc: "Enter your academic information yourself.",
      icon: PencilLine,
      active: manualChosen,
      onClick: () => setManualChosen(true),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <GraduationCap className="w-5 h-5 text-primary" />
        <h3 className="text-base font-semibold">Let's build your academic roadmap</h3>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">
        Do you have a transcript or degree audit? You can upload both, or enter your
        information manually.
      </p>

      <div className="grid grid-cols-1 gap-3">
        {options.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.key}
              type="button"
              onClick={o.onClick}
              className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                o.active ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"
              }`}
            >
              <div className="mt-0.5 shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">{o.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{o.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {(showTranscript || transcript) && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Transcript</h4>
          <DocumentUploader
            documentType="transcript"
            existingDoc={transcript}
            onCreated={handleCreated}
            onRemoved={handleRemoved}
            onExtract={handleExtract}
            extracting={extractingType === "transcript"}
          />
        </div>
      )}

      {(showAudit || degreeAudit) && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Degree audit</h4>
          <DocumentUploader
            documentType="degree_audit"
            existingDoc={degreeAudit}
            onCreated={handleCreated}
            onRemoved={handleRemoved}
            onExtract={handleExtract}
            extracting={extractingType === "degree_audit"}
          />
        </div>
      )}

      {manualChosen && !transcript && !degreeAudit && (
        <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          No problem — you can add your courses anytime from the Planner after setup. Your
          academic details from the previous step are saved.
        </div>
      )}

      {processing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Building your academic profile…
        </div>
      )}

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