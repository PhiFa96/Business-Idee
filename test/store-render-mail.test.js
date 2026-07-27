import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { normalizeAll } from '../src/normalize.js';
import { filterNotices } from '../src/filter.js';
import { loadFixture } from '../src/fixtures.js';
import { loadNiche, validateNiche, loadSite, siteProblems, impressumProblems } from '../src/config.js';
import { loadStore, saveStore, diffAndRecord, archiveOf, prune } from '../src/store.js';
import { renderMail, renderDigest, renderArchive, renderCsv, escapeHtml, formatMoney, formatDate } from '../src/render.js';
import { fileTransport, resendTransport, pickTransport } from '../src/mail.js';
import { materialize } from '../src/fixtures.js';

const NOW = new Date('2026-07-25T09:00:00Z');
const niche = await loadNiche('gebaeudereinigung');
// Pflichtangaben jeder Werbemail - ohne sie verweigert renderMail den Dienst.
const MAIL = { unsubscribeUrl: 'https://example.test/abmelden?t=abc', impressum: 'Max Muster · Musterweg 1 · 12345 Musterstadt' };
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
  const { subject, html } = renderMail(notices.slice(0, 3), niche, { now: NOW, ...MAIL });
  assert.match(subject, /3 neue Ausschreibungen/);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Vergabe-Radar/);
});

test('renderMail erzeugt auch ohne Treffer eine Mail', () => {
  // Eine Mail an einem leeren Tag ist kein Fehler, sondern der Beweis, dass der
  // Dienst laeuft. Schweigen waere von einem Ausfall nicht zu unterscheiden.
  const { subject, html } = renderMail([], niche, { now: NOW, ...MAIL });
  assert.match(subject, /keine neuen Ausschreibungen/);
  assert.match(html, /dass der Dienst läuft/);
});

test('renderMail maskiert Markup aus den Quelldaten', () => {
  const evil = { id: 'x', title: '<script>alert(1)</script>', buyer: '<b>B</b>', cpv: [], matchedCpv: [], url: 'https://e.test' };
  const { html } = renderMail([evil], niche, { now: NOW, ...MAIL });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('renderArchive schreibt den Inhalt als echtes HTML, nicht in einen JSON-Block', () => {
  // Der entscheidende Punkt der SEO-Umstellung: Ohne JavaScript muss die Liste
  // vollstaendig im Dokument stehen. Frueher wurde sie per Skript erzeugt.
  const html = renderArchive(notices, niche, { now: NOW });
  assert.ok(!html.includes('id="data"'), 'kein JSON-Datenblock mehr');
  for (const notice of notices.slice(0, 5)) {
    assert.ok(html.includes(escapeHtml(notice.title)), `Titel fehlt im HTML: ${notice.title}`);
  }
  assert.equal((html.match(/<article class="item/g) ?? []).length, notices.length);
  assert.match(html, /prefers-color-scheme:dark/);
});

test('renderArchive maskiert Markup aus den Quelldaten', () => {
  const evil = { id: 'x', title: '</script><img src=x onerror=alert(1)>', buyer: null, cpv: [], nuts: [], publishedAt: NOW.toISOString() };
  const html = renderArchive([evil], niche, { now: NOW });
  assert.ok(!html.includes('<img src=x'), 'kein ausfuehrbares Markup aus Fremddaten');
  assert.match(html, /&lt;img src=x/);
});

test('renderArchive kommt mit einer leeren Liste klar', () => {
  const html = renderArchive([], niche, { now: NOW });
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Keine Ausschreibungen erfasst/);
});

test('renderMail verweigert den Dienst ohne Abmeldelink und ohne Absenderangabe', () => {
  // Eine Werbemail ohne beides ist rechtswidrig. Lieber ein roter Workflow als
  // eine Abmahnung - deshalb ist das ein Fehler und keine Warnung.
  assert.throws(() => renderMail([], niche, { now: NOW }), /unsubscribeUrl/);
  assert.throws(() => renderMail([], niche, { now: NOW, unsubscribeUrl: 'https://x.test' }), /impressum/);
});

test('jede erzeugte Mail enthaelt Abmeldelink und Absenderangabe', () => {
  for (const build of [renderMail, renderDigest]) {
    const { html } = build(notices.slice(0, 2), niche, { now: NOW, ...MAIL });
    assert.ok(html.includes(MAIL.unsubscribeUrl), `${build.name}: Abmeldelink fehlt`);
    assert.ok(html.includes(escapeHtml(MAIL.impressum)), `${build.name}: Absenderangabe fehlt`);
  }
});

test('renderDigest bewirbt den bezahlten Alert, wenn eine Angebotsseite bekannt ist', () => {
  const { subject, html } = renderDigest(notices.slice(0, 2), niche, { now: NOW, ...MAIL, offerUrl: 'https://x.test/angebot' });
  assert.match(subject, /dieser Woche/);
  assert.match(html, /79 € im Monat/);
  assert.ok(html.includes('https://x.test/angebot'));
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

test('loadSite meldet fehlende Pflichtangaben, statt Platzhalter zu erfinden', async () => {
  const site = await loadSite();
  assert.ok(Array.isArray(siteProblems(site)));
  assert.deepEqual(siteProblems({ baseUrl: 'https://x.test', impressum: 'A', kontaktEmail: 'a@b.de' }), []);
  assert.equal(siteProblems({ baseUrl: null, impressum: null, kontaktEmail: null }).length, 3);
});

// ------------------------------------------------------------- Impressum

test('impressumProblems erkennt die Pflichtangaben nach §5 DDG', () => {
  const vollstaendig = 'Fade Digital GmbH, Musterweg 1, 12345 Musterstadt, kontakt@fade.de, '
    + 'Amtsgericht Musterstadt HRB 12345, Geschäftsführer: Phillip Fade';
  assert.deepEqual(impressumProblems(vollstaendig), []);
});

test('impressumProblems nennt bei einer GmbH auch die Registerangaben', () => {
  const problems = impressumProblems('Fade Digital GmbH');
  assert.equal(problems.length, 4);
  assert.ok(problems.some((p) => p.includes('Anschrift')));
  assert.ok(problems.some((p) => p.includes('Kontakt')));
  assert.ok(problems.some((p) => p.includes('Handelsregisternummer')));
  assert.ok(problems.some((p) => p.includes('vertretungsberechtigte')));
});

test('impressumProblems verlangt von einer Einzelperson keine Registerangaben', () => {
  const person = 'Phillip Fade, Musterweg 1, 12345 Musterstadt, kontakt@example.de';
  assert.deepEqual(impressumProblems(person), []);
});

test('impressumProblems meldet ein leeres Impressum als komplett fehlend', () => {
  assert.equal(impressumProblems('').length, 1);
  assert.equal(impressumProblems(null).length, 1);
});
