import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Award,
  TrendingUp,
  GraduationCap,
  CalendarDays,
  BookOpen,
  ArrowRight,
  AlertTriangle,
  Lock,
  CircleDot,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { labelFor, DEGREE_TYPES, GRADUATION_STATUSES, ACADEMIC_STATUSES } from "@/lib/academic-constants";

const REQUIREMENT_EXPLANATIONS = {
  advanced_course: "Higher-level coursework required by this program. The exact definition is determined by your school's catalog.",
  upper_level: "Courses at the upper undergraduate level that satisfy this requirement.",
  business_elective: "Approved business courses that satisfy your program's elective requirement.",
  major_elective: "Elective courses within your major that count toward this requirement.",
  free_elective: "Any course that counts toward your program's free-elective credits.",
  general_education: "General-education requirement courses.",
  major_requirement: "A required course for your major.",
  required_course: "A specific course you must complete.",
  concentration: "A required set of courses for your concentration.",
  elective_credits: "Earn the required credits from qualifying courses.",
  min_credits: "Earn the required credits from the listed (or level-qualifying) courses.",
};

const STATUS_META = {
  satisfied: { label: "Satisfied", variant: "secondary", icon: CheckCircle2, tone: "text-emerald-600" },
  in_progress: { label: "In progress", variant: "default", icon: CircleDot, tone: "text-blue-600" },
  not_satisfied: { label: "Remaining", variant: "outline", icon: XCircle, tone: "text-muted-foreground" },
  blocked: { label: "Blocked", variant: "destructive", icon: Lock, tone: "text-destructive" },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.not_satisfied;
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className="gap-1">
      <Icon className="w-3 h-3" />
      {meta.label}
    </Badge>
  );
}

