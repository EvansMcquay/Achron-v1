import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, AlertCircle, Search } from "lucide-react";

export default function GithubIssuesPanel({ defaultOwner = "", defaultRepo = "" }) {
  const [owner, setOwner] = useState(defaultOwner);
  const [repo, setRepo] = useState(defaultRepo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  // Auto-load on mount when a default repo is provided.
  useEffect(() => {
    if (defaultOwner && defaultRepo) {
      fetchIssues();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchIssues = async (e) => {
    if (e) e.preventDefault();
    const o = owner.trim();
    const r = repo.trim();
    if (!o || !r) {
      setError("Enter both owner and repository name.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getGithubIssues", { owner: o, repo: r });
      setData(res.data);
    } catch (err) {
      setError(err?.message || "Failed to load issues. Make sure the GitHub connector is connected.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={fetchIssues} className="flex flex-col sm:flex-row gap-2 items-end">
        <div className="flex-1 w-full space-y-1.5">
          <Label htmlFor="gh-owner">Owner</Label>
          <Input id="gh-owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. your-team" />
        </div>
        <div className="flex-1 w-full space-y-1.5">
          <Label htmlFor="gh-repo">Repository</Label>
          <Input id="gh-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="e.g. achron-cip-imports" />
        </div>
        <Button type="submit" disabled={loading} className="sm:mb-0.5">
          {loading ? <Loader2 className="animate-spin" /> : <Search />}
          {loading ? "Loading" : "Load issues"}
        </Button>
      </form>

      {error && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {data.count} open issue{data.count === 1 ? "" : "s"} in {data.owner}/{data.repo}
          </div>
          {data.count === 0 ? (
            <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">
              No open issues. 🎉
            </div>
          ) : (
            <ul className="space-y-2">
              {data.issues.map((i) => (
                <li key={i.number} className="border rounded-md p-3 hover:bg-accent/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <a
                      href={i.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline inline-flex items-center gap-1.5"
                    >
                      {i.title} <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                    <span className="text-xs text-muted-foreground shrink-0">#{i.number}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <span>by {i.author || "unknown"}</span>
                    <span>·</span>
                    <span>{new Date(i.created_at).toLocaleDateString()}</span>
                    {i.assignee && (
                      <>
                        <span>·</span>
                        <span>assigned to {i.assignee}</span>
                      </>
                    )}
                    {i.comments > 0 && (
                      <>
                        <span>·</span>
                        <span>{i.comments} comment{i.comments === 1 ? "" : "s"}</span>
                      </>
                    )}
                  </div>
                  {i.labels?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {i.labels.map((l) => (
                        <Badge key={l} variant="secondary" className="font-normal">{l}</Badge>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}