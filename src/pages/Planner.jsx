import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import SelectField from "@/components/form/SelectField";
import { toast } from "@/components/ui/use-toast";
import { TERMS, COURSE_STATUSES, COURSE_SOURCES } from "@/lib/academic-constants";
import {
  getAcademicYearOptions,
  getYearOptions,
  getCurrentAcademicYear,
} from "@/lib/academic-datetime";
import {
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  Loader2,
} from "lucide-react";

const emptyCourse = () => ({
  name: "",
  code: "",
  credits: undefined,
  term: "Fall",
  year: String(new Date().getFullYear()),
  academic_year: getCurrentAcademicYear(),
  status: "planned",
  grade: "",
  source: "manual",
  verification_status: "verified",
  instructor: "",
});

const STATUS_BADGE = {
  completed: { label: "Completed", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default" },
  planned: { label: "Planned", variant: "outline" },
  withdrawn: { label: "Withdrawn", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

export default function Planner() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptyCourse());
  const [filterTerm, setFilterTerm] = useState("all");
  const [filterYear, setFilterYear] = useState("all");

  const load = async () => {
    const list = await base44.entities.Course.list("-created_date", 200);
    setCourses(list);
  };

  useEffect(() => {
    (async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group courses by academic_year then term, ordered Fall > Spring > Summer.
  const yearOptions = useMemo(() => {
    const yrs = Array.from(
      new Set(courses.map((c) => (c.year != null ? String(c.year) : null)).filter(Boolean))
    ).sort((a, b) => Number(b) - Number(a));
    return [{ value: "all", label: "All years" }, ...yrs.map((y) => ({ value: y, label: y }))];
  }, [courses]);

  const termOptions = [{ value: "all", label: "All terms" }, ...TERMS];

  const filtered = useMemo(
    () =>
      courses.filter((c) => {
        if (filterTerm !== "all" && (c.term || "Fall") !== filterTerm) return false;
        if (filterYear !== "all" && String(c.year) !== filterYear) return false;
        return true;
      }),
    [courses, filterTerm, filterYear]
  );

  const grouped = useMemo(() => {
    const order = { Fall: 0, Spring: 1, Summer: 2 };
    const map = new Map();
    for (const c of filtered) {
      const ay = c.academic_year || "Other";
      if (!map.has(ay)) map.set(ay, []);
      map.get(ay).push(c);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([ay, items]) => ({
        academic_year: ay,
        terms: TERMS.map((t) => ({
          term: t.value,
          courses: items
            .filter((c) => (c.term || "Fall") === t.value)
            .sort((a, b) => order[a.term] - order[b.term]),
        })).filter((g) => g.courses.length > 0),
      }));
  }, [filtered]);

  const openAdd = () => {
    setEditingId(null);
    setDraft(emptyCourse());
    setDialogOpen(true);
  };

  const openEdit = (course) => {
    setEditingId(course.id);
    setDraft({ ...emptyCourse(), ...course });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.name?.trim()) {
      toast({ title: "Course name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        credits: draft.credits ? Number(draft.credits) : 0,
      };
      if (editingId) {
        await base44.entities.Course.update(editingId, payload);
        toast({ title: "Course updated" });
      } else {
        await base44.entities.Course.create(payload);
        toast({ title: "Course added" });
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (course) => {
    try {
      await base44.entities.Course.delete(course.id);
      await load();
      toast({ title: "Course removed" });
    } catch (err) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Planner</h1>
          <p className="text-muted-foreground mt-1">
            Organize courses by term and track what's done, in progress, and planned.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add course
        </Button>
      </div>

      {courses.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            id="f_term"
            label="Filter by term"
            value={filterTerm}
            onChange={setFilterTerm}
            options={termOptions}
          />
          <SelectField
            id="f_year"
            label="Filter by year"
            value={filterYear}
            onChange={setFilterYear}
            options={yearOptions}
          />
          {(filterTerm !== "all" || filterYear !== "all") && (
            <Button
              variant="ghost"
              onClick={() => {
                setFilterTerm("all");
                setFilterYear("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {courses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No courses yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add your first course to start planning.
            </p>
            <Button className="mt-4" onClick={openAdd}>
              <Plus className="w-4 h-4 mr-2" />
              Add course
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No courses match the selected filters.
              </CardContent>
            </Card>
          )}
          {grouped.map((group) => (
            <div key={group.academic_year} className="space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {group.academic_year}
              </h2>
              {group.terms.map((g) => (
                <Card key={g.term}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{g.term}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {g.courses.map((c) => {
                      const sb = STATUS_BADGE[c.status] || STATUS_BADGE.planned;
                      return (
                        <div
                          key={c.id}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium truncate">{c.name}</p>
                              {c.code && (
                                <span className="text-xs text-muted-foreground">{c.code}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {[
                                c.credits ? `${c.credits} cr` : null,
                                c.instructor,
                                c.grade ? `Grade ${c.grade}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <Badge variant={sb.variant}>{sb.label}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => remove(c)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit course" : "Add course"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update this course's details." : "Add a course to your planner."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="c_name">Course name *</Label>
              <Input
                id="c_name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Data Structures"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c_code">Code</Label>
              <Input
                id="c_code"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                placeholder="e.g. CS 161"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c_credits">Credits</Label>
              <Input
                id="c_credits"
                type="number"
                min="0"
                value={draft.credits ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    credits: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="h-11"
              />
            </div>
            <SelectField
              id="c_term"
              label="Term"
              value={draft.term}
              onChange={(v) => setDraft({ ...draft, term: v })}
              options={TERMS}
            />
            <SelectField
              id="c_year"
              label="Year"
              value={String(draft.year)}
              onChange={(v) => setDraft({ ...draft, year: v })}
              options={getYearOptions()}
            />
            <SelectField
              id="c_ay"
              label="Academic year"
              value={draft.academic_year}
              onChange={(v) => setDraft({ ...draft, academic_year: v })}
              options={getAcademicYearOptions()}
            />
            <SelectField
              id="c_status"
              label="Status"
              value={draft.status}
              onChange={(v) => setDraft({ ...draft, status: v })}
              options={COURSE_STATUSES}
            />
            <SelectField
              id="c_source"
              label="Source"
              value={draft.source}
              onChange={(v) => setDraft({ ...draft, source: v })}
              options={COURSE_SOURCES}
            />
            <div className="space-y-2">
              <Label htmlFor="c_grade">Grade</Label>
              <Input
                id="c_grade"
                value={draft.grade || ""}
                onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
                placeholder="e.g. A"
                className="h-11"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="c_instr">Instructor</Label>
              <Input
                id="c_instr"
                value={draft.instructor || ""}
                onChange={(e) => setDraft({ ...draft, instructor: e.target.value })}
                placeholder="Optional"
                className="h-11"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {editingId ? "Save changes" : "Add course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}