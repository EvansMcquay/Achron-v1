import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Circle, Clock } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } }),
};

const REQS = [
  { label: "Major Core", status: "done" },
  { label: "General Education", status: "progress" },
  { label: "Free Electives", status: "remaining" },
];

function PreviewCard() {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-xl p-5 w-full max-w-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Jordan Avery</p>
          <p className="text-xs text-muted-foreground">B.S. Information Systems</p>
        </div>
        <span className="text-xs px-2 py-1 rounded-md bg-secondary text-secondary-foreground">
          Fall 2026
        </span>
      </div>
      <div className="mt-4">
        <div className="flex items-end justify-between mb-1.5">
          <p className="text-xs text-muted-foreground">Degree progress</p>
          <p className="text-sm font-semibold">68%</p>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: "68%" }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
        <div className="rounded-lg border p-2">
          <p className="text-sm font-semibold">81.5</p>
          <p className="text-[10px] text-muted-foreground">Credits</p>
        </div>
        <div className="rounded-lg border p-2">
          <p className="text-sm font-semibold">38.5</p>
          <p className="text-[10px] text-muted-foreground">Remaining</p>
        </div>
        <div className="rounded-lg border p-2">
          <p className="text-sm font-semibold">Spring 27</p>
          <p className="text-[10px] text-muted-foreground">Graduation</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Requirements</p>
        {REQS.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-xs">
            {r.status === "done" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : r.status === "progress" ? (
              <Clock className="w-4 h-4 text-amber-500" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="flex-1">{r.label}</span>
            <span
              className={
                r.status === "done"
                  ? "text-emerald-600"
                  : r.status === "progress"
                  ? "text-amber-600"
                  : "text-muted-foreground"
              }
            >
              {r.status === "done" ? "Complete" : r.status === "progress" ? "In progress" : "3 left"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative pt-28 pb-16 sm:pt-32">
      <div className="mx-auto max-w-6xl px-5 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <motion.h1
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]"
          >
            Your degree.
            <br />
            Mapped out.
          </motion.h1>
          <motion.p
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mt-5 text-lg text-muted-foreground max-w-lg"
          >
            Achron turns your degree requirements, courses, credits, and academic progress into one
            clear path to graduation.
          </motion.p>
          <motion.div
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mt-7 flex flex-wrap gap-3"
          >
            <Button size="lg" asChild>
              <Link to="/register">
                Get Started <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </motion.div>
          <motion.div
            custom={3}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mt-8 flex flex-wrap items-center gap-5 text-xs text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> No spreadsheet required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Catalog-versioned
            </span>
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="flex justify-center lg:justify-end"
        >
          <PreviewCard />
        </motion.div>
      </div>
    </section>
  );
}