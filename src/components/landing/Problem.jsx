import React from "react";
import { motion } from "framer-motion";
import {
  FileText,
  BookOpen,
  GitBranch,
  CalendarCheck,
  UserRound,
  DollarSign,
  ArrowRight,
} from "lucide-react";

const SOURCES = [
  { icon: FileText, label: "Degree audits" },
  { icon: BookOpen, label: "Course catalogs" },
  { icon: GitBranch, label: "Prerequisite requirements" },
  { icon: CalendarCheck, label: "Registration systems" },
  { icon: UserRound, label: "Academic advisors" },
  { icon: DollarSign, label: "Financial information" },
];

export default function Problem() {
  return (
    <section className="scroll-mt-24 py-20 border-t border-border bg-muted/30">
      <div className="mx-auto max-w-5xl px-5">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-3xl sm:text-4xl font-bold tracking-tight text-center max-w-2xl mx-auto"
        >
          College shouldn't feel like solving a puzzle.
        </motion.h2>
        <p className="mt-4 text-muted-foreground text-center max-w-2xl mx-auto">
          Students piece together their path from scattered systems that rarely agree. Achron brings
          the important pieces together.
        </p>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-3">
          {SOURCES.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="rounded-xl border border-border bg-card p-4 flex items-center gap-3"
              >
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-muted text-muted-foreground shrink-0">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-sm font-medium">{s.label}</span>
              </motion.div>
            );
          })}
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>Many disconnected sources</span>
          <ArrowRight className="w-4 h-4" />
          <span className="font-medium text-foreground">One clear path</span>
        </div>
      </div>
    </section>
  );
}