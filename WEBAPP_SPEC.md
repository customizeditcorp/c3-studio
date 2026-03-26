# C3 STUDIO — WEBAPP SPECIFICATION v1.0

**Date:** March 26, 2026
**For:** LuisAiClau (OpenClaw agent) — use Claude Opus 4.6 for this build
**Author:** Luis Arroyo + Claude (Anthropic)
**Project:** C3 Local Marketing — Internal Operations Webapp

---

## 1. OVERVIEW

C3 Studio is an internal operations webapp for C3 Local Marketing. It's the all-in-one tool for Carlos (operator) and future operators to run the entire client lifecycle: from diagnostic call → preview → onboarding → SEO setup → monthly operations.

**This is NOT a public-facing SaaS yet.** It's an internal tool that is architected as multi-tenant from day 1 so it can become SaaS later.

---

## 2. TECH STACK

| Layer | Technology | Notes |
|-------|-----------|-------|
| Template | [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) | Fork this repo as base |
| Framework | Next.js 16 (App Router) | Already in template |
| UI | shadcn/ui + Tailwind CSS v4 | Already in template |
| Auth | **Supabase Auth** | REPLACE Clerk with Supabase Auth |
| Database | Supabase PostgreSQL | Project ID: `uxczbwtfcsjsrmrikwoh` |
| Storage | Supabase Storage | Bucket: `client-photos` (already created) |
| AI | Claude API (Anthropic) | For motor de lógica |
| Deploy | Vercel | Connect to GitHub repo |
| Repo | GitHub — create as `c3-studio` under Luis's account | |

---

## 3. BRANDING

```json
{
  "name": "C3 Local Marketing",
  "colors": {
    "primary": "#FF5733",
    "secondary": "#FFC300",
    "gray": "#4A4A4A",
    "light": "#E8E8E8"
  },
  "logo": "Use C3 logo SVGs from existing assets (c3-logo-*.svg)",
  "font": "Use default shadcn/ui font (Inter/Geist)",
  "tone": "Professional but warm. Spanish-friendly. No corporate buzzwords."
}
```

**Theme preset:** Create a custom C3 theme preset in the template's theme system using the colors above. Set it as default.

---

## 4. AUTH — REPLACE CLERK WITH SUPABASE

### Remove Clerk
1. `npm uninstall @clerk/nextjs`
2. Delete all Clerk-related files, middleware, providers
3. Remove Clerk env vars

### Add Supabase Auth
1. `npm install @supabase/supabase-js @supabase/ssr`
2. Create `/lib/supabase/client.ts` (browser client)
3. Create `/lib/supabase/server.ts` (server client)
4. Create `/lib/supabase/middleware.ts` (session refresh)
5. Update `middleware.ts` to use Supabase session check
6. Create login page at `/login` with email/password
7. Create signup page at `/signup` (admin only for now)

### Env vars needed
```
NEXT_PUBLIC_SUPABASE_URL=https://uxczbwtfcsjsrmrikwoh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<get from Supabase dashboard>
```

### After login, fetch user's tenant_id
```typescript
// After auth, get user profile with tenant
const { data: profile } = await supabase
  .from('users')
  .select('*, tenants(*)')
  .eq('id', user.id)
  .single();
```

Store `tenant_id` in React context for use across all modules.

---

## 5. DATABASE

### Connection
- **Project ID:** `uxczbwtfcsjsrmrikwoh`
- **URL:** `https://uxczbwtfcsjsrmrikwoh.supabase.co`
- All tables already created (17 tables, see migration files)
- RLS enabled on all tables with tenant isolation
- C3 Local Marketing already seeded as first tenant (slug: 'c3')

### Tables (already exist — DO NOT recreate)
**Core:** tenants, users, clients
**Diagnostic:** diagnostics, nap_checks, credentials
**Methodology:** prompt_versions, briefs, buyer_personas, offers, generated_outputs
**Assets:** client_photos, previews
**SEO:** gbp_profiles, gbp_posts, brightlocal_sync
**Audit:** activity_log

### Enums (already exist)
user_role, client_status, diagnostic_outcome, nap_risk, content_status,
prompt_step, gbp_photo_category, preview_type, output_type, sync_status

