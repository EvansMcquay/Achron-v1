import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import SelectField from "@/components/form/SelectField";
import { Loader2, GraduationCap, Globe, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";

// Student-facing cascading selector bound to a chosen school:
//   School → Degree type → Major → Year started
//
// Majors come from the school's Programs. Two provenance tiers are shown:
//   • verified        — confirmed from the school's official site/catalog
//   • national_baseline — reported by national NCES/IPEDS data, official
//                         verification still pending (shown with a badge)
// Verified majors are listed first and resolve to a catalog year; baseline
// majors have no catalog yet, so selecting one proceeds without a year and
// the student's roadmap stays "pending official verification".
//
// Concentrations, minors, certificates, tracks, specializations, options,
// endorsements, pre-professional, and other offerings are NEVER selectable
// here — only offering_type === "major".
export default function ProgramSelector({ institutionId, value, onChange, disabled }) {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState(null);
  const [majorSearch, setMajorSearch] = useState("");
  const [manualMajor, setManualMajor] = useState("");

  const catalogId = value?.catalog_id || "";
  const programId = value?.program_id || "";
  const selectedDegree = value?.degree_type || "";
  const selectedMajor = value?.major || "";

  // Load the school's verified catalogs + majors (verified + national baseline).
  useEffect(() => {
    setPrograms([]);
    setDiscoveryStatus(null);
    if (!institutionId) return;
    setLoading(true);
    (async () => {
      try {
        const [verified, baseline, instRec] = await Promise.all([
          base44.entities.Program.filter(
            { institution_id: institutionId, verification_status: "verified", offering_type: "major", active: true },
            "program_name", 300
          ),
          base44.entities.Program.filter(
            { institution_id: institutionId, verification_status: "national_baseline", offering_type: "major", active: true },
            "program_name", 300
          ),
          base44.entities.Institution.get(institutionId).catch(() => null),
        ]);
        const tagged = [
          ...verified.map((p) => ({ ...p, isBaseline: false })),
          ...baseline.map((p) => ({ ...p, isBaseline: true })),
        ];
        setPrograms(tagged);
        setDiscoveryStatus(instRec?.discovery_status || null);
      } catch {
        setPrograms([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [institutionId]);

  const majorPrograms = useMemo(() => programs.filter((p) => p.offering_type === "major"), [programs]);

  // When a school has NO coverage at all (neither verified nor baseline), try
  // official discovery once so the student sees real majors. If IPEDS baseline
  // already exists, that IS coverage — we don't force a crawl.
  const autoTriedRef = useRef(null);
  useEffect(() => {
    if (!institutionId || loading) return;
    if (majorPrograms.length > 0) return;
    if (autoTriedRef.current === institutionId) return;
    autoTriedRef.current = institutionId;
    handleDiscover({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId, loading, majorPrograms.length]);

  const degreeOptions = useMemo(() => {
    const set = new Set();
    majorPrograms.forEach((p) => { if (p.degree_type) set.add(p.degree_type); });
    return [...set].sort();
  }, [majorPrograms]);

  // Majors offered for the selected degree type. Verified first (with a
  // confirmed badge), then national-baseline (with a "national data" badge).
  const majorOptions = useMemo(() => {
    if (!selectedDegree) return [];
    const seen = new Set();
    const verified = [];
    const baseline = [];
    majorPrograms.forEach((p) => {
      if (p.degree_type !== selectedDegree || !p.program_name) return;
      if (seen.has(p.program_name)) return;
      seen.add(p.program_name);
      const deg = p.official_degree_name ? ` — ${p.official_degree_name}` : "";
      const label = `${p.program_name}${deg}`;
      (p.isBaseline ? baseline : verified).push({ value: p.program_name, label, isBaseline: p.isBaseline });
    });
    verified.sort((a, b) => a.label.localeCompare(b.label));
    baseline.sort((a, b) => a.label.localeCompare(b.label));
    return [...verified, ...baseline];
  }, [majorPrograms, selectedDegree]);

  const filteredMajors = useMemo(() => {
    const q = majorSearch.trim().toLowerCase();
    if (!q) return majorOptions;
    return majorOptions.filter(
      (m) => m.label.toLowerCase().includes(q) || m.value.toLowerCase().includes(q)
    );
  }, [majorOptions, majorSearch]);

  const resolveProgram = (deg, maj, catId) =>
    programs.find((p) => p.degree_type === deg && p.program_name === maj && p.catalog_id === catId);

  const findMajorProgram = (maj) => programs.find((p) => p.program_name === maj);

  const emit = (patch) => onChange?.({ ...value, manual_mode: false, ...patch });

  const changeDegree = (degree) =>
    emit({
      degree_type: degree,
      major: "",
      program_name: "",
      program_id: "",
      catalog_id: "",
      catalog_year: "",
      credits_required: undefined,
    });

  const changeMajor = (majorName) => {
    const prog = findMajorProgram(majorName);
    if (!prog) return;
    if (prog.isBaseline) {
      // National-baseline major: no catalog year yet. Proceed with the program
      // bound but no requirement roadmap (official verification pending).
      emit({
        degree_type: selectedDegree,
        major: majorName,
        program_name: majorName,
        program_id: prog.id,
        catalog_id: "",
        catalog_year: "",
        credits_required: undefined,
      });
      return;
    }
    const years = programs
      .filter((p) => p.degree_type === selectedDegree && p.program_name === majorName && !p.isBaseline)
      .map((p) => ({ catalog_id: p.catalog_id, year: p.catalog_id }))
      .filter((y) => y.catalog_id);
    const uniqueYears = [...new Map(years.map((y) => [y.catalog_id, y])).values()];
    if (uniqueYears.length === 1) {
      const resolved = resolveProgram(selectedDegree, majorName, uniqueYears[0].catalog_id);
      emit({
        degree_type: selectedDegree,
        major: majorName,
        program_name: majorName,
        program_id: resolved?.id || "",
        catalog_id: uniqueYears[0].catalog_id,
        catalog_year: "",
        credits_required: resolved?.credits_required,
      });
    } else {
      emit({
        degree_type: selectedDegree,
        major: majorName,
        program_name: majorName,
        program_id: "",
        catalog_id: "",
        catalog_year: "",
        credits_required: undefined,
      });
    }
  };

  // Catalog-year options for a VERIFIED major (baseline majors have none).
  const yearOptions = useMemo(() => {
    if (!selectedDegree || !selectedMajor) return [];
    const seen = new Set();
    const years = [];
    programs.forEach((p) => {
      if (p.isBaseline) return;
      if (p.degree_type === selectedDegree && p.program_name === selectedMajor && p.catalog_id) {
        if (!seen.has(p.catalog_id)) {
          seen.add(p.catalog_id);
          years.push({ catalog_id: p.catalog_id });
        }
      }
    });
    return years;
  }, [programs, selectedDegree, selectedMajor]);

  const changeYear = (catId) => {
    const prog = resolveProgram(selectedDegree, selectedMajor, catId);
    emit({
      degree_type: selectedDegree,
      major: selectedMajor,
      program_name: selectedMajor,
      program_id: prog?.id || "",
      catalog_id: catId,
      catalog_year: "",
      credits_required: prog?.credits_required,
    });
  };

  const handleDiscover = async (opts = {}) => {
    const silent = !!opts.silent;
    const notify = (t) => { if (!silent) toast(t); };
    setDiscovering(true);
    try {
      const res = await base44.functions.invoke("discoverPrograms", { institution_id: institutionId });
      const data = res?.data || {};
      if (data.status === "available") {
        notify({ title: "Programs available", description: "We found this school's programs — reloading." });
        const [verified, baseline] = await Promise.all([
          base44.entities.Program.filter(
            { institution_id: institutionId, verification_status: "verified", offering_type: "major", active: true },
            "program_name", 300
          ),
          base44.entities.Program.filter(
            { institution_id: institutionId, verification_status: "national_baseline", offering_type: "major", active: true },
            "program_name", 300
          ),
        ]);
        setPrograms([
          ...verified.map((p) => ({ ...p, isBaseline: false })),
          ...baseline.map((p) => ({ ...p, isBaseline: true })),
        ]);
        setDiscoveryStatus(data.discovery_status || null);
      } else {
        notify({
          title: "Couldn't find official programs",
          description: data.error || data.message || "You can still continue manually.",
          variant: "destructive",
        });
      }
    } catch (err) {
      notify({ title: "Discovery failed", description: err?.response?.data?.error || err.message, variant: "destructive" });
    } finally {
      setDiscovering(false);
    }
  };

  const enterManualMajor = () => {
    const name = manualMajor.trim();
    if (!name) return;
    onChange?.({
      ...value,
      catalog_id: "",
      catalog_year: "",
      program_id: "",
      program_name: "",
      degree_type: "",
      major: name,
      credits_required: undefined,
      manual_mode: true,
    });
  };

  if (!institutionId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select your school first to choose your degree and major.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading available programs…</span>
      </div>
    );
  }

  if (majorPrograms.length === 0) {
    if (discovering) {
      return (
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Finding programs for this school…</span>
        </div>
      );
    }
    const meta = {
      failed: { title: "We couldn't load this school's programs right now.", body: "You can enter your major manually or upload your transcript/degree audit." },
      no_official_source: { title: "We couldn't load this school's programs right now.", body: "You can enter your major manually or upload your transcript/degree audit." },
      complete: { title: "No degree programs were found for this school.", body: "You can enter your information manually or upload your transcript/degree audit." },
      partial: { title: "We're still verifying programs for this school.", body: "Can't find your major? You can enter it manually or upload your transcript/degree audit." },
    }[discoveryStatus] || { title: "We're still verifying programs for this school.", body: "Can't find your major? You can enter it manually or upload your transcript/degree audit." };
    return (
      <div className="rounded-md border border-dashed bg-muted/20 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <GraduationCap className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="text-sm space-y-1">
            <p className="font-medium">{meta.title}</p>
            <p className="text-muted-foreground">{meta.body}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={handleDiscover} disabled={discovering || disabled}>
            {discovering ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
            {discovering ? "Finding programs…" : "Find my program"}
          </Button>
        </div>
        <div className="space-y-2 pt-2 border-t">
          <p className="text-sm font-medium">Can't find your major?</p>
          <Input
            type="text"
            placeholder="Enter your major"
            value={manualMajor}
            onChange={(e) => setManualMajor(e.target.value)}
            disabled={disabled}
          />
          <Button type="button" variant="outline" size="sm" onClick={enterManualMajor} disabled={disabled || !manualMajor.trim()}>
            <Plus className="w-4 h-4 mr-2" />
            Enter my major manually
          </Button>
        </div>
      </div>
    );
  }

  const selectedProgram = programs.find((p) => p.id === programId);
  const hasBaselineOnly = selectedProgram?.isBaseline;

  return (
    <div className="space-y-4">
      <SelectField
        id="degree_type"
        label="Which type of degree are you pursuing? *"
        value={selectedDegree}
        onChange={changeDegree}
        options={degreeOptions.map((d) => ({ value: d, label: d }))}
        placeholder="Select degree type"
        disabled={disabled}
      />

      {selectedDegree && (
        majorOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No majors for this degree type yet.</p>
        ) : (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">What's your major? *</p>
              <p className="text-xs text-muted-foreground">Choose from majors offered by your school.</p>
            </div>
            <Input
              type="text"
              placeholder="Search majors…"
              value={majorSearch}
              onChange={(e) => setMajorSearch(e.target.value)}
              disabled={disabled}
            />
            <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
              {filteredMajors.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">No matching majors.</p>
              ) : (
                filteredMajors.map((m) => {
                  const active = selectedMajor === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => changeMajor(m.value)}
                      className={
                        "w-full text-left px-3 py-2 text-sm transition-colors hover:bg-accent flex items-center justify-between gap-2 " +
                        (active ? "bg-accent font-medium" : "")
                      }
                    >
                      <span>{m.label}</span>
                      {m.isBaseline ? (
                        <Badge variant="outline" className="shrink-0 text-[10px] font-normal">national data</Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">verified</Badge>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )
      )}

      {selectedDegree && selectedMajor && !hasBaselineOnly && yearOptions.length > 0 && (
        <SelectField
          id="catalog_year"
          label="Catalog year *"
          value={catalogId}
          onChange={changeYear}
          options={yearOptions.map((y) => ({ value: y.catalog_id, label: y.catalog_id }))}
          placeholder="Select year"
          disabled={disabled || yearOptions.length === 1}
        />
      )}

      {programId && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <div className="flex items-center gap-2 font-medium">
            <GraduationCap className="w-4 h-4" />
            {selectedMajor}{selectedProgram?.official_degree_name ? ` — ${selectedProgram.official_degree_name}` : ""}
            {hasBaselineOnly ? (
              <Badge variant="outline" className="ml-1 text-[10px] font-normal">official verification pending</Badge>
            ) : (
              <Badge variant="secondary" className="ml-1 text-[10px] font-normal">
                <ShieldCheck className="w-3 h-3 mr-1" />verified
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
            <span>Degree</span>
            <span className="text-foreground">{selectedDegree || "—"}</span>
            <span>Catalog year</span>
            <span className="text-foreground">{value?.catalog_year || (hasBaselineOnly ? "Pending official verification" : "—")}</span>
            <span>Credits required</span>
            <span className="text-foreground">{selectedProgram?.credits_required ?? "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}