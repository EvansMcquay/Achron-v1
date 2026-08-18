import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import CreditProgressCard from "@/components/dashboard/CreditProgressCard";
import {
  GraduationCap,
  CalendarDays,
  TrendingUp,
  Award,
  FileText,
  BookOpen,
} from "lucide-react";
import {
  formatToday,
  getCurrentTerm,
  getCurrentAcademicYear,
  getUpcomingTerm,
} from "@/lib/academic-datetime";
import { labelFor, DEGREE_TYPES, GRADUATION_STATUSES } from "@/lib/academic-constants";

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [docCount, setDocCount] = useState(0);
  const [courseCount, setCourseCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const profiles = await base44.entities.AcademicProfile.list("-updated_date", 1);
        const p = profiles[0];
        // Guard: if no profile or onboarding never finished, go to onboarding.
        if (!p || !p.onboarding_complete) {
          navigate("/onboarding", { replace: true });
          return;
        }
        setProfile(p);
        const docs = await base44.entities.Document.list("-created_date", 50);
        setDocCount(docs.length);
        const courses = await base44.entities.Course.list("-created_date", 50);
        setCourseCount(courses.length);
      } catch {
        navigate("/onboarding", { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Dynamic current context (from the centralized date utility — never hard-coded).
  const todayTerm = getCurrentTerm();
  const todayAcademicYear = getCurrentAcademicYear();
  const upcoming = getUpcomingTerm();

  // Authoritative academic info comes from the profile (single source of truth).
  const creditsCompleted = profile.credits_completed || 0;
  const creditsRequired = profile.credits_required || 0;
  const creditPct = creditsRequired
    ? Math.min(100, Math.round((creditsCompleted / creditsRequired) * 100))
    : 0;
  const remaining = Math.max(0, creditsRequired - creditsCompleted);

  const stats = [
    {
      label: "Credits completed",
      value: `${creditsCompleted}${creditsRequired ? ` / ${creditsRequired}` : ""}`,
      hint: remaining ? `${remaining} remaining` : "Requirements met",
      icon: Award,
    },
    {
      label: "GPA",
      value: profile.gpa != null ? Number(profile.gpa).toFixed(2) : "—",
      hint: "Grade point average",
      icon: TrendingUp,
    },
    {
      label: "Academic status",
      value: profile.academic_status || "—",
      hint: labelFor(DEGREE_TYPES, profile.degree_type),
      icon: GraduationCap,
    },
    {
      label: "Graduation",
      value: labelFor(GRADUATION_STATUSES, profile.graduation_status),
      hint: profile.expected_graduation || "No date set",
      icon: CalendarDays,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">{formatToday()}</p>
        <h1 className="text-3xl font-bold tracking-tight mt-1">
          Welcome back, {profile.full_name || user?.full_name || "student"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {profile.institution} · {profile.major || "Your major"}
        </p>
      </div>

      {/* Today's academic context — dynamically derived */}
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary-foreground/70">
              Current academic context
            </p>
            <p className="text-xl font-semibold mt-1">
              {todayTerm} · {todayAcademicYear}
            </p>
            <p className="text-sm text-primary-foreground/80 mt-1">
              Upcoming: {upcoming.term} {upcoming.year}
            </p>
          </div>
          <div className="text-sm text-primary-foreground/80">
            Your declared term: {profile.current_term || "—"} · {profile.academic_year || "—"}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="py-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <s.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold mt-2">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <CreditProgressCard
        creditsCompleted={creditsCompleted}
        creditsRequired={creditsRequired}
        onViewDetails={() => navigate("/progress")}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-medium">{docCount} document{docCount === 1 ? "" : "s"}</p>
              <p className="text-sm text-muted-foreground">Transcripts, audits & files</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/profile")}>
              Manage
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-medium">{courseCount} course{courseCount === 1 ? "" : "s"}</p>
              <p className="text-sm text-muted-foreground">In your planner</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/planner")}>
              Open
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}