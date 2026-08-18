import React from "react";
import { motion } from "framer-motion";
import { FolderOpen, Cpu, ListChecks, Flag } from "lucide-react";

const STEPS = [
  { icon: FolderOpen, label: "Your Record", body: "Courses, credits, and grades in one place." },
  { icon: Cpu, label: "Degree Engine", body: "A deterministic engine evaluates your record." },
  { icon: ListChecks, label: "Requirements", body: "See what's satisfied and what remains." },
  { icon: Flag, label: "Graduation Path", body: "A clear, understandable plan to graduate." },
];

export default function ProductIntelligence() {
  return (
    <section id="how-it-works" className="scroll-mt-24 py-20 border-t border-border bg-muted/30">
      <div className="mx-auto max-w-5xl px-5">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground">Product intelligence</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            Stop guessing. Start planning.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Achron analyzes your academic record against your university's degree requirements to
            produce an understandable progress view.
          </p>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="rounded-xl border border-border bg-card p-5 h-full"
              >
                <div className="flex items-center gap-2">
                  <span className="grid place-items-center w-8 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                    {i + 1}
                  </span>
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <h3 className="mt-3 font-semibold">{s.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}