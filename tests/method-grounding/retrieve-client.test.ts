/**
 * F-065 method grounding — retrieval client: request shape (T-V03), timeout
 * (T-V07), and the full degradation matrix (T-V08).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchRetrieveMethod,
  TOP_K
} from '../../src/lib/method-grounding/retrieve-method-client.ts';

const ENV = { url: 'https://example.test/retrieve-method', key: 'secret-key' };
const PARAMS = {
  methodology_family: 'c3_value_method',
  step: 'ofv',
  query: 'intent query'
};

function jsonResponse(status: number, body: unknown, ok?: boolean) {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    json: async () => body
  } as unknown as Response;
}

// --- T-V03: request shape (header + body with four fields) ---
test('T-V03 request uses x-aeos-method-key header and 4-field body', async () => {
  let captured: { url: string; opts: RequestInit } | null = null;
  const fetchImpl = (async (url: string, opts: RequestInit) => {
    captured = { url, opts };
    return jsonResponse(200, {
      segments: [
        {
          content: 'c',
          section_title: 't',
          origin_path: 'p',
          knowledge_layer: 'source_foundational',
          similarity: 0.7
        }
      ]
    });
  }) as unknown as typeof fetch;

  const res = await fetchRetrieveMethod(PARAMS, { env: ENV, fetchImpl });
  assert.equal(res.ok, true);
  assert.ok(captured);
  assert.equal(captured!.url, ENV.url);
  const headers = captured!.opts.headers as Record<string, string>;
  assert.equal(headers['x-aeos-method-key'], ENV.key);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(captured!.opts.method, 'POST');
  const body = JSON.parse(captured!.opts.body as string);
  assert.deepEqual(body, {
    methodology_family: 'c3_value_method',
    step: 'ofv',
    query: 'intent query',
    top_k: TOP_K
  });
});

// --- T-V07: timeout aborts and degrades to reason:timeout ---
test('T-V07 slow fetch beyond timeout -> ok:false reason:timeout', async () => {
  const slowFetch = ((_url: string, opts: RequestInit) =>
    new Promise((_resolve, reject) => {
      const signal = opts.signal as AbortSignal;
      signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    })) as unknown as typeof fetch;

  const res = await fetchRetrieveMethod(PARAMS, {
    env: ENV,
    fetchImpl: slowFetch,
    timeoutMs: 15
  });
  assert.equal(res.ok, false);
  assert.equal((res as { reason: string }).reason, 'timeout');
});

// --- T-V08: full degradation matrix ---
test('T-V08 network throw -> reason:network', async () => {
  const fetchImpl = (async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;
  const res = await fetchRetrieveMethod(PARAMS, { env: ENV, fetchImpl });
  assert.deepEqual(res, { ok: false, reason: 'network' });
});

test('T-V08 400 and 401 -> reason:http_4xx', async () => {
  for (const status of [400, 401, 404, 405]) {
    const fetchImpl = (async () =>
      jsonResponse(status, { error: 'x' }, false)) as unknown as typeof fetch;
    const res = await fetchRetrieveMethod(PARAMS, { env: ENV, fetchImpl });
    assert.deepEqual(
      res,
      { ok: false, reason: 'http_4xx' },
      `status ${status}`
    );
  }
});

test('T-V08 500 and 502 -> reason:http_5xx', async () => {
  for (const status of [500, 502, 503]) {
    const fetchImpl = (async () =>
      jsonResponse(status, { error: 'x' }, false)) as unknown as typeof fetch;
    const res = await fetchRetrieveMethod(PARAMS, { env: ENV, fetchImpl });
    assert.deepEqual(
      res,
      { ok: false, reason: 'http_5xx' },
      `status ${status}`
    );
  }
});

test('T-V08 200 with unparseable JSON -> reason:malformed', async () => {
  const fetchImpl = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      }
    }) as unknown as Response) as unknown as typeof fetch;
  const res = await fetchRetrieveMethod(PARAMS, { env: ENV, fetchImpl });
  assert.deepEqual(res, { ok: false, reason: 'malformed' });
});

test('T-V08 200 without segments array -> reason:malformed', async () => {
  const fetchImpl = (async () =>
    jsonResponse(200, { meta: {} })) as unknown as typeof fetch;
  const res = await fetchRetrieveMethod(PARAMS, { env: ENV, fetchImpl });
  assert.deepEqual(res, { ok: false, reason: 'malformed' });
});

test('T-V08 200 with segments:[] -> reason:empty', async () => {
  const fetchImpl = (async () =>
    jsonResponse(200, { segments: [] })) as unknown as typeof fetch;
  const res = await fetchRetrieveMethod(PARAMS, { env: ENV, fetchImpl });
  assert.deepEqual(res, { ok: false, reason: 'empty' });
});

test('T-V08 missing env -> reason:not_configured (no fetch call)', async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return jsonResponse(200, { segments: [] });
  }) as unknown as typeof fetch;
  const res = await fetchRetrieveMethod(PARAMS, {
    env: { url: undefined, key: undefined },
    fetchImpl
  });
  assert.deepEqual(res, { ok: false, reason: 'not_configured' });
  assert.equal(called, false, 'fetch must not be called when not configured');
});

test('T-V08 200 with segments -> ok:true', async () => {
  const seg = {
    content: 'method',
    section_title: 's',
    origin_path: 'p',
    knowledge_layer: 'protocol_canonical',
    similarity: 0.6
  };
  const fetchImpl = (async () =>
    jsonResponse(200, { segments: [seg] })) as unknown as typeof fetch;
  const res = await fetchRetrieveMethod(PARAMS, { env: ENV, fetchImpl });
  assert.equal(res.ok, true);
  assert.deepEqual((res as { segments: unknown[] }).segments, [seg]);
});
