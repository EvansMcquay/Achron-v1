import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

// Simple, dependency-free donut chart showing completed vs remaining credits
// from the student's AcademicProfile. Purely visual — no business logic.
export default function CreditProgressCard({
  creditsCompleted = 0,
  creditsRequired = 0,
  onViewDetails,
}) {
  const completed = Math.max(0, Number(creditsCompleted) || 0);
  const required = Math.max(0, Number(creditsRequired) || 0);
  const remaining = Math.max(0, required - completed);
  const pct = required ? Math.min(100, Math.round((completed / required) * 100)) : 0;

  // Donut geometry
  const size = 160;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = required ? (completed / required) * circumference : 0;
  const isComplete = required > 0 && completed >= required;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Degree progress</CardTitle>
        <CardDescription>
          {pct}% of required credits complete
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth={stroke}
              />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={isComplete ? "hsl(var(--chart-2))" : "hsl(var(--primary))"}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold leading-none">{pct}%</span>
              <span className="text-xs text-muted-foreground mt-1">
                {isComplete ? "complete" : "complete"}
              </span>
            </div>
          </div>

          <div className="flex-1 w-full space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
              <div>
                <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: isComplete ? "hsl(var(--chart-2))" : "hsl(var(--primary))" }}
                  />
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <p className="text-xl font-bold mt-1">{completed}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                  <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Remaining</p>
                </div>
                <p className="text-xl font-bold mt-1">{remaining}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Required</p>
                <p className="text-xl font-bold mt-1">{required || "?"}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-muted-foreground">
                {isComplete ? "Requirements met" : `${remaining} credit${remaining === 1 ? "" : "s"} to go`}
              </span>
              <Button variant="outline" size="sm" onClick={onViewDetails}>
                View details <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}