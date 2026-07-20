-- F-078 — Readiness core (veredicto de elegibilidad GBP)
-- PROPOSED migration. DDL application is a GATED frontier action (F-074): it is
-- applied by the operator / Leader via Supabase MCP `apply_migration` AFTER `APROBADO`.
-- The implementer authored this SQL offline and did NOT execute it (T-01..T-03 = [DDL]).
--
-- Target project: uxczbwtfcsjsrmrikwoh ("C3 Studio").
-- Schema authored against the REAL live schema inspected 2026-07-17 (nap_checks,
-- credentials, gbp_profiles, clients).
--
-- Design refs: F-078 design §2.1 (enums), §2.2 (table + indexes + RLS), §2.3 (credentials ALTER).
-- Requirements: R-01..R-05, R-16, R-21.

begin;

-- ---------------------------------------------------------------------------
-- T-01 — Enums (design §2.1)
-- ---------------------------------------------------------------------------
create type eligibility_verdict as enum
  ('elegible', 'bloqueado', 'necesita_fix', 'datos_insuficientes');

create type readiness_blocker as enum
  ('sos_inactive', 'cslb_inactive', 'nap_inconsistent',
   'gbp_duplicate', 'gbp_missing', 'legal_name_mismatch');

create type sos_status as enum
  ('active', 'suspended', 'dissolved', 'unknown');

-- ---------------------------------------------------------------------------
-- T-01 — Table readiness_assessments (design §2.2)
-- Historizable / append-only (R-01), per-location unit (R-02), references
-- evidence rows (R-03), stores a signal snapshot (R-04).
-- ---------------------------------------------------------------------------
create table readiness_assessments (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references clients(id) on delete cascade,
  location_label        text,
  gbp_profile_id        uuid references gbp_profiles(id) on delete set null,
  nap_check_id          uuid references nap_checks(id) on delete set null,
  credential_id         uuid references credentials(id) on delete set null,
  verdict               eligibility_verdict not null,
  blockers              readiness_blocker[] not null default '{}',
  -- snapshot of the signal values used at compute time (R-04)
  snap_sos_status       sos_status,
  snap_cslb_active      boolean,
  snap_cslb_name_match  boolean,
  snap_nap_risk         nap_risk,
  snap_nap_consistent   boolean,
  snap_gbp_exists       boolean,
  snap_gbp_duplicate    boolean,
  rationale             text,
  assessed_by           uuid,
  assessed_at           timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

create index idx_readiness_assessments_client_id
  on readiness_assessments (client_id);
create index idx_readiness_assessments_gbp_profile_id
  on readiness_assessments (gbp_profile_id);
-- helps "latest per location": order by assessed_at desc within a client (+ location)
create index idx_readiness_assessments_client_assessed_at
  on readiness_assessments (client_id, assessed_at desc);

-- ---------------------------------------------------------------------------
-- T-02 — RLS (design §2.2). Mirror of nap_checks: NO tenant_id column; isolate
-- via join to clients. Policies for SELECT and INSERT (R-05).
-- ---------------------------------------------------------------------------
alter table readiness_assessments enable row level security;

create policy "readiness_assessments_select_by_tenant"
  on readiness_assessments for select
  using (
    client_id in (select id from clients where tenant_id = get_user_tenant_id())
  );

create policy "readiness_assessments_insert_by_tenant"
  on readiness_assessments for insert
  with check (
    client_id in (select id from clients where tenant_id = get_user_tenant_id())
  );

-- ---------------------------------------------------------------------------
-- T-03 — ALTER credentials: additive legal signal columns, per-client home of
-- the inherited legal evidence (R-16). Non-breaking (adds columns only).
-- ---------------------------------------------------------------------------
alter table credentials
  add column sos_status sos_status not null default 'unknown',
  add column cslb_active boolean not null default false,
  add column legal_name_verified boolean not null default false;

commit;
