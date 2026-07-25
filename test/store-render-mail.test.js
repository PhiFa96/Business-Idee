import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { normalizeAll } from '../src/normalize.js';
import { filterNotices } from '../src/filter.js';
import { loadFixture } from '../src/fixtures.js';
import { loadNiche, loadSubscribers, validateNiche } from '../src/config.js';
import { loadStore, saveStore, diffAndRecord, archiveOf, prune } from '../src/store.js';
import { renderMail, renderArchive, renderCsv, escapeHtml, formatMoney, formatDate } from '../src/render.js';
import { fileTransport, resendTransport, pickTransport } from '../src/mail.js';
import { materialize } from '../src/fixtures.js';

const NOW = new Date('2026-07-25T09:00:00Z');
const niche = await loadNiche('gebaeudereinigung');
const notices = filterNotices(
  normalizeAll(await loadFixture('gebaeudereinigung', { now: NOW })).notices,
  niche,
  { now: NOW },
).notices;

const withTempDir = async (fn) => {
  const dir = await mkdtemp(join(tmpdir(), 'radar-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

// ------------------------------------------------------------------- fixtures

test('materialize ersetzt relative Datums-Platzhalter', () => {
  assert.equal(materialize('{{today}}', NOW), NOW.toISOString());
  assert.equal(materialize('{{today-1}}', NOW), new Date('2026-07-24T09:00:00Z').toISOString());
  assert.equal(materialize('{{today+2}}', NOW), new Date('2026-07-27T09:00:00Z').toISOString());
  assert.equal(materialize('nichts zu tun', NOW), 'nichts zu tun');
});

// ---------------------------------------------------------------------- store

test('diffAndRecord meldet beim ersten Lauf alles als neu, beim zweiten nichts', () => {
  const store = { slug: 'x', firstSeen: {}, notices: {}, lastRun: null };
  assert.equal(diffAndRecord(store, notices, NOW).length, notices.length);
  assert.equal(diffAndRecord(store, notices, NOW).length, 0, 'Alerts duerfen sich nicht wiederholen');
  assert.equal(store.lastRun, NOW.toISOString());
});

test('diffAndRecord aktualisiert bekannte Eintraege, ohne sie erneut zu melden', () => {
  const store = { slug: 'x', firstSeen: {}, notices: {}, lastRun: null };
  diffAndRecord(store, notices, NOW);
  const changed = { ...notices[0], title: 'Korrigierter Titel' };
  assert.equal(diffAndRecord(store, [changed], NOW).length, 0);
  assert.equal(store.notices[changed.id].title, 'Korrigierter Titel');
});

test('Zustand ueberlebt Speichern und Laden', async () => {
  await withTempDir(async (dir) => {
    const store = { slug: 'gebaeudereinigung', firstSeen: {}, notices: {}, lastRun: null };
    diffAndRecord(store, notices, NOW);
    await saveStore(store, dir);
    const loaded = await loadStore('gebaeudereinigung', dir);
    assert.equal(Object.keys(loaded.notices).length, notices.length);
    assert.equal(loaded.lastRun, NOW.toISOString());
  });
});

test('loadStore liefert einen leeren Zustand, wenn es noch keine Datei gibt', async () => {
  await withTempDir(async (dir) => {
    const store = await loadStore('gibtsnicht', dir);
    assert.deepEqual(store.notices, {});
    assert.equal(store.lastRun, null);
  });
});

test('prune entfernt Alteintraege und laesst frische stehen', () => {
  const store = { slug: 'x', firstSeen: {}, notices: {}, lastRun: null };
  diffAndRecord(store, notices, NOW);
  const before = Object.keys(store.notices).length;
  assert.equal(prune(store, { keepDays: 400, now: NOW }), 0);
  const removed = prune(store, { keepDays: 30, now: NOW });
  assert.ok(removed > 0);
  assert.equal(Object.keys(store.notices).length, before - removed);
  assert.equal(Object.keys(store.firstSeen).length, before - removed, 'firstSeen laeuft mit');
});

test('archiveOf sortiert neueste zuerst', () => {
  const store = { slug: 'x', firstSeen: {}, notices: {}, lastRun: null };
  diffAndRecord(store, notices, NOW);
  const dates = archiveOf(store).map((n) => n.publishedAt);
  assert.deepEqual(dates, [...dates].sort((a, b) => String(b).localeCompare(String(a))));
});

// --------------------------------------------------------------------- render

test('escapeHtml neutralisiert Markup', () => {
  assert.equal(escapeHtml('<script>&"\''), '&lt;script&gt;&amp;&quot;&#39;');
});

test('formatMoney und formatDate zeigen Luecken als Gedankenstrich', () => {
  assert.equal(formatMoney(null), '–');
  assert.equal(formatDate(null), '–');
  assert.equal(formatDate('kein Datum'), '–');
  assert.match(formatMoney(2400000), /2\.400\.000/);
});

test('renderMail nennt die Zahl der Ausschreibungen im Betreff', () => {
  const { subject, html } = renderMail(notices.slice(0, 3), niche, { now: NOW });
  assert.match(subject, /3 neue Ausschreibungen/);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Vergabe-Radar/);
});

test('renderMail erzeugt auch ohne Treffer eine Mail', () => {
  // Eine Mail an einem leeren Tag ist kein Fehler, sondern der Beweis, dass der
  // Dienst laeuft. Schweigen waere von einem Ausfall nicht zu unterscheiden.
  const { subject, html } = renderMail([], niche, { now: NOW });
  assert.match(subject, /keine neuen Ausschreibungen/);
  assert.match(html, /dass der Dienst läuft/);
});

test('renderMail maskiert Markup aus den Quelldaten', () => {
  const evil = { id: 'x', title: '<script>alert(1)</script>', buyer: '<b>B</b>', cpv: [], matchedCpv: [], url: 'https://e.test' };
  const { html } = renderMail([evil], niche, { now: NOW });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('renderArchive bettet die Daten ein und laesst kein rohes < im JSON stehen', () => {
  const evil = { id: 'x', title: '</script><img src=x onerror=alert(1)>', cpv: [], publishedAt: NOW.toISOString() };
  const html = renderArchive([...notices, evil], niche, { now: NOW });
  assert.match(html, /id="data"/);
  const payload = html.split('type="application/json">')[1].split('</script>')[0];
  assert.ok(!payload.includes('<'), 'im eingebetteten JSON darf kein < stehen');
  assert.match(html, /prefers-color-scheme:dark/);
});

test('renderArchive kommt mit einer leeren Liste klar', () => {
  const html = renderArchive([], niche, { now: NOW });
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /\[\]/);
});

test('renderCsv nutzt Semikolon, BOM und maskiert Anfuehrungszeichen', () => {
  const csv = renderCsv([{ id: 'a', title: 'Reinigung; "gross"', cpv: [], matchedCpv: [] }]);
  assert.ok(csv.startsWith('﻿'), 'BOM, damit Excel die Umlaute richtig liest');
  assert.match(csv, /"Reinigung; ""gross"""/);
  assert.match(csv.split('\r\n')[0], /^﻿id;veroeffentlicht;titel/);
});

// ----------------------------------------------------------------------- mail

test('fileTransport schreibt statt zu versenden', async () => {
  await withTempDir(async (dir) => {
    const transport = fileTransport({ outDir: dir });
    const result = await transport.send({ to: ['a@b.de'], subject: 'S', html: '<p>x</p>', slug: 'n', now: NOW });
    assert.equal(result.delivered, false);
    assert.equal(await readFile(result.path, 'utf8'), '<p>x</p>');
    assert.match(result.path, /mail-n-2026-07-25\.html$/);
  });
});

test('pickTransport waehlt den sicheren Weg, solange kein Key gesetzt ist', () => {
  assert.equal(pickTransport({ env: {} }).name, 'file');
  assert.equal(pickTransport({ env: { RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.de' }, dryRun: true }).name, 'file');
  assert.equal(pickTransport({ env: { RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.de' } }).name, 'resend');
});

test('resendTransport verlangt Key und Absender', () => {
  assert.throws(() => resendTransport({}), /API-Key/);
  assert.throws(() => resendTransport({ apiKey: 'k' }), /Absenderadresse/);
});

test('resendTransport verschickt an bcc, damit sich Abonnenten nicht sehen', async () => {
  let body = null;
  const transport = resendTransport({
    apiKey: 'k',
    from: 'radar@example.test',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ id: 'msg_1' }), text: async () => '' };
    },
  });
  const result = await transport.send({ to: ['a@b.de', 'c@d.de'], subject: 'S', html: '<p>x</p>' });
  assert.deepEqual(body.bcc, ['a@b.de', 'c@d.de']);
  assert.equal(body.to, 'radar@example.test');
  assert.equal(result.delivered, true);
});

test('resendTransport meldet einen abgelehnten Versand als Fehler', async () => {
  const transport = resendTransport({
    apiKey: 'k',
    from: 'radar@example.test',
    fetchImpl: async () => ({ ok: false, status: 422, text: async () => 'domain not verified' }),
  });
  await assert.rejects(transport.send({ to: ['a@b.de'], subject: 'S', html: '' }), /domain not verified/);
});

test('resendTransport verschickt nichts, wenn es keine Empfaenger gibt', async () => {
  const transport = resendTransport({ apiKey: 'k', from: 'a@b.de', fetchImpl: async () => { throw new Error('haette nicht aufgerufen werden duerfen'); } });
  const result = await transport.send({ to: [], subject: 'S', html: '' });
  assert.equal(result.delivered, false);
});

// --------------------------------------------------------------------- config

test('alle vier Nischen-Konfigurationen sind gueltig', async () => {
  for (const slug of ['gebaeudereinigung', 'galabau', 'elektro-shk', 'metallbau']) {
    const config = await loadNiche(slug);
    assert.equal(config.slug, slug, 'slug muss zum Dateinamen passen');
    assert.ok(config.cpv.length > 0);
  }
});

test('validateNiche weist unbrauchbare Konfigurationen mit Begruendung zurueck', () => {
  assert.throws(() => validateNiche({ name: 'X', slug: 'x' }, 'test'), /cpv/);
  assert.throws(() => validateNiche({ name: 'X', slug: 'x', cpv: [] }, 'test'), /nicht leere Liste/);
  assert.throws(() => validateNiche({ name: 'X', slug: 'x', cpv: ['909112'] }, 'test'), /acht Ziffern/);
});

test('loadNiche nennt bei einem Tippfehler die verfuegbaren Nischen', async () => {
  await assert.rejects(loadNiche('gebauedereinigung'), /Verfuegbar: elektro-shk, galabau/);
});

test('loadSubscribers ignoriert Eintraege ohne @ und unbekannte Nischen', async () => {
  assert.deepEqual(await loadSubscribers('gibtsnicht'), []);
  assert.ok(Array.isArray(await loadSubscribers('gebaeudereinigung')));
});