---

## 6. SIDEBAR NAVIGATION

Replace the template's default navigation with:

```
C3 Studio
├── Dashboard                    /dashboard
├── Clients                      /clients
│   └── [id]                     /clients/[id]
├── Diagnóstico                  /diagnostic
│   └── [id]                     /diagnostic/[id]
├── Onboarding                   /onboarding
│   ├── Credenciales             /onboarding/credentials/[clientId]
│   ├── Verificación NAP         /onboarding/nap/[clientId]
│   └── Brief & Persona          /onboarding/brief/[clientId]
├── Preview                      /preview
│   └── [token] (public)         /preview/[token]
├── Fotos                        /photos/[clientId]
├── GBP                          /gbp/[clientId]
└── Settings                     /settings
```

### Sidebar behavior
- Collapsible (already in template)
- Show client name in breadcrumb when inside a client context
- Badge count on "Diagnóstico" showing leads pending

---

## 7. MODULES — BUILD IN THIS ORDER

### MODULE 1: Clients (CRUD)
**Route:** `/clients`
**Table:** `clients`

**List view:**
- Table with columns: business_name, industry, contact_first_name, phone, status (badge), tier, created_at
- Filter by status (dropdown)
- Search by business_name
- "New Client" button → opens form

**Detail view:** `/clients/[id]`
- Client info card (editable)
- Status timeline (lead → diagnosed → negotiating → onboarding → active)
- Tabs: Overview | Diagnostic | Credentials | NAP | Photos | GBP
- Each tab loads the relevant module for this client

**Form fields:**
- business_name* (text)
- industry* (select: landscaping, roofing, plumbing, hvac, painting, cleaning, fencing, electrical, general_contractor, other)
- contact_first_name (text)
- contact_last_name (text)
- phone (text)
- email (text)
- disc_profile (select: D, I, S, C)
- notes (textarea)

---

### MODULE 2: Diagnóstico (Wizard)
**Route:** `/diagnostic` (new) and `/diagnostic/[id]` (view result)
**Tables:** `diagnostics`, `clients`

**This is the core tool Carlos uses during sales calls.**

#### Wizard — 4 steps, linear progression

**Step 1 — Info del Negocio:**
- If existing client: select from dropdown
- If new: inline form (business_name, industry, contact_first_name, phone, email, disc_profile, notes)
- Auto-creates client record with status='lead'

**Step 2 — Presencia Digital:**
- google_presence (radio group, single select):
  - "No tengo Google Business Profile"
  - "Tengo pero no aparezco en búsquedas"
  - "Aparezco pero no genera llamadas"
  - "Ya genero leads, quiero dominar mi zona"
- license_status (radio group):
  - "Licencia nueva (menos de 1 año)"
  - "Licencia establecida (1+ años)"
  - "Cambio reciente de dirección o nombre"
- digital_health (radio group):
  - "No tengo nada digital"
  - "Tengo todo y tengo acceso"
  - "Perdí acceso a mis cuentas"
  - "Mi info aparece diferente en varios sitios"

**Step 3 — Perfil del Negocio:**
- revenue_range (radio — THIS determines tier):
  - "Menos de $10,000/mes" → Fase inicial
  - "$10,000 - $25,000/mes" → Negocio estable
  - "$25,000 - $60,000/mes" → En crecimiento
  - "Más de $60,000/mes" → Líder local
- team_size (radio):
  - "Solo yo — Solopreneur"
  - "2-5 personas — Equipo pequeño"
  - "6+ personas — Equipo establecido"
- expectation (radio):
  - "Necesito clientes YA"
  - "Entiendo que es un proceso"
  - "Quiero construir algo a largo plazo"
  - "No estoy seguro de qué necesito"
- client_management (radio):
  - "Papel / libreta / nada"
  - "Apps sueltas (Excel, WhatsApp, etc.)"
  - "Ya uso un CRM"

**Step 4 — Resultado & Cierre (auto-generated):**

