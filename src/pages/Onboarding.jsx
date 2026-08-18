import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import AcademicInfoForm, {
  createEmptyAcademicProfile,
} from "@/components/academic/AcademicInfoForm";
import InstitutionSearch from "@/components/academic/InstitutionSearch";
import ProgramSelector from "@/components/academic/ProgramSelector";
import AcademicDataStep from "@/components/onboarding/AcademicDataStep";
import { importExtractedCourses } from "@/lib/course-import";
import {
  DEGREE_TYPES,
  ACADEMIC_STATUSES,
  GRADUATION_STATUSES,
  TERMS,
  labelFor,
} from "@/lib/academic-constants";
import { getCurrentAcademicYear, getCurrentTerm } from "@/lib/academic-datetime";
import { toast } from "@/components/ui/use-toast";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  User,
  GraduationCap,
  FileText,
  ClipboardCheck,
  Loader2,
} from "lucide-react";

const STEPS = [
  { key: "basic", label: "Basic info", icon: User },
  { key: "academic", label: "Academic info", icon: GraduationCap },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "review", label: "Review", icon: ClipboardCheck },
];

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(() => ({
    ...createEmptyAcademicProfile(),
    full_name: user?.full_name || "",
  }));
  const [existingProfileId, setExistingProfileId] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await base44.entities.AcademicProfile.list("-updated_date", 1);
        const existing = list[0];
        const docList = await base44.entities.Document.list("-created_date", 50);
        setDocs(docList);
        if (existing) {
          if (existing.onboarding_complete) {
            navigate("/", { replace: true });
            return;
          }
          // Resume partial onboarding.
          setExistingProfileId(existing.id);
          setProfile((prev) => ({ ...prev, ...existing }));
        }
      } catch {
        // No profile yet — continue with defaults.
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const applyAcademicData = (data) => {
    setProfile((prev) => ({ ...prev, ...data }));
    return Promise.resolve();
  };

  const applyCourses = async (courses) => importExtractedCourses(courses);

  const validateStep = (i) => {
    if (i === 0) {
      if (!profile.full_name?.trim()) return "Please enter your full name.";
      if (!profile.institution_id) return "Please select your institution.";
    }
    if (i === 1) {
      if (!profile.manual_mode) {
        if (!profile.degree_type) return "Please choose your degree type.";
        if (!profile.major) return "Please choose your major.";
        if (!profile.program_id) return "Please choose the year you started your degree.";
      }
    }
    return null;
  };

  const next = () => {
    const err = validateStep(step);
    if (err) {
      toast({ title: "Almost there", description: err, variant: "destructive" });
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finish = async () => {
    const err = validateStep(1);
    if (err) {
      toast({ title: "Missing info", description: err, variant: "destructive" });
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...profile, onboarding_complete: true };
      // Persist through the server-side validation function so the
      // institution/catalog/program chain is verified and snapshots refreshed
      // before the profile is saved.
      await base44.functions.invoke("saveAcademicProfile", {
        profile_id: existingProfileId || undefined,
        data: payload,
      });
      toast({ title: "You're all set", description: "Welcome to Degree Compass." });
      navigate("/", { replace: true });
    } catch (err) {
      toast({
        title: "Could not finish onboarding",
        description: err?.response?.data?.error || err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-10">
          {STEPS.map((s, i) => {
            const active = i === step;
            const done = i < step;
            return (
              <React.Fragment key={s.key}>
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : done
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <s.icon className="w-5 h-5" />
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      active ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 -mt-6 rounded ${
                      i < step ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{STEPS[step].label}</CardTitle>
            <CardDescription>
              {step === 0 && "Let's start with a few basics about you."}
              {step === 1 && "Choose your degree and major."}
              {step === 2 &&
                "Let's build your academic roadmap. Upload a transcript or degree audit to auto-fill your progress, or enter your information manually."}
              {step === 3 && "Review your information and finish setup."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 0 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ob_name">Full name</Label>
                  <Input
                    id="ob_name"
                    value={profile.full_name || ""}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    placeholder="Your name"
                    className="h-11"
                  />
                </div>
                <InstitutionSearch
                  value={{
                    institution_id: profile.institution_id,
                    institution: profile.institution,
                  }}
                  onChange={(sel) =>
                    setProfile({
                      ...profile,
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
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Institution</Label>
                  <div className="rounded-md border border-input px-3 py-2.5 text-sm bg-muted/30">
                    {profile.institution || "—"}
                  </div>
                </div>
                <ProgramSelector
                  institutionId={profile.institution_id}
                  value={{
                    catalog_id: profile.catalog_id,
                    program_id: profile.program_id,
                    degree_type: profile.degree_type,
                    major: profile.major,
                    catalog_year: profile.catalog_year,
                  }}
                  onChange={(sel) =>
                    setProfile({
                      ...profile,
                      catalog_id: sel.catalog_id || "",
                      catalog_year: sel.catalog_year || "",
                      program_id: sel.program_id || "",
                      program_name: sel.program_name || "",
                      degree_type: sel.degree_type || "",
                      major: sel.major || "",
                      credits_required:
                        sel.credits_required !== undefined
                          ? sel.credits_required
                          : profile.credits_required,
                    })
                  }
                />
                <div className="pt-2 border-t border-border">
                  <h4 className="text-sm font-medium mb-3">
                    Academic details
                  </h4>
                  <AcademicInfoForm value={profile} onChange={setProfile} />
                </div>
              </div>
            )}

            {step === 2 && (
              <AcademicDataStep
                docs={docs}
                onDocsChange={setDocs}
                currentProfile={profile}
                onApplyAcademicData={applyAcademicData}
                onApplyCourses={applyCourses}
              />
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Basic
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Name</span>
                    <span>{profile.full_name || "—"}</span>
                    <span className="text-muted-foreground">Institution</span>
                    <span>{profile.institution || "—"}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Academic
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Degree</span>
                    <span>
                      {profile.manual_mode ? (
                        <span className="text-muted-foreground italic">Pending verification</span>
                      ) : (
                        labelFor(DEGREE_TYPES, profile.degree_type)
                      )}
                    </span>
                    <span className="text-muted-foreground">Major</span>
                    <span>
                      {profile.manual_mode ? (
                        <span className="text-muted-foreground italic">Pending verification</span>
                      ) : (
                        profile.major || "—"
                      )}
                    </span>
                    <span className="text-muted-foreground">Catalog year</span>
                    <span>
                      {profile.manual_mode ? (
                        <span className="text-muted-foreground italic">Pending verification</span>
                      ) : (
                        profile.catalog_year || "—"
                      )}
                    </span>
                    <span className="text-muted-foreground">Degree start year</span>
                    <span>{profile.degree_start_year || "—"}</span>
                    <span className="text-muted-foreground">Minor</span>
                    <span>{profile.minor || "—"}</span>
                    <span className="text-muted-foreground">Status</span>
                    <span>{labelFor(ACADEMIC_STATUSES, profile.academic_status)}</span>
                    <span className="text-muted-foreground">Term</span>
                    <span>
                      {labelFor(TERMS, profile.current_term)} · {profile.academic_year}
                    </span>
                    <span className="text-muted-foreground">Credits</span>
                    <span>
                      {profile.credits_completed ?? "—"} / {profile.credits_required ?? "—"}
                    </span>
                    <span className="text-muted-foreground">GPA</span>
                    <span>{profile.gpa != null ? Number(profile.gpa).toFixed(2) : "—"}</span>
                    <span className="text-muted-foreground">Graduation</span>
                    <span>
                      {labelFor(GRADUATION_STATUSES, profile.graduation_status)}
                      {profile.expected_graduation ? ` · ${profile.expected_graduation}` : ""}
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Documents
                  </h4>
                  <p className="text-sm">
                    {docs.length} uploaded. You can manage these anytime from your Profile.
                  </p>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button variant="ghost" onClick={back} disabled={step === 0 || saving}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={next}>
                  {step === 2 && docs.length === 0 ? "Continue without uploading" : "Continue"}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={finish} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Finishing…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Finish setup
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}