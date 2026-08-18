# AGENTS.md

## Project Context

This is a Base44 app repository. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for local setup, environment variables, and publish workflow.

## Base44 References

- CLI overview: https://docs.base44.com/developers/references/cli/get-started/overview.md
- Agent skills: https://docs.base44.com/developers/backend/overview/skills.md

If your agent supports Agent Skills, install or update Base44 skills before Base44-specific work:

```bash
npx skills add base44/skills
```

## Key Files

- `src/`: frontend application source.
- `src/api/base44Client.js`: frontend Base44 SDK client.
- `vite.config.js`: Vite config and Base44 Vite plugin setup.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `base44 dev` as the default local development command when you need the local Base44 backend. It can run the backend and frontend together.
- When docs or code mention the frontend being started automatically, that usually means the Base44 project config includes `site.serveCommand`, for example `"serveCommand": "npm run dev"` in `base44/config.jsonc`.
- Use `npm run dev` only for frontend-only work against the hosted Base44 backend.
- Prefer the existing Base44 CLI workflow over adding new npm scripts for Base44-specific tasks.
- Reuse the existing SDK client and Vite plugin patterns before adding new Base44 integration paths.
- Run the relevant checks from `package.json` before finishing code changes.

## Critical Requirement — School-Specific Major Accuracy

The "What's your major?" field must NEVER use a global, hard-coded, generic, or
commonly-used major list. The list must be dynamically generated from VERIFIED
programs belonging to the institution the student selected.

Relationship: Institution → Degree Type → Verified Programs (institution + degree)
→ Major.

Rules:
- Every major shown must be a verified program actually offered by the selected
  school and matching the selected degree type. Never show another school's
  majors, unverified programs, or programs from a different degree level.
- If a school's verified program data is incomplete, show "We're still adding
  programs for this school." and offer transcript upload or manual entry. Never
  fill missing majors with a generic list.
- Accuracy > quantity. Verified data > AI guesses. Official sources > generic lists.

Backend enforcement (`saveAcademicProfile`): when saving, verify server-side that
program.institution_id == selected institution_id, program.degree_type == selected
degree_type, program.verification_status == verified, and the catalog belongs to
the institution. A modified/malicious frontend must not be able to save a school
from one institution with a major from another.