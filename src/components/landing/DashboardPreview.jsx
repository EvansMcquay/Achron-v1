import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Circle, TrendingUp } from "lucide-react";

const REQS = [
  { name: "Major Core", done: 12, total: 12, status: "done" },
  { name: "General Education", done: 9, total: 10, status: "progress" },
  { name: "Free Electives", done: 2, total: 5, status: "remaining" },
  { name: "Capstone", done: 0, total: 1, status: "remaining" },
];

const REMAINING = [
  { code: "ITAN 490", name: "Capstone Project", credits: 3 },
  { code: "HIST 110", name: "World History", credits: 3 },
  { code: "PHIL 210", name: "Ethics in Tech", credits: 3 },
];

function statusMeta(s) {
  if (s === "done") return { icon: CheckCircle2, color: "text-emerald-500", label: "Complete" };
  if (s === "progress") return { icon: Clock, color: "text-amber-500", label: "In progress" };
  return { icon: Circle, color: "text-muted-foreground", label: "Remaining" };
}

export default function DashboardPreview() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm font-medium text-muted-foreground">The Achron experience</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            A dashboard built for graduation.
          </h2>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-10 rounded-2xl border border-border bg-card shadow-xl overflow-hidden"
        >
          <div className="border-b border-border px-5 py-4 flex items-center justify-between bg-muted/40">
            <div>
              <p className="font-semibold">Jordan Avery</p>
              <p className="text-xs text-muted-foreground">
                B.S. Information Systems · Commonwealth University
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground">
              Fall 2026 · Junior
            </span>
          </div>
          <div className="p-5 grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <div>
                <div className="flex items-end justify-between mb-1.5">
                  <p className="text-sm text-muted-foreground">Overall progress</p>
                  <p className="text-2xl font-bold">68%</p>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: "68%" }} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border p-3">
                    <p className="text-lg font-semibold">81.5</p>
                    <p className="text-xs text-muted-foreground">Credits earned</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-lg font-semibold">38.5</p>
                    <p className="text-xs text-muted-foreground">Remaining</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-lg font-semibold">3.42</p>
                    <p className="text-xs text-muted-foreground">GPA</p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Requirements</p>
                <div className="space-y-2">
                  {REQS.map((r) => {
                    const m = statusMeta(r.status);
                    const Icon = m.icon;
                    const pct = Math.round((r.done / r.total) * 100);
                    return (
                      <div key={r.name} className="rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${m.color} shrink-0`} />
                          <span className="text-sm font-medium flex-1">{r.name}</span>
                          <span className="text-xs text-muted-foreground">{r.done}/{r.total}</span>
                          <span className={`text-xs ${m.color}`}>{m.label}</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="space-y-5">
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium mb-2">Courses remaining</p>
                <div className="space-y-2">
                  {REMAINING.map((c) => (
                    <div key={c.code} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{c.code}</p>
                        <p className="text-xs text-muted-foreground">{c.name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{c.credits} cr</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-primary text-primary-foreground">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  <p className="text-sm font-medium">Graduation path</p>
                </div>
                <p className="mt-2 text-2xl font-bold">Spring 2027</p>
                <p className="text-xs opacity-80 mt-0.5">3 courses + capstone to go</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}