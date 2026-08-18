import React from "react";
import { motion } from "framer-motion";
import { Gauge, ListChecks, CalendarClock, FolderOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const FEATURES = [
  { icon: Gauge, title: "Degree Progress", body: "See exactly how far you are from completing your degree." },
  { icon: ListChecks, title: "Requirement Tracking", body: "Know which requirements you've completed and what's still missing." },
  { icon: CalendarClock, title: "Course Planning", body: "Understand prerequisites and plan future semesters with confidence." },
  { icon: FolderOpen, title: "Academic Record", body: "Keep your courses and academic history organized in one trusted record." },
];

export default function Features() {
  return (
    <section id="features" className="scroll-mt-24 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Core features</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            Everything you need to stay on track.
          </h2>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
              >
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <span className="grid place-items-center w-10 h-10 rounded-lg bg-primary text-primary-foreground">
                      <Icon className="w-5 h-5" />
                    </span>
                    <h3 className="mt-4 font-semibold">{f.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}