import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Push a batch of files to a GitHub repo in a SINGLE commit using the Git Data
// API (blobs -> tree -> commit -> ref update). Admin-only; SHARED GitHub
// connector (builder account).
//
// Body: { owner, repo, branch?, message?, files: [{ path, content }] }
// Creates/updates every listed path; never deletes. Files already identical to
// the blob are skipped by GitHub automatically when the tree is built.

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
    const branch = String(body.branch || "main").trim();
    const message = String(body.message || "chore: sync app source");
    const files = Array.isArray(body.files) ? body.files : [];
    if (!owner || !repo) return Response.json({ error: "owner and repo are required" }, { status: 400 });
    if (!files.length) return Response.json({ error: "files[] is required" }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("github");
    const H = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Achron-App",
    };
    const api = (p, init = {}) => fetch(`https://api.github.com/repos/${owner}/${repo}${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
    const git = (p, init = {}) => fetch(`https://api.github.com/repos/${owner}/${repo}/git${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });

    // Resolve the current branch commit (create branch ref if repo is fresh and
    // only has the auto-init main commit, which it does).
    let refRes = await api(`/git/refs/heads/${branch}`).then((r) => r.json());
    if (!refRes.object) {
      // Branch may not exist; fall back to default branch.
      const repoInfo = await api(``).then((r) => r.json());
      const def = repoInfo.default_branch || "main";
      if (def !== branch) {
        refRes = await api(`/git/refs/heads/${def}`).then((r) => r.json());
      }
    }
    const parentSha = refRes.object && refRes.object.sha;
    if (!parentSha) return Response.json({ error: "Could not resolve branch head", detail: refRes }, { status: 502 });

    // Base tree from parent commit.
    const parentCommit = await api(`/git/commits/${parentSha}`).then((r) => r.json());
    const baseTreeSha = parentCommit.tree && parentCommit.tree.sha;
    if (!baseTreeSha) return Response.json({ error: "Could not resolve base tree" }, { status: 502 });

    // Create a blob per file (parallel).
    const blobResults = await Promise.all(files.map(async (f) => {
      const r = await git(`/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: String(f.content || ""), encoding: "utf-8" }),
      });
      const j = await r.json();
      return { path: f.path, sha: j.sha, error: j.message };
    }));
    const treeItems = blobResults.filter((b) => b.sha).map((b) => ({
      mode: "100644", type: "blob", path: b.path, sha: b.sha,
    }));
    const failed = blobResults.filter((b) => !b.sha);

    // Build the new tree on top of the base tree.
    const treeRes = await git(`/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    });
    const treeJson = await treeRes.json();
    if (!treeJson.sha) return Response.json({ error: "Tree creation failed", detail: treeJson }, { status: 502 });

    // Create the commit.
    const commitRes = await git(`/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: treeJson.sha, parents: [parentSha] }),
    });
    const commitJson = await commitRes.json();
    if (!commitJson.sha) return Response.json({ error: "Commit creation failed", detail: commitJson }, { status: 502 });

    // Move the branch ref to the new commit.
    const refUpdate = await api(`/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commitJson.sha }),
    });
    const refJson = await refUpdate.json();
    if (!refJson.object) return Response.json({ error: "Ref update failed", detail: refJson }, { status: 502 });

    return Response.json({
      status: "pushed",
      owner, repo, branch,
      commit_sha: commitJson.sha,
      commit_url: commitJson.html_url,
      files_pushed: treeItems.length,
      files_failed: failed.map((f) => ({ path: f.path, error: f.error })),
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Push failed" }, { status: 500 });
  }
}