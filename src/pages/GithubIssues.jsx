import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import GithubIssuesPanel from "@/components/github/GithubIssuesPanel";

export default function GithubIssues() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        try {
          setUser(await base44.auth.me());
        } catch {}
      }
      setLoadingUser(false);
    });
  }, []);

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold mb-2">Admin access required</h2>
        <p className="text-muted-foreground">The GitHub issues tracker is only available to administrators.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">CIP Import Issues</h1>
        <p className="text-muted-foreground">Track open issues for CIP data imports from GitHub.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Open issues</CardTitle>
          <CardDescription>Enter the repository tracking your CIP data import work.</CardDescription>
        </CardHeader>
        <CardContent>
          <GithubIssuesPanel defaultOwner="EvansMcquay" defaultRepo="Achron" />
        </CardContent>
      </Card>
    </div>
  );
}