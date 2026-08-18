import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Create a new public GitHub repository under the connected (builder) account
// using the SHARED GitHub connector. Admin-only.
//
// POST /user/repos — creates a public repo owned by the authenticated user.
// Returns the new repo's full_name and html_url.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    let body = {};
    try { body = await req.json(); } catch {}

    // GitHub repo names cannot contain spaces. "Achron v1" -> "Achron-v1".
    const rawName = String(body.name || "Achron-v1").trim();
    const name = rawName.replace(/\s+/g, "-");

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("github");

    // /user/repos creates a repo owned by the authenticated account.
    const res = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Achron-App",
      },
      body: JSON.stringify({
        name,
        description: body.description || "Achron — academic progress & degree-planning app",
        private: false,
        auto_init: true,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        { error: `GitHub API ${res.status}`, detail: data.message || data },
        { status: 502 }
      );
    }

    return Response.json({
      status: "created",
      name: data.name,
      full_name: data.full_name,
      url: data.html_url,
      private: data.private,
      default_branch: data.default_branch,
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Failed to create repo" }, { status: 500 });
  }
}