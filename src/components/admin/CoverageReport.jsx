import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Globe } from "lucide-react";

// Admin discovery-coverage dashboard. Renders the QA report from
// getDiscoveryCoverage: institution status totals, program type totals, and a
// per-institution list sorted failed/partial first for QA triage.

const STATUS_ORDER = {
  failed: 0,
  partial: 1,
  no_official_source: 2,
  crawling: 3,
  pending: 4,
  complete: 5,
};

function Stat({ label, value }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

export default function CoverageReport({ loading, coverage, onRefresh, onRunBatch, runBatchLoading }) {
  if (loading && !coverage) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!coverage) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground mb-3">No coverage report loaded.</p>
          <Button onClick={onRefresh}>
            <Globe className="w-4 h-4 mr-2" /> Load report
          </Button>
        </CardContent>
      </Card>
    );
  }

  const r = coverage.report || {};
  const rows = [...(coverage.per_institution || [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || b.majors - a.majors
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Discovery coverage</h2>
          <p className="text-sm text-muted-foreground">
            National program discovery status across every institution.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onRunBatch} disabled={runBatchLoading}>
            {runBatchLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
            Run discovery batch
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat label="Total institutions" value={r.institutions_scanned} />
        <Stat label="Complete" value={r.complete} />
        <Stat label="Partial" value={r.partial} />
        <Stat label="Failed" value={r.failed} />
        <Stat label="Pending" value={r.pending} />
        <Stat label="No official source" value={r.no_official_source} />
        <Stat label="Verified majors" value={r.total_verified_majors} />
        <Stat label="Concentrations" value={r.total_concentrations} />
        <Stat label="Minors" value={r.total_minors} />
        <Stat label="Certificates" value={r.total_certificates} />
        <Stat label="Other offerings" value={r.total_other_offerings} />
        <Stat label="Pending review" value={r.programs_pending_review} />
      </div>

      {r.programs_capped && (
        <p className="text-xs text-amber-600">
          Program counts are capped at the page limit — full program pagination is a follow-up.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Institutions — failed &amp; partial first</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No institutions with discovery activity yet.</p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto divide-y">
              {rows.slice(0, 200).map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{i.name}</p>
                    {i.official_source && (
                      <p className="text-xs text-muted-foreground truncate">{i.official_source}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {i.majors} major{i.majors === 1 ? "" : "s"}
                    </span>
                    <Badge
                      variant={
                        i.status === "complete"
                          ? "default"
                          : i.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {i.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground w-24 text-right">
                      {i.last_verified || "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}