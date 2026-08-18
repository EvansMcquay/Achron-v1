import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Fetch open GitHub issues for a given repository (used to track CIP data
// import work). Admin-only; uses the SHARED GitHub connector (builder account).
//
// GET /repos/{owner}/{repo}/issues?state=open — PRs are filtered out.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    let body = {};
    try { body = await req.json(); } catch {}

    const owner = String(body.owner || "").trim();
    const repo = String(body.repo || "").trim();
    if (!owner || !repo) {
      return Response.json({ error: "owner and repo are required" }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("github");

    const url =
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
      `/issues?state=open&sort=created&direction=desc&per_page=100`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Achron-App",
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return Response.json({ error: `GitHub API ${res.status}`, detail: txt }, { status: 502 });
    }
    const data = await res.json();

    const issues = (Array.isArray(data) ? data : [])
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        url: i.html_url,
        created_at: i.created_at,
        updated_at: i.updated_at,
        labels: (i.labels || []).map((l) => l.name),
        assignee: i.assignee ? i.assignee.login : null,
        author: i.user ? i.user.login : null,
        comments: i.comments || 0,
        body: i.body ? String(i.body).slice(0, 280) : "",
      }));

    return Response.json({ owner, repo, count: issues.length, issues });
  } catch (error) {
    return Response.json({ error: error?.message || "Failed to fetch issues" }, { status: 500 });
  }
}