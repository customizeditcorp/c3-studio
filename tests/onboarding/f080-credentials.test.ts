/**
 * F-080 — Credentials capture bugfix (generated column + error-surfacing + maybeSingle).
 * T-03 (R-02/R-03 regression), T-04 (R-09 metadata), T-07 (R-04/R-05), T-09 (R-06).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCredentialsPayload,
  handleCredentialsSave,
  loadCredentials,
  CREDENTIALS_WRITABLE_COLUMNS,
  type CredentialsReadClient,
  type CredentialsWriteClient
} from '../../src/lib/onboarding/credentials.ts';

const baseArgs = {
  clientId: 'c1',
  entityType: 'llc',
  legalName: 'Acme LLC',
  dbaNumber: 'DBA-1',
  cslbNumber: '1012345',
  cityLicense: 'BL-1',
  checklist: { google_account: true, gbp_access: true, cslb_license: false },
  sosStatus: 'active' as const,
  cslbActive: true,
  legalNameVerified: true
};

// --- T-03 (R-02/R-03): items_completed is a generated column → never in the write ---
test('T-03 buildCredentialsPayload does NOT contain items_completed', () => {
  const p = buildCredentialsPayload(baseArgs);
  assert.ok(
    !('items_completed' in p),
    'items_completed must be absent from payload'
  );
  // A non-generated column IS still present.
  assert.equal(p.sos_status, 'active');
});

test('T-03 CREDENTIALS_WRITABLE_COLUMNS excludes items_completed', () => {
  assert.ok(!CREDENTIALS_WRITABLE_COLUMNS.includes('items_completed'));
  assert.ok(CREDENTIALS_WRITABLE_COLUMNS.includes('sos_status'));
});

// --- T-04 (R-09): activity metadata count derived locally, not from the payload ---
test('T-04 completed count derives from the checklist, independent of payload', () => {
  const checklist = {
    google_account: true,
    gbp_access: true,
    cslb_license: false
  };
  // The page derives the count with this exact expression for logActivity metadata.
  const completedCount = Object.values(checklist).filter(Boolean).length;
  assert.equal(completedCount, 2);
  // And the persisted payload no longer exposes it (so it CANNOT be read from there).
  const p = buildCredentialsPayload({ ...baseArgs, checklist });
  assert.ok(!('items_completed' in p));
});

// --- Write mock ---
function mockCredWriteClient(opts: {
  error?: unknown;
  insertId?: string;
}): CredentialsWriteClient {
  const error = opts.error ?? null;
  return {
    from() {
      return {
        update() {
          return { eq: async () => ({ error }) };
        },
        insert() {
          return {
            select() {
              return {
                single: async () => ({
                  data: error ? null : { id: opts.insertId ?? 'new-id' },
                  error
                })
              };
            }
          };
        }
      };
    }
  };
}

const payload = buildCredentialsPayload(baseArgs);

// --- T-07 (R-04/R-05): failure surfaced (onError = toast.error), no false success ---
test('T-07 credentials insert error surfaced (onError), ok=false, no success', async () => {
  let onErrorCalls = 0;
  let logActivityCalls = 0;
  const res = await handleCredentialsSave(
    {
      supabase: mockCredWriteClient({ error: { code: '400' } }),
      payload,
      credentialId: null
    },
    {
      logActivity: () => {
        logActivityCalls++;
      },
      onError: () => {
        onErrorCalls++;
      }
    }
  );
  assert.equal(res.ok, false);
  assert.equal(onErrorCalls, 1); // toast.error path taken (was silent before F-080)
  assert.equal(logActivityCalls, 0);
});

test('T-07 credentials update error surfaced (onError), ok=false, no success', async () => {
  let onErrorCalls = 0;
  let logActivityCalls = 0;
  const res = await handleCredentialsSave(
    {
      supabase: mockCredWriteClient({ error: { code: '400' } }),
      payload,
      credentialId: 'existing-id'
    },
    {
      logActivity: () => {
        logActivityCalls++;
      },
      onError: () => {
        onErrorCalls++;
      }
    }
  );
  assert.equal(res.ok, false);
  assert.equal(onErrorCalls, 1);
  assert.equal(logActivityCalls, 0);
});

test('T-07 credentials success path: ok=true, logActivity runs, no onError', async () => {
  let onErrorCalls = 0;
  let logActivityCalls = 0;
  const res = await handleCredentialsSave(
    {
      supabase: mockCredWriteClient({ insertId: 'cred-7' }),
      payload,
      credentialId: null
    },
    {
      logActivity: () => {
        logActivityCalls++;
      },
      onError: () => {
        onErrorCalls++;
      }
    }
  );
  assert.equal(res.ok, true);
  assert.equal(res.credentialId, 'cred-7');
  assert.equal(logActivityCalls, 1);
  assert.equal(onErrorCalls, 0);
});

// --- T-09 (R-06): 0-row load uses maybeSingle → null row, no throw ---
function mockCredReadClient(
  row: Record<string, unknown> | null
): CredentialsReadClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                // only maybeSingle exists: .single() would throw → proves the path.
                maybeSingle: async () => ({ data: row, error: null })
              };
            }
          };
        }
      };
    }
  };
}

test('T-09 loadCredentials with 0 rows resolves null row, no throw (no 406)', async () => {
  const res = await loadCredentials(mockCredReadClient(null), 'client-1');
  assert.equal(res.credentialId, null);
  assert.equal(res.row, null);
});

test('T-09 loadCredentials with a row returns id + row', async () => {
  const res = await loadCredentials(
    mockCredReadClient({ id: 'cred-1', legal_name: 'Acme LLC' }),
    'client-1'
  );
  assert.equal(res.credentialId, 'cred-1');
  assert.equal(res.row?.legal_name, 'Acme LLC');
});
