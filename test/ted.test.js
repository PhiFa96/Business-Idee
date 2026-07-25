import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildQuery, tedDate, fetchPage, fetchAll, mergeSchema, extractNotices, extractTotal, TedError, DEFAULT_TED_SCHEMA } from '../src/ted.js';

const NOW = new Date('2026-07-25T09:00:00Z');
const niche = { slug: 'test', country: 'DEU', cpv: ['90911200', '90919200'] };

const jsonResponse = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (key) => headers[key.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

test('tedDate liefert das yyyymmdd-Format der Expert-Query', () => {
  assert.equal(tedDate(NOW), '20260725');
});

test('buildQuery verbindet CPV, Land und Zeitraum', () => {
  const query = buildQuery(niche, { days: 30, now: NOW });
  assert.equal(query, 'classification-cpv IN (90911200 90919200) AND buyer-country IN (DEU) AND publication-date >= 20260625');
});

test('buildQuery verweigert eine Nische ohne CPV-Codes', () => {
  assert.throws(() => buildQuery({ slug: 'leer', cpv: [] }, { now: NOW }), /keine CPV-Codes/);
});

test('mergeSchema ueberschreibt einzelne Felder, ohne den Rest zu verlieren', () => {
  const merged = mergeSchema({ fields: { title: 'notice-title-proc' }, endpoint: 'https://example.test/search' });
  assert.equal(merged.fields.title, 'notice-title-proc');
  assert.equal(merged.fields.id, DEFAULT_TED_SCHEMA.fields.id, 'nicht genannte Felder bleiben stehen');
  assert.equal(merged.endpoint, 'https://example.test/search');
  assert.deepEqual(mergeSchema(null), DEFAULT_TED_SCHEMA);
});

test('extractNotices und extractTotal kommen mit verschiedenen Umschlaegen klar', () => {
  assert.deepEqual(extractNotices({ notices: [1] }), [1]);
  assert.deepEqual(extractNotices({ results: [2] }), [2]);
  assert.deepEqual(extractNotices([3]), [3]);
  assert.deepEqual(extractNotices({ unbekannt: [4] }), []);
  assert.equal(extractTotal({ totalNoticeCount: 7 }), 7);
  assert.equal(extractTotal({ total: 9 }), 9);
  assert.equal(extractTotal({}, 3), 3);
});

test('fetchPage schickt Query und Felder als POST-Body', async () => {
  let seen = null;
  await fetchPage({
    query: 'X',
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return jsonResponse({ notices: [] });
    },
  });
  assert.equal(seen.url, DEFAULT_TED_SCHEMA.endpoint);
  assert.equal(seen.options.method, 'POST');
  const body = JSON.parse(seen.options.body);
  assert.equal(body.query, 'X');
  assert.ok(body.fields.includes('publication-number'));
});

test('fetchPage setzt den Authorization-Header nur, wenn ein Key da ist', async () => {
  const headersOf = async (apiKey) => {
    let captured;
    await fetchPage({ query: 'X', apiKey, fetchImpl: async (_u, o) => { captured = o.headers; return jsonResponse({ notices: [] }); } });
    return captured;
  };
  assert.equal((await headersOf(undefined)).authorization, undefined);
  assert.equal((await headersOf('geheim')).authorization, 'Bearer geheim');
});

test('fetchPage wiederholt bei 429 und liefert danach das Ergebnis', async () => {
  let calls = 0;
  const payload = await fetchPage({
    query: 'X',
    maxRetries: 3,
    fetchImpl: async () => {
      calls += 1;
      return calls < 3 ? jsonResponse({ error: 'slow down' }, 429, { 'retry-after': '0' }) : jsonResponse({ notices: [{ id: 1 }] });
    },
  });
  assert.equal(calls, 3);
  assert.equal(payload.notices.length, 1);
});

test('fetchPage gibt bei einer ungueltigen Abfrage sofort auf und nennt den Grund', async () => {
  let calls = 0;
  await assert.rejects(
    fetchPage({
      query: 'X',
      fetchImpl: async () => { calls += 1; return jsonResponse({ message: 'unknown field: buyer-country' }, 400); },
    }),
    (err) => {
      assert.ok(err instanceof TedError);
      assert.equal(err.kind, 'query');
      assert.match(err.detail, /unknown field/);
      return true;
    },
  );
  assert.equal(calls, 1, 'ein Query-Fehler wird nicht wiederholt - das waere nur Wartezeit');
});

test('fetchPage erkennt eine blockierende Proxy-Antwort als eigene Fehlerklasse', async () => {
  await assert.rejects(
    fetchPage({ query: 'X', fetchImpl: async () => { throw new Error('CONNECT tunnel failed, response 403'); } }),
    (err) => err instanceof TedError && err.kind === 'blocked',
  );
});

test('fetchPage meldet 401 als Authentifizierungsproblem', async () => {
  await assert.rejects(
    fetchPage({ query: 'X', fetchImpl: async () => jsonResponse({}, 401) }),
    (err) => err instanceof TedError && err.kind === 'auth',
  );
});

test('ein 403 mit Allowlist-Hinweis ist ein Netzwerkproblem, kein Zugangsproblem', async () => {
  // Die beiden Faelle sehen gleich aus, verlangen aber voellig Verschiedenes:
  // beim einen prueft man den API-Key, beim anderen die Firewall.
  await assert.rejects(
    fetchPage({ query: 'X', fetchImpl: async () => jsonResponse('Host not in allowlist: api.ted.europa.eu', 403) }),
    (err) => err instanceof TedError && err.kind === 'blocked',
  );
  await assert.rejects(
    fetchPage({ query: 'X', fetchImpl: async () => jsonResponse('invalid credentials', 403) }),
    (err) => err instanceof TedError && err.kind === 'auth',
  );
});

test('fetchAll blaettert weiter, bis eine Seite nicht mehr voll ist', async () => {
  const pages = [
    Array.from({ length: 2 }, (_, i) => ({ id: `a${i}` })),
    Array.from({ length: 2 }, (_, i) => ({ id: `b${i}` })),
    [{ id: 'c0' }],
  ];
  let requested = 0;
  const { notices, total } = await fetchAll({
    query: 'X',
    limit: 2,
    fetchImpl: async (_u, o) => {
      const page = JSON.parse(o.body).page;
      requested = Math.max(requested, page);
      return jsonResponse({ notices: pages[page - 1] ?? [], totalNoticeCount: 5 });
    },
  });
  assert.equal(requested, 3);
  assert.equal(notices.length, 5);
  assert.equal(total, 5);
});

test('fetchAll haelt sich an maxPages', async () => {
  const { notices } = await fetchAll({
    query: 'X',
    limit: 2,
    maxPages: 2,
    fetchImpl: async () => jsonResponse({ notices: [{ id: 1 }, { id: 2 }] }),
  });
  assert.equal(notices.length, 4);
});