Tier calculation logic:
```typescript
function calculateTier(revenueRange: string): { tier: string; price: number; planName: string } {
  switch (revenueRange) {
    case 'less_10k':
      return { tier: 'presencia_digital', price: 3300, planName: 'Presencia Digital — INICIAL' };
    case '10k_25k':
      return { tier: 'cimientos', price: 399, planName: 'Cimientos — $399/mes' };
    case '25k_60k':
      return { tier: 'expansion', price: 599, planName: 'Expansión Total — $599/mes' };
    case 'more_60k':
      return { tier: 'dominio', price: 899, planName: 'Dominio Estratégico — desde $600/mes' };
  }
}
```

Display:
- Plan recomendado (big card with tier name + price)
- What's included (based on tier)
- Closing scripts (3 conditional scripts based on tier)
- Objection handler (text input → pre-armed responses, V1 static)
- Action buttons:
  - ✅ Guardar Lead → saves diagnostic, updates client status to 'diagnosed'
  - 📧 Enviar Resumen → placeholder (future: WhatsApp/email)
  - 🔗 Generar Preview → navigates to preview generator
  - 💳 Enviar Link de Pago → placeholder (future: Stripe/GHL)
  - 📄 Enviar Contrato → placeholder
  - 🔄 Nuevo Diagnóstico → resets wizard

After saving, update client.status to 'diagnosed' and client.tier.

---

### MODULE 3: Credenciales
**Route:** `/onboarding/credentials/[clientId]`
**Table:** `credentials`

- Client selector dropdown (filter: status in ['diagnosed','onboarding','active'])
- Entity type selector (self_employment, llc, s_corp) — conditional fields
- Legal name, DBA number, CSLB number, city license
- 8-item checklist with toggles (required items marked)
- Progress bar: X/8 completed
- Alert if required items missing
- Auto-save on toggle change

---

### MODULE 4: Verificación NAP
**Route:** `/onboarding/nap/[clientId]`
**Table:** `nap_checks`

- Business name input + city/state
- 3 external search buttons (open in new tab):
  - 🔍 Google → `https://google.com/search?q={businessName}+{city}`
  - 🛡️ CSLB → `https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx`
  - 🏛️ CA SOS → `https://bizfileonline.sos.ca.gov/search/business`
- 6-item checkbox checklist (manual verification)
- items_passed computed automatically
- Risk level badge: 0/6=red, partial=yellow, 6/6=green
- Notes field

---

### MODULE 5: Photos
**Route:** `/photos/[clientId]`
**Table:** `client_photos`, Storage bucket: `client-photos`

- Upload zone (drag & drop, multiple files)
- On upload:
  1. Save to Supabase Storage at path: `{clientId}/{filename}`
  2. Create record in client_photos with metadata
  3. Call Claude API Vision to generate alt_text_auto
  4. Show suggested alt text for approval/edit
- Photo grid with GBP category assignment
- Categories as drag targets or dropdown per photo:
  logo, cover, exterior, interior, team, work_completed, product, at_work, other
- Approved toggle per photo
- Photo count by category shown

**Claude Vision alt text generation (Edge Function):**
```typescript
// supabase/functions/generate-alt-text/index.ts
// Takes image URL, returns SEO-optimized alt text
// Example output: "Professional roof installation by Anderson Roofing in Santa Maria California"
```

---

### MODULE 6: Preview (the "wow moment")
**Route:** `/preview/[token]` (PUBLIC — no auth required)
**Tables:** `previews`, `gbp_profiles`, `client_photos`, `generated_outputs`

**Generator (internal, requires auth):**
- Select client
- Choose preview type: GBP, Website, or Combined
- Auto-populates from client data (gbp_profiles, photos, generated_outputs)
- Generate token + expiration (7 days)
- Copy shareable link

**Public preview page (no auth):**
- Clean, professional layout
- GBP mockup: business name, category, photos, description, hours, reviews placeholder
- Website mockup: Hero with photo, services section, about, CTA
- "Approve" and "Request Changes" buttons
- Feedback text field
- On approve: update preview.approved = true, send notification

---

### MODULE 7: GBP Profile
**Route:** `/gbp/[clientId]`
**Tables:** `gbp_profiles`, `gbp_posts`

