# C3 Studio — Build Plan

Read WEBAPP_SPEC.md for full details. Execute in this exact order:

## Tasks

- [x] Step 1: Remove Clerk. Install Supabase Auth. Create /lib/supabase/client.ts, server.ts, middleware.ts. Update middleware.ts. Create /login and /signup pages with email/password forms. Connect to Supabase project uxczbwtfcsjsrmrikwoh. Commit: "feat: replace Clerk with Supabase Auth"
- [x] Step 2: Apply C3 branding — update Tailwind/theme with primary #FF5733, secondary #FFC300, gray #4A4A4A, light #E8E8E8. Update globals.css and tailwind.config. Commit: "feat: apply C3 branding theme"
- [x] Step 3: Replace sidebar navigation with C3 routes (Dashboard, Clients, Diagnóstico, Onboarding, Preview, Fotos, GBP, Settings). Commit: "feat: C3 sidebar navigation"
- [x] Step 4: Module 1 — Clients CRUD. List view with filters/search. Detail view /clients/[id] with tabs. Create/edit form with all fields. Activity logging. Commit: "feat: Module 1 - Clients CRUD"
- [x] Step 5: Module 2 — Diagnóstico Wizard (4-step). Tier calculation logic. Result page with closing scripts and action buttons. Saves to diagnostics table, updates client status. Activity logging. Commit: "feat: Module 2 - Diagnóstico Wizard"
- [x] Step 6: Module 3 — Credenciales checklist at /onboarding/credentials/[clientId]. 8-item toggles, progress bar, auto-save. Commit: "feat: Module 3 - Credenciales"
- [x] Step 7: Module 4 — NAP Verification at /onboarding/nap/[clientId]. External search links, 6-item checklist, risk badge. Commit: "feat: Module 4 - NAP Verification"
- [x] Step 8: Module 5 — Photos at /photos/[clientId]. Upload to Supabase Storage, GBP category assignment, approved toggle. Commit: "feat: Module 5 - Photos"
- [x] Step 9: Module 6 — Preview generator (auth) + public page /preview/[token] (no auth). GBP mockup, website mockup, approve/feedback buttons. Commit: "feat: Module 6 - Preview"
- [x] Step 10: Module 7 — GBP Profile form at /gbp/[clientId]. All GBP fields, posts manager. Commit: "feat: Module 7 - GBP Profile"
- [x] Step 11: Module 8 — Dashboard metrics cards + activity feed. Commit: "feat: Module 8 - Dashboard"

## Rules
- NEVER create new Supabase tables. They already exist.
- NEVER modify RLS policies.
- NEVER use Clerk, NextAuth, or any auth besides Supabase Auth.
- NEVER hardcode tenant_id — always use context.
- ONLY use Tailwind + shadcn/ui. No extra CSS libraries.
- Log every significant action to activity_log table.
- Spanish labels OK for internal UI.
- The preview page at /preview/[token] must NOT require auth.
- Fetch user's tenant_id from users table after login and store in React context.
