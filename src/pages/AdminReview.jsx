import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import CoverageReport from "@/components/admin/CoverageReport";
import {
  Check,
  X,
  Loader2,
  ShieldAlert,
  Globe,
  Building2,
  GraduationCap,
  BookOpen,
  CalendarRange,
} from "lucide-react";

// Admin-only review of AI-discovered (pending) institutions, catalogs, and
// programs. Each record is reviewed INDIVIDUALLY: verify (→ verified + active,
// publicly readable) or reject (→ rejected + inactive, non-public). An active
// toggle lets the admin take a verified record offline without rejecting it.
// There is no bulk cascade — every catalog/program is approved on its own
// merits, so AI-discovered data never becomes authoritative without human
// review of each record.

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_BADGE = {
  verified: { label: "Verified", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
  rejected: { label: "Rejected", variant: "destructive" },
  inactive: { label: "Inactive", variant: "outline" },
};

function statusBadge(rec) {
  if (!rec.active && rec.verification_status === "verified") return STATUS_BADGE.inactive;
  return STATUS_BADGE[rec.verification_status] || STATUS_BADGE.pending;
}

function RecordCard({ title, subtitle, meta = [], sourceUrl, record, busy, onVerify, onReject, onToggleActive }) {
  const badge = statusBadge(record);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {title}
            </CardTitle>
            {subtitle && <CardDescription className="mt-1">{subtitle}</CardDescription>}
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {meta.length > 0 && (
          <div className="grid grid-cols-2 gap-y-1 text-xs">
            {meta.map((m) => (
              <React.Fragment key={m.k}>
                <span className="text-muted-foreground">{m.k}</span>
                <span className="text-foreground truncate">{m.v || "—"}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground truncate"
          >
            <Globe className="w-3 h-3 shrink-0" /> {sourceUrl}
          </a>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {record.verification_status !== "verified" && (
            <Button size="sm" onClick={onVerify} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Verify
            </Button>
          )}
          {record.verification_status !== "rejected" && (
            <Button size="sm" variant="outline" onClick={onReject} disabled={busy}>
              <X className="w-4 h-4 mr-2" />
              Reject
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleActive}
            disabled={busy || record.verification_status === "rejected"}
          >
            {record.active ? "Set inactive" : "Set active"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [institutions, setInstitutions] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [nameMap, setNameMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState("institutions");
  const [coverage, setCoverage] = useState(null);
  const [covLoading, setCovLoading] = useState(false);

  const loadCoverage = async () => {
    setCovLoading(true);
    try {
      const res = await base44.functions.invoke("getDiscoveryCoverage", {});
      setCoverage(res?.data || null);
    } catch (err) {
      toast({ title: "Failed to load coverage", description: err?.message, variant: "destructive" });
    } finally {
      setCovLoading(false);
    }
  };

  const [runBatchLoading, setRunBatchLoading] = useState(false);
  const runBatch = async () => {
    setRunBatchLoading(true);
    try {
      const res = await base44.functions.invoke("runNationalDiscovery", { limit: 2 });
      const data = res?.data || res;
      toast({
        title: "Batch complete",
        description: `Processed ${data?.processed ?? 0} institution(s).`,
      });
      await loadCoverage();
    } catch (err) {
      toast({ title: "Batch failed", description: err?.message, variant: "destructive" });
    } finally {
      setRunBatchLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "coverage" && !coverage && !covLoading) loadCoverage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const counts = useMemo(
    () => ({ institutions: institutions.length, catalogs: catalogs.length, programs: programs.length }),
    [institutions, catalogs, programs]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [insts, cats, progs] = await Promise.all([
        base44.entities.Institution.filter({ verification_status: "pending" }, "-created_date", 100),
        base44.entities.Catalog.filter({ verification_status: "pending" }, "-created_date", 100),
        base44.entities.Program.filter({ verification_status: "pending" }, "-created_date", 200),
      ]);
      const map = {};
      insts.forEach((i) => { map[i.id] = i.name; });
      const missing = [
        ...new Set([
          ...cats.map((c) => c.institution_id),
          ...progs.map((p) => p.institution_id),
        ]),
      ].filter((id) => id && !map[id]);
      if (missing.length) {
        const got = await Promise.all(
          missing.map((id) => base44.entities.Institution.get(id).catch(() => null))
        );
        got.forEach((g) => { if (g) map[g.id] = g.name; });
      }
      setInstitutions(insts);
      setCatalogs(cats);
      setPrograms(progs);
      setNameMap(map);
    } catch (err) {
      toast({ title: "Failed to load", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    load();
  }, [user]);

  if (!user || user.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="w-10 h-10 text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold">Admin access required</h2>
        <p className="text-sm text-muted-foreground">
          Only admins can review discovered records.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  const updateRecord = async (entity, id, patch, label) => {
    setBusyId(id);
    try {
      await base44.entities[entity].update(id, patch);
      toast({ title: label });
      await load();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const verify = (entity, rec) =>
    updateRecord(entity, rec.id, {
      verification_status: "verified",
      active: true,
      last_verified: today(),
    }, "Verified — now publicly readable.");

  const reject = (entity, rec) =>
    updateRecord(entity, rec.id, {
      verification_status: "rejected",
      active: false,
    }, "Rejected — remains non-public.");

  const toggleActive = (entity, rec) =>
    updateRecord(entity, rec.id, { active: !rec.active }, rec.active ? "Set inactive." : "Set active.");

  const Empty = () => (
    <Card>
      <CardContent className="py-16 text-center text-sm text-muted-foreground">
        No pending records in this section.
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Review discoveries</h1>
        <p className="text-muted-foreground mt-1">
          AI-discovered institutions, catalogs, and programs await review. Verify a
          record to make it publicly readable; reject to keep it non-public. Each
          record is reviewed individually.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="institutions">
              <Building2 className="w-4 h-4 mr-2" /> Institutions ({counts.institutions})
            </TabsTrigger>
            <TabsTrigger value="catalogs">
              <CalendarRange className="w-4 h-4 mr-2" /> Catalogs ({counts.catalogs})
            </TabsTrigger>
            <TabsTrigger value="programs">
              <GraduationCap className="w-4 h-4 mr-2" /> Programs ({counts.programs})
            </TabsTrigger>
            <TabsTrigger value="coverage">
              <Globe className="w-4 h-4 mr-2" /> Coverage
            </TabsTrigger>
          </TabsList>

          <TabsContent value="institutions" className="space-y-4 mt-4">
            {institutions.length === 0 ? <Empty /> : institutions.map((inst) => (
              <RecordCard
                key={inst.id}
                record={inst}
                title={inst.name}
                subtitle={[inst.city, inst.state].filter(Boolean).join(", ") || undefined}
                sourceUrl={inst.source_url}
                meta={[
                  { k: "Type", v: inst.institution_type },
                  { k: "Control", v: inst.control },
                  { k: "Source", v: inst.source },
                  { k: "Discovered", v: counts.institutions && inst.discovery_status ? inst.discovery_status : "" },
                ]}
                busy={busyId === inst.id}
                onVerify={() => verify("Institution", inst)}
                onReject={() => reject("Institution", inst)}
                onToggleActive={() => toggleActive("Institution", inst)}
              />
            ))}
          </TabsContent>

          <TabsContent value="catalogs" className="space-y-4 mt-4">
            {catalogs.length === 0 ? <Empty /> : catalogs.map((cat) => (
              <RecordCard
                key={cat.id}
                record={cat}
                title={cat.catalog_year}
                subtitle={nameMap[cat.institution_id] || "—"}
                sourceUrl={cat.source_url}
                meta={[
                  { k: "Institution", v: nameMap[cat.institution_id] },
                  { k: "Catalog year", v: cat.catalog_year },
                ]}
                busy={busyId === cat.id}
                onVerify={() => verify("Catalog", cat)}
                onReject={() => reject("Catalog", cat)}
                onToggleActive={() => toggleActive("Catalog", cat)}
              />
            ))}
          </TabsContent>

          <TabsContent value="programs" className="space-y-4 mt-4">
            {programs.length === 0 ? <Empty /> : programs.map((p) => (
              <RecordCard
                key={p.id}
                record={p}
                title={p.program_name}
                subtitle={nameMap[p.institution_id] || "—"}
                sourceUrl={p.source_url}
                meta={[
                  { k: "Institution", v: nameMap[p.institution_id] },
                  { k: "Degree", v: p.degree_type },
                  { k: "Offering", v: p.offering_type },
                  { k: "Official degree", v: p.official_degree_name },
                  { k: "Credits", v: p.credits_required },
                  { k: "CIP", v: p.cip_code },
                ]}
                busy={busyId === p.id}
                onVerify={() => verify("Program", p)}
                onReject={() => reject("Program", p)}
                onToggleActive={() => toggleActive("Program", p)}
              />
            ))}
          </TabsContent>

          <TabsContent value="coverage" className="space-y-4 mt-4">
            <CoverageReport
              loading={covLoading}
              coverage={coverage}
              onRefresh={loadCoverage}
              onRunBatch={runBatch}
              runBatchLoading={runBatchLoading}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}