- Form with all GBP fields:
  - business_name, primary_category, secondary_categories
  - description (with character count, max 750)
  - services (add/remove, each with name + description)
  - service_area (cities multiselect + radius)
  - hours (day-by-day schedule)
  - phone, website_url, address
  - attributes (checkboxes: "se habla español", "wheelchair accessible", etc.)
- BrightLocal sync status indicator
- Posts manager:
  - Create post with content + photo + CTA
  - Schedule for future date
  - Status tracking (draft → approved → published)

---

### MODULE 8: Dashboard
**Route:** `/dashboard`

- Metric cards:
  - Total clients (by status)
  - Diagnostics this month
  - Pending onboardings
  - Active clients
- Recent activity feed (from activity_log)
- Quick actions: New Diagnostic, View Pending Onboardings

---

## 8. ACTIVITY LOGGING

Every significant action should write to `activity_log`. Use a helper:

```typescript
async function logActivity(params: {
  action: string;
  entityType: string;
  entityId: string;
  clientId?: string;
  metadata?: Record<string, any>;
}) {
  const user = await getUser();
  await supabase.from('activity_log').insert({
    tenant_id: user.tenant_id,
    user_id: user.id,
    client_id: params.clientId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    metadata: params.metadata,
  });
}
```

Log these events:
- `client_created`, `client_updated`
- `diagnostic_started`, `diagnostic_completed`
- `nap_check_completed`
- `credentials_updated`
- `photo_uploaded`, `photo_approved`
- `brief_generated`, `brief_approved`
- `persona_generated`, `persona_approved`
- `offer_generated`, `offer_approved`
- `preview_created`, `preview_viewed`, `preview_approved`
- `gbp_profile_updated`, `gbp_post_created`

---

## 9. IMPLEMENTATION ORDER

1. **Fork template** → rename to c3-studio, push to GitHub
2. **Replace Clerk with Supabase Auth** → login/signup working
3. **Connect to Supabase** → env vars, client setup, test query
4. **Sidebar navigation** → replace template routes with C3 routes
5. **Apply C3 branding** → theme preset, logo, colors
6. **Module 1: Clients** → CRUD, list, detail
7. **Module 2: Diagnóstico** → wizard, tier calculation, result page
8. **Module 3: Credenciales** → checklist
9. **Module 4: NAP** → checklist + external links
10. **Module 5: Photos** → upload, categorize, alt text
11. **Module 6: Preview** → generator + public page
12. **Module 7: GBP** → profile form + posts
13. **Module 8: Dashboard** → metrics + activity feed

**Do NOT skip steps. Each module depends on the previous ones.**

---

## 10. TESTING CHECKLIST

After each module:
- [ ] Can create new records
- [ ] Can view/edit existing records
- [ ] RLS works (only see own tenant's data)
- [ ] Activity log entries created
- [ ] Responsive on tablet (Carlos uses iPad sometimes)
- [ ] No console errors
- [ ] Loading states shown during API calls
- [ ] Error states handled with toast notifications

---

## 11. DO NOT

- ❌ Do NOT use Clerk, NextAuth, or any auth besides Supabase Auth
- ❌ Do NOT create new database tables — they already exist
- ❌ Do NOT modify RLS policies
- ❌ Do NOT hardcode tenant_id — always use get_user_tenant_id() or context
- ❌ Do NOT add external CSS libraries — use only Tailwind + shadcn
- ❌ Do NOT add unnecessary packages — keep dependencies minimal
- ❌ Do NOT make the preview page require authentication
- ❌ Do NOT skip the activity logging

---

## 12. SUPABASE PROJECT DETAILS

```
Project ID: uxczbwtfcsjsrmrikwoh
Region: [check Supabase dashboard]
Tenant seed: C3 Local Marketing (slug: 'c3')
Storage bucket: client-photos (10MB limit, private)
Migrations: 7 applied (001-007)
```

---

## 13. NOTES FOR CLAU

- Use Claude Opus 4.6 for architecture decisions and complex components
- Use Claude Sonnet for repetitive CRUD operations
- Commit after each module is complete with descriptive message
- If something is unclear, ask Luis — do NOT assume
- The diagnostic wizard is the most important module — spend extra time on UX
- Spanish labels are OK for internal-facing UI (Carlos speaks Spanish)
- English for code comments and variable names