export default function DegreeProgress() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [reqStatus, setReqStatus] = useState("pending");
  const [error, setError] = useState("");
  const triggeredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await base44.entities.AcademicProfile.list("-updated_date", 1);
        const p = list[0] || null;
        setProfile(p);
        if (!p) { setLoading(false); return; }

        let res = await base44.functions.invoke("computeDegreeProgress", { profile_id: p.id });
        let prog = res.data?.progress || null;
        let status = res.data?.requirements_status || "pending";
        let progId = res.data?.program_id || null;
        setReqStatus(status);

        // Lazy requirement discovery: program bound, no groups yet, status pending.
        if (
          prog &&
          prog.program_bound !== false &&
          (prog.groups || []).length === 0 &&
          status === "pending" &&
          progId &&
          !triggeredRef.current
        ) {
          triggeredRef.current = true;
          setDiscovering(true);
          try {
            await base44.functions.invoke("discoverProgramRequirements", { program_id: progId });
          } catch (e) {
            // discovery failed — fall through with empty structure
          }
          setDiscovering(false);
          res = await base44.functions.invoke("computeDegreeProgress", { profile_id: p.id });
          prog = res.data?.progress || null;
          status = res.data?.requirements_status || "pending";
          setReqStatus(status);
        }

        if (cancelled) return;
        setProgress(prog);
        setError(res.data?.error || "");
      } catch (err) {
        setError(err?.response?.data?.error || err.message || "Could not compute progress.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (discovering) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        <p className="text-sm font-medium">Discovering your degree requirements…</p>
        <p className="text-xs text-muted-foreground max-w-sm text-center">
          We're reading your school's official program requirements so we can match your courses and plan what to take next.
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No academic profile yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Finish onboarding to see your degree progress.
          </p>
          <Button className="mt-4" onClick={() => navigate("/onboarding")}>
            Start onboarding
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (error && !progress) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="font-medium">Couldn't evaluate your progress</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // Manual/pending mode: school verified, program not yet.
  if (progress && progress.program_bound === false) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Degree Progress</h1>
          <p className="text-muted-foreground mt-1">
            {profile.institution ? profile.institution : "Your school"} · Program pending verification
          </p>
        </div>
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="py-10 text-center space-y-3">
            <GraduationCap className="w-10 h-10 text-amber-600 mx-auto mb-2" />
            <p className="font-medium text-lg">Your program isn't verified yet</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {progress.message ||
                "Once your school's programs are verified, you can choose your major and start tracking degree progress."}
            </p>
            <Button className="mt-2" variant="outline" onClick={() => navigate("/onboarding")}>
              Choose my program
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const credits = progress?.credits || { required: 0, completed: 0, in_progress: 0, remaining: 0 };
  const reqs = progress?.requirements || { total: 0, completed: [], in_progress: [], remaining: [], blocked: [] };
  const creditPct = credits.required
    ? Math.min(100, Math.round((credits.completed / credits.required) * 100))
    : 0;
  const warnings = progress?.warnings || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Degree Progress</h1>
        <p className="text-muted-foreground mt-1">
          {labelFor(DEGREE_TYPES, profile.degree_type)} in {profile.major || "your major"}
          {profile.institution ? ` · ${profile.institution}` : ""}
          {progress?.catalog_year ? ` · Started ${progress.catalog_year}` : ""}
        </p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Overall completion</p>
              <Award className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-2">{progress?.overall_percentage ?? 0}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              Derived from {reqs.completed.length}/{reqs.total} requirements satisfied
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Credits completed</p>
              <BookOpen className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-2">
              {credits.completed}
              {credits.required ? ` / ${credits.required}` : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {credits.in_progress ? `${credits.in_progress} in progress · ` : ""}
              {credits.remaining ? `${credits.remaining} to go` : "Credit requirement met"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">GPA</p>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-2">
              {profile.gpa != null ? Number(profile.gpa).toFixed(2) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Graduation</p>
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-2">
              {labelFor(GRADUATION_STATUSES, profile.graduation_status)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {profile.expected_graduation || "No date set"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Credit + requirement overview bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Award className="w-4 h-4" /> Credit progress
            </CardTitle>
            <CardDescription>
              {credits.completed} of {credits.required || "?"} credits earned · {creditPct}%
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={creditPct} />
            <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
              <div><p className="font-semibold text-base">{credits.completed}</p><p className="text-muted-foreground">Completed</p></div>
              <div><p className="font-semibold text-base">{credits.in_progress}</p><p className="text-muted-foreground">In progress</p></div>
              <div><p className="font-semibold text-base">{credits.remaining}</p><p className="text-muted-foreground">Remaining</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <GraduationCap className="w-4 h-4" /> Requirement status
            </CardTitle>
            <CardDescription>
              {reqs.total} requirements across {(progress?.groups || []).length} groups
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-2 text-center">
            <div><p className="font-semibold text-base text-emerald-600">{reqs.completed.length}</p><p className="text-xs text-muted-foreground">Completed</p></div>
            <div><p className="font-semibold text-base text-blue-600">{reqs.in_progress.length}</p><p className="text-xs text-muted-foreground">In progress</p></div>
            <div><p className="font-semibold text-base">{reqs.remaining.length}</p><p className="text-xs text-muted-foreground">Remaining</p></div>
            <div><p className="font-semibold text-base text-destructive">{reqs.blocked.length}</p><p className="text-xs text-muted-foreground">Blocked</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Next courses — remaining + blocked, blocked first (shows prerequisites) */}
      {(() => {
        const next = [];
        (progress?.groups || []).forEach((g) => {
          g.requirements.forEach((r) => {
            if (r.status === "blocked" || r.status === "not_satisfied") next.push({ group: g.name, ...r });
          });
        });
        if (!next.length) {
          return (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><BookOpen className="w-4 h-4" /> Next courses</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">No outstanding courses — you're on track!</p></CardContent>
            </Card>
          );
        }
        next.sort((a, b) => (a.status === "blocked" ? -1 : 0) - (b.status === "blocked" ? -1 : 0));
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><BookOpen className="w-4 h-4" /> Next courses</CardTitle>
              <CardDescription>Courses you still need to take — blocked courses show their prerequisites</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {next.map((r, i) => (
                <div key={i} className="flex items-start gap-3 rounded-md border p-3">
                  {r.status === "blocked" ? (
                    <Lock className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
                  ) : (
                    <CircleDot className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {r.official_requirement_name || r.requirement_type.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.group}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.explanation}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4" /> Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {warnings.map((w, i) => (
              <p key={i} className="text-sm text-amber-800">{w.message}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Per-group requirement breakdown */}
      <div className="space-y-4">
        {(progress?.groups || []).map((g) => (
          <Card key={g.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{g.name}</CardTitle>
                <CardDescription className="capitalize">
                  {g.group_type.replace("_", " ")} · {g.completed_count}/{g.total_count} satisfied
                </CardDescription>
              </div>
              <StatusBadge status={g.status} />
            </CardHeader>
            <CardContent className="space-y-2">
              {g.requirements.length === 0 && (
                <p className="text-sm text-muted-foreground">No requirements defined for this group.</p>
              )}
              {g.requirements.map((r, i) => {
                const expKey = r.normalized_type || r.requirement_type;
                const explanation = REQUIREMENT_EXPLANATIONS[expKey];
                return (
                  <div key={i} className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {r.official_requirement_name || r.requirement_type.replace(/_/g, " ")}
                      </p>
                      {explanation && (
                        <p className="text-xs text-muted-foreground mt-0.5">{explanation}</p>
                      )}
                      {r.level_min != null && r.level_max != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.level_min}–{r.level_max} level
                        </p>
                      )}
                      {r.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{r.explanation}</p>
                      {r.needed != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.have} of {r.needed} completed
                        </p>
                      )}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
        {(progress?.groups || []).length === 0 && (
          <Card>
            <CardContent className="py-10 text-center space-y-2">
              <p className="text-sm font-medium">
                {reqStatus === "failed"
                  ? "We couldn't verify your degree requirements right now."
                  : "Some degree requirements haven't been verified yet."}
              </p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                You can still continue — add your courses in the planner, and we'll match them against your school's requirements once they're available.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Plan your courses</CardTitle>
            <CardDescription>Add or update courses in your planner</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/planner")}>
            Open planner <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </CardHeader>
      </Card>
    </div>
  );
}