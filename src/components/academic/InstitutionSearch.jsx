import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { Search, Loader2, Building2, Globe, Plus, MapPin } from "lucide-react";

// National, server-side institution search.
//   - Debounced (400ms) calls to the `searchInstitutions` backend, which
//     searches the Institution cache with $regex and, on a cache miss,
//     discovers institutions from NCES/IPEDS and upserts them.
//   - Never loads thousands of records into the browser.
//   - Only verified institutions are returned (selectable). If nothing is
//     found, "Search the web & request it" triggers `discoverInstitution`,
//     which creates a PENDING record for admin review (never selectable yet).
const TYPE_LABEL = {
  "4-year": "4-year",
  "2-year": "2-year",
  "less-than-2-year": "<2-year",
};
const CONTROL_LABEL = {
  public: "Public",
  "private-not-for-profit": "Private NP",
  "private-for-profit": "Private FP",
};

export default function InstitutionSearch({ value, onChange, disabled }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  const selectedId = value?.institution_id;
  const selectedName = value?.institution;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const runSearch = (q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke("searchInstitutions", {
          query: q.trim(),
          limit: 20,
        });
        const data = res?.data || {};
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch (err) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  const onType = (v) => {
    setQuery(v);
    setTouched(true);
    setOpen(true);
    runSearch(v);
  };

  const pick = (inst) => {
    onChange?.({
      institution_id: inst.id,
      institution: inst.name,
    });
    setQuery("");
    setResults([]);
    setOpen(false);
    setTouched(false);
  };

  const handleRequest = async () => {
    if (!query.trim()) return;
    setRequesting(true);
    try {
      const res = await base44.functions.invoke("discoverInstitution", {
        query: query.trim(),
      });
      const data = res?.data || {};
      if (data.status === "submitted") {
        toast({ title: "Submitted for review", description: data.message });
        setQuery("");
        setOpen(false);
        setTouched(false);
      } else if (data.status === "exists") {
        toast({ title: "Already available", description: data.message });
      } else {
        toast({ title: "Could not find it", description: data.message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Request failed", description: err?.response?.data?.error || err.message, variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  };

  if (selectedId) {
    return (
      <div className="space-y-2">
        <Label>Institution *</Label>
        <div className="flex items-center justify-between rounded-md border border-input bg-transparent px-3 h-11">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="text-sm truncate">{selectedName}</span>
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange?.({ institution_id: "", institution: "" });
                setOpen(true);
                setTouched(true);
              }}
            >
              Change
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label>Institution *</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search for your school (e.g. Penn State, UCLA, NYU)…"
          className="h-11 pl-9"
          disabled={disabled}
        />
        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Searching thousands of U.S. colleges…
                </span>
              </div>
            ) : results.length > 0 ? (
              results.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => pick(inst)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent border-b border-border/50 last:border-0"
                >
                  <Building2 className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{inst.name}</p>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {[inst.city, inst.state].filter(Boolean).join(", ") || "Location unavailable"}
                    </p>
                    {(inst.institution_type || inst.control) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {inst.institution_type && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                            {TYPE_LABEL[inst.institution_type] || inst.institution_type}
                          </Badge>
                        )}
                        {inst.control && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                            {CONTROL_LABEL[inst.control] || inst.control}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))
            ) : touched && query.trim().length >= 2 ? (
              <div className="px-3 py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  No verified school matches “{query}” yet.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRequest}
                  disabled={requesting || disabled}
                >
                  {requesting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Globe className="w-4 h-4 mr-2" />
                  )}
                  Search the web & request “{query.trim()}”
                </Button>
              </div>
            ) : (
              <div className="px-3 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Start typing to search thousands of verified U.S. colleges and universities.
                </p>
              </div>
            )}
            {results.length > 0 && query.trim() && (
              <div className="border-t border-border px-3 py-2">
                <button
                  type="button"
                  onClick={handleRequest}
                  disabled={requesting || disabled}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {requesting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Can't find your school? Request “{query.trim()}” for review
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}