import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import AcademicInfoForm, {
  createEmptyAcademicProfile,
} from "@/components/academic/AcademicInfoForm";
import InstitutionSearch from "@/components/academic/InstitutionSearch";
import ProgramSelector from "@/components/academic/ProgramSelector";
import DocumentsPanel from "@/components/documents/DocumentsPanel";
import { importExtractedCourses } from "@/lib/course-import";
import {
  ACADEMIC_STATUSES,
  TERMS,
  GRADUATION_STATUSES,
  labelFor,
} from "@/lib/academic-constants";
import { toast } from "@/components/ui/use-toast";
import {
  Pencil,
  Check,
  X,
  Mail,
  Shield,
  FileText,
  Loader2,
} from "lucide-react";

function ReadRow({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium truncate">{value || "—"}</p>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [docs, setDocs] = useState([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    const list = await base44.entities.AcademicProfile.list("-updated_date", 1);
    setProfile(list[0] || null);
    const docList = await base44.entities.Document.list("-created_date", 50);
    setDocs(docList);
  };

  useEffect(() => {
    (async () => {
      try {
        await loadAll();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const startEdit = () => {
    setDraft({ ...createEmptyAcademicProfile(), ...profile });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const payload = { ...draft, onboarding_complete: true };
      await base44.functions.invoke("saveAcademicProfile", {
        profile_id: profile?.id || undefined,
        data: payload,
      });
      await loadAll();
      setEditing(false);
      setDraft(null);
      toast({ title: "Profile updated" });
    } catch (err) {
      toast({
        title: "Update failed",
        description: err?.response?.data?.error || err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const applyAcademicData = async (data) => {
    const merged = { ...createEmptyAcademicProfile(), ...profile, ...data, onboarding_complete: true };
    await base44.functions.invoke("saveAcademicProfile", {
      profile_id: profile?.id || undefined,
      data: merged,
    });
    await loadAll();
  };

  const applyCourses = async (courses) => importExtractedCourses(courses);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const initials = (user?.full_name || user?.email || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const display = editing ? draft : { ...createEmptyAcademicProfile(), ...profile };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">
          Your account, academic information, and documents.
        </p>
      </div>

      {/* Account */}
      <Card>
        <CardContent className="py-6 flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg font-medium">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold truncate">
              {profile?.full_name || user?.full_name || "Student"}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
              <Mail className="w-3.5 h-3.5" /> {user?.email}
            </p>
            <div className="mt-2">
              <Badge variant="secondary" className="capitalize">
                <Shield className="w-3 h-3 mr-1" />
                {user?.role || "user"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Academic information */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Academic information</CardTitle>
            <CardDescription>
              The authoritative source for your academic details across the app.
            </CardDescription>
          </div>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-1" />
                )}
                Save
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-6">
              <InstitutionSearch
                value={{
                  institution_id: draft.institution_id,
                  institution: draft.institution,
                }}
                onChange={(sel) =>
                  setDraft({
                    ...draft,
                    institution_id: sel.institution_id,
                    institution: sel.institution,
                    // Clear the dependent chain when the school changes so a
                    // School B + Program A combination can never be saved.
                    manual_mode: false,
                    catalog_id: "",
                    catalog_year: "",
                    program_id: "",
                    program_name: "",
                    degree_type: "",
                    major: "",
                    credits_required: undefined,
                  })
                }
              />
              <ProgramSelector
                institutionId={draft.institution_id}
                value={{
                  catalog_id: draft.catalog_id,
                  program_id: draft.program_id,
                  degree_type: draft.degree_type,
                  major: draft.major,
                  catalog_year: draft.catalog_year,
                }}
                onChange={(sel) =>
                  setDraft({
                    ...draft,
                    catalog_id: sel.catalog_id || "",
                    catalog_year: sel.catalog_year || "",
                    program_id: sel.program_id || "",
                    program_name: sel.program_name || "",
                    degree_type: sel.degree_type || "",
                    major: sel.major || "",
                    credits_required:
                      sel.credits_required !== undefined
                        ? sel.credits_required
                        : draft.credits_required,
                  })
                }
              />
              <div className="pt-2 border-t border-border">
                <AcademicInfoForm value={draft} onChange={setDraft} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <ReadRow label="Institution" value={display.institution} />
              <ReadRow label="Year started" value={display.catalog_year} />
              <ReadRow label="Major" value={display.program_name || display.major} />
              <ReadRow label="Degree" value={display.degree_type} />
              <ReadRow label="Minor" value={display.minor} />
              <ReadRow
                label="Academic status"
                value={labelFor(ACADEMIC_STATUSES, display.academic_status)}
              />
              <ReadRow
                label="Term"
                value={`${labelFor(TERMS, display.current_term)}${
                  display.academic_year ? ` · ${display.academic_year}` : ""
                }`}
              />
              <ReadRow
                label="Credits"
                value={`${display.credits_completed ?? "—"} / ${
                  display.credits_required ?? "—"
                }`}
              />
              <ReadRow
                label="GPA"
                value={display.gpa != null ? Number(display.gpa).toFixed(2) : "—"}
              />
              <ReadRow
                label="Graduation"
                value={`${labelFor(GRADUATION_STATUSES, display.graduation_status)}${
                  display.expected_graduation ? ` · ${display.expected_graduation}` : ""
                }`}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Documents */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Documents</h2>
        </div>
        <DocumentsPanel
          docs={docs}
          onDocsChange={setDocs}
          currentProfile={profile || {}}
          onApplyAcademicData={applyAcademicData}
          onApplyCourses={applyCourses}
        />
      </div>
    </div>
  );
}