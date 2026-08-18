import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trash2,
  FileText,
  Sparkles,
} from "lucide-react";
import {
  DOCUMENT_UPLOAD,
  DOCUMENT_TYPES,
  labelFor,
  EXTRACTION_STATUSES,
} from "@/lib/academic-constants";
import { formatTimestamp } from "@/lib/academic-datetime";
import { toast } from "@/components/ui/use-toast";

// One document "slot" card: empty / uploading / success / error states with
// validation, retry, replace and delete. Extraction is delegated to the parent
// via onExtract so the review dialog stays centralized.
export default function DocumentUploader({
  documentType,
  existingDoc,
  onCreated,
  onRemoved,
  onExtract,
  extracting,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const typeLabel = labelFor(DOCUMENT_TYPES, documentType);

  const validate = (file) => {
    if (file.size > DOCUMENT_UPLOAD.maxBytes) {
      return `File is too large. Maximum size is ${
        DOCUMENT_UPLOAD.maxBytes / (1024 * 1024)
      } MB.`;
    }
    const okMime = DOCUMENT_UPLOAD.acceptedMimeTypes.includes(file.type);
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    const okExt = DOCUMENT_UPLOAD.acceptedExtensions.includes(ext);
    if (!okMime && !okExt) {
      return "Unsupported file type. Use PDF, PNG, JPG, or WebP.";
    }
    return "";
  };

  const handleFile = async (file) => {
    setError("");
    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      toast({ title: "Upload not started", description: validationError, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const doc = await base44.entities.Document.create({
        file_url,
        file_name: file.name,
        document_type: documentType,
        mime_type: file.type,
        file_size: file.size,
        extraction_status: "none",
        extracted_data: {},
      });
      onCreated?.(doc);
      toast({ title: `${typeLabel} uploaded`, description: file.name });
    } catch (err) {
      setError(err.message || "Upload failed. Please try again.");
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleReplace = async () => {
    if (!existingDoc) return;
    try {
      await base44.entities.Document.delete(existingDoc.id);
      onRemoved?.(existingDoc);
    } catch (err) {
      toast({ title: "Could not replace", description: err.message, variant: "destructive" });
      return;
    }
    inputRef.current?.click();
  };

  const handleDelete = async () => {
    if (!existingDoc) return;
    try {
      await base44.entities.Document.delete(existingDoc.id);
      onRemoved?.(existingDoc);
      toast({ title: `${typeLabel} removed` });
    } catch (err) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const canExtract =
    (documentType === "transcript" || documentType === "degree_audit") && !!existingDoc;

  // ---- Success state (a document exists) ----
  if (existingDoc) {
    const ex = EXTRACTION_STATUSES[existingDoc.extraction_status] || EXTRACTION_STATUSES.none;
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-foreground truncate">{existingDoc.file_name}</p>
              <Badge variant="secondary">{typeLabel}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Uploaded {formatTimestamp(existingDoc.created_date)}
            </p>
            <div className="mt-2">
              <Badge variant={ex.tone === "destructive" ? "destructive" : "secondary"}>
                {ex.label}
              </Badge>
            </div>
          </div>
        </div>

        {canExtract && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onExtract?.(existingDoc)}
            disabled={extracting}
          >
            {extracting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Reading your academic record…
              </>
            ) : existingDoc.extraction_status === "extracted" ? (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Review extracted data
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Extract academic data
              </>
            )}
          </Button>
        )}

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-muted-foreground"
            onClick={handleReplace}
            disabled={uploading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Replace
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={uploading}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>
    );
  }

  // ---- Empty / uploading / error state ----
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_UPLOAD.acceptedExtensions.join(",")}
        className="hidden"
        onChange={onPick}
      />
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
          <UploadCloud className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{typeLabel}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            PDF, PNG, JPG or WebP · up to {DOCUMENT_UPLOAD.maxBytes / (1024 * 1024)} MB
          </p>
        </div>
      </div>

      {uploading ? (
        <div className="space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
            <div className="h-full w-1/2 rounded-full bg-primary animate-pulse" />
          </div>
          <p className="text-xs text-muted-foreground text-center">Uploading your document…</p>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloud className="w-4 h-4 mr-2" />
          Upload {typeLabel}
        </Button>
      )}

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}