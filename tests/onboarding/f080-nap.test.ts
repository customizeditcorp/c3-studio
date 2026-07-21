/**
 * F-080 — NAP capture bugfix (generated column + error-surfacing + maybeSingle).
 * T-03 (R-01/R-03 regression), T-07 (R-04/R-05), T-09 (R-06).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNapCheckPayload,
  handleNapSave,
  loadLatestNapCheck,
  NAP_WRITABLE_COLUMNS,
  type NapReadClient,
  type NapWriteClient
} from '../../src/lib/onboarding/nap-check.ts';

const fullChecklist = {
  google_name_match: true,
  cslb_name_match: true,
  address_consistent: true,
  phone_consistent: true,
  cslb_active: true,
  entity_verified: true
};

// --- T-03 (R-01/R-03): items_passed is a generated column → never in the write ---
test('T-03 buildNapCheckPayload does NOT contain items_passed', () => {
  const payload = buildNapCheckPayload({
    clientId: 'c1',
    checklist: fullChecklist,
    notes: 'ok',
    checkedBy: 'u1'
  });
  assert.ok(
    !('items_passed' in payload),
    'items_passed must be absent from payload'
  );
  // risk_level (non-generated) IS present.
  assert.ok('risk_level' in payload);
  assert.equal(payload.risk_level, 'consistent');
});

test('T-03 NAP_WRITABLE_COLUMNS excludes items_passed but keeps risk_level', () => {
  assert.ok(!NAP_WRITABLE_COLUMNS.includes('items_passed'));
  assert.ok(NAP_WRITABLE_COLUMNS.includes('risk_level'));
});

// --- Write mock ---
function mockNapWriteClient(opts: {
  error?: unknown;
  insertId?: string;
}): NapWriteClient {
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

const payload = buildNapCheckPayload({
  clientId: 'c1',
  checklist: fullChecklist,
  notes: '',
  checkedBy: 'u1'
});

// --- T-07 (R-04/R-05): failure is surfaced, success toast is NOT reached ---
test('T-07 NAP insert error is surfaced (onError), no success, ok=false', async () => {
  let onErrorCalls = 0;
  let logActivityCalls = 0; // proxy for the success path (toast.success follows it)
  const res = await handleNapSave(
    {
      supabase: mockNapWriteClient({ error: { code: '400' } }),
      payload,
      napCheckId: null
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
  assert.equal(logActivityCalls, 0); // success path (→ toast.success) never reached
});

test('T-07 NAP update error is surfaced (onError), no success, ok=false', async () => {
  let onErrorCalls = 0;
  let logActivityCalls = 0;
  const res = await handleNapSave(
    {
      supabase: mockNapWriteClient({ error: { code: '400' } }),
      payload,
      napCheckId: 'existing-id'
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

test('T-07 NAP success path: ok=true, logActivity runs, no onError', async () => {
  let onErrorCalls = 0;
  let logActivityCalls = 0;
  const res = await handleNapSave(
    {
      supabase: mockNapWriteClient({ insertId: 'row-9' }),
      payload,
      napCheckId: null
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
  assert.equal(res.napCheckId, 'row-9');
  assert.equal(logActivityCalls, 1);
  assert.equal(onErrorCalls, 0);
});

// --- T-09 (R-06): 0-row load uses maybeSingle → null row, no throw, empty checklist ---
function mockNapReadClient(row: Record<string, unknown> | null): NapReadClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      return {
                        // only maybeSingle exists: calling .single() would throw,
                        // structurally proving maybeSingle is the path used.
                        maybeSingle: async () => ({ data: row, error: null })
                      };
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  };
}

test('T-09 loadLatestNapCheck with 0 rows resolves empty, no throw (no 406)', async () => {
  const res = await loadLatestNapCheck(mockNapReadClient(null), 'client-1');
  assert.equal(res.napCheckId, null);
  assert.deepEqual(res.checklist, {});
  assert.equal(res.notes, '');
});

test('T-09 loadLatestNapCheck with a row rebuilds id + checklist', async () => {
  const res = await loadLatestNapCheck(
    mockNapReadClient({
      id: 'nap-1',
      google_name_match: true,
      cslb_name_match: false,
      notes: 'hi'
    }),
    'client-1'
  );
  assert.equal(res.napCheckId, 'nap-1');
  assert.equal(res.checklist.google_name_match, true);
  assert.equal(res.notes, 'hi');
});
