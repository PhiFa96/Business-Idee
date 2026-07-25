#!/usr/bin/env node
// Vergabe-Radar - CLI.
//
//   doctor                       Netz, API und Konfiguration pruefen
//   scan   [--days 90]           Alle Gewerke vergleichen -> Nischenauswahl und Abbruchtest
//   run    --niche <slug>        Abrufen, filtern, dedupen, speichern, rendern
//   render --niche <slug>        Nur neu rendern (offline, aus gespeichertem Zustand)
//   send   --niche <slug>        Alert an die Abonnenten (ohne Key automatisch Dry-Run)

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { styleText } from 'node:util';

import { fetchAll, fetchPage, buildQuery, TedError } from '../src/ted.js';
import { loadFixture } from '../src/fixtures.js';
import { normalizeAll } from '../src/normalize.js';
import { filterNotices, alertable, summarize } from '../src/filter.js';
import { loadNiche, loadAllNiches, loadSchema, loadSubscribers, listNicheSlugs } from '../src/config.js';
import { loadStore, saveStore, diffAndRecord, archiveOf, prune } from '../src/store.js';
import { renderMail, renderArchive, renderCsv, formatMoney } from '../src/render.js';
import { pickTransport, OUT_DIR } from '../src/mail.js';

const SITE_DIR = 'site';
const isTTY = process.stdout.isTTY;
const paint = (text, ...styles) => (isTTY ? styleText(styles, text) : text);
const info = (msg) => console.log(msg);
const ok = (msg) => console.log(`${paint('✓', 'green')} ${msg}`);
const warn = (msg) => console.log(`${paint('!', 'yellow')} ${msg}`);
const fail = (msg) => console.error(`${paint('✗', 'red')} ${msg}`);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [flag, inline] = token.slice(2).split('=');
    const next = argv[i + 1];
    if (inline !== undefined) args[flag] = inline;
    else if (next && !next.startsWith('--')) {
      args[flag] = next;
      i++;
    } else args[flag] = true;
  }
  return args;
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Uebersetzt TedError in eine Anweisung, was zu tun ist - nicht in einen Stacktrace. */
function explain(err) {
  if (!(err instanceof TedError)) return null;
  const hints = {
    blocked: 'Ein Proxy oder eine Firewall blockiert ted.europa.eu. In einem Netz ohne Filter erneut versuchen, z. B. im GitHub-Actions-Workflow.',
    network: 'Keine Verbindung zu TED. Internetverbindung pruefen und erneut versuchen.',
    auth: 'TED weist die Anfrage ab. Falls ein TED_API_KEY gesetzt ist, diesen pruefen oder ganz weglassen - die Suche ist oeffentlich.',
    query: 'Ein Feldname in der Abfrage passt nicht zur API. Anpassen in config/ted-schema.json (ueberschreibt src/ted.js, ohne Codeaenderung). Die Originalmeldung unten nennt das Feld.',
    rate: 'TED drosselt. Spaeter erneut versuchen oder --limit senken.',
    server: 'TED hat ein Problem auf der eigenen Seite. Spaeter erneut versuchen.',
    parse: 'Die Antwort war kein gueltiges JSON - meist eine Wartungs- oder Fehlerseite.',
  };
  return hints[err.kind] ?? null;
}

/** Holt Bekanntmachungen - je nach Modus live von TED oder aus den Fixtures. */
async function collect(niche, { days, fixture, schema, limit, maxPages, now }) {
  if (fixture) {
    const raw = await loadFixture(niche.slug, { now });
    return { raw, total: raw.length, query: '(Testdaten aus fixtures/)' };
  }
  const query = buildQuery(niche, { days, schema });
  const { notices, total } = await fetchAll({
    query,
    schema,
    limit,
    maxPages,
    onPage: ({ page, collected, total: t }) => info(`  Seite ${page}: ${collected}${t ? ` von ${t}` : ''} geladen`),
  });
  return { raw: notices, total, query };
}

async function pipeline(niche, options) {
  const { raw, total, query } = await collect(niche, options);
  const { notices: normalized, skipped } = normalizeAll(raw, options.schema);
  const { notices, stats } = filterNotices(normalized, niche, { now: options.now, maxAgeDays: options.days });
  return { notices, stats: { ...stats, skipped, apiTotal: total }, query };
}

// -------------------------------------------------------------------- doctor

async function cmdDoctor(args) {
  const schema = await loadSchema();
  const slugs = await listNicheSlugs();

  info(paint('\nKonfiguration', 'bold'));
  if (slugs.length === 0) {
    fail('Keine Nischen in config/niches/ gefunden.');
    return 1;
  }
  for (const slug of slugs) {
    try {
      const niche = await loadNiche(slug);
      ok(`${slug}: ${niche.cpv.length} CPV-Codes, ${niche.cpvPrefixes?.length ?? 0} Praefixe`);
    } catch (err) {
      fail(err.message);
      return 1;
    }
  }

  info(paint('\nTED-Schema', 'bold'));
  info(`  Endpunkt   ${schema.endpoint}`);
  info(`  Felder     ${Object.values(schema.fields).join(', ')}`);
  info(`  Query      ${schema.query.cpv} / ${schema.query.country} / ${schema.query.date}`);

  info(paint('\nVerbindung zu TED', 'bold'));
  const niche = await loadNiche(slugs[0]);
  const query = buildQuery(niche, { days: 7, schema });
  info(`  Testabfrage: ${query}`);

  try {
    const payload = await fetchPage({ query, schema, limit: 1, maxRetries: 1 });
    const count = payload?.totalNoticeCount ?? payload?.total ?? '?';
    ok(`TED antwortet. Treffer fuer die Testabfrage: ${count}`);
    const first = (payload?.notices ?? [])[0];
    if (first) {
      const missing = Object.entries(schema.fields).filter(([, apiName]) => !(apiName in first)).map(([key, apiName]) => `${key} -> "${apiName}"`);
      if (missing.length === 0) ok('Alle konfigurierten Felder sind in der Antwort enthalten.');
      else {
        warn(`Diese Felder fehlen in der Antwort und muessen in config/ted-schema.json korrigiert werden:`);
        missing.forEach((entry) => info(`    ${entry}`));
        info(`  Tatsaechlich gelieferte Felder: ${Object.keys(first).join(', ')}`);
      }
    }
    return 0;
  } catch (err) {
    fail(err.message);
    const hint = explain(err);
    if (hint) info(`  ${paint('Was jetzt:', 'bold')} ${hint}`);
    if (err.detail) info(`  ${paint('Antwort von TED:', 'dim')} ${String(err.detail).slice(0, 600)}`);
    return 1;
  }
}

// ---------------------------------------------------------------------- scan

async function cmdScan(args) {
  const days = num(args.days, 90);
  const fixture = Boolean(args.fixture);
  const schema = await loadSchema();
  const now = new Date();
  const niches = await loadAllNiches();

  info(paint(`\nMachbarkeitspruefung ueber ${days} Tage${fixture ? ' (Fixtures)' : ''}\n`, 'bold'));

  const rows = [];
  for (const niche of niches) {
    process.stdout.write(`  ${niche.name} … `);
    try {
      const { notices, stats } = await pipeline(niche, { days, fixture, schema, now, limit: num(args.limit, 100), maxPages: num(args['max-pages'], 10) });
      const summary = summarize(notices, niche, { days, now });
      rows.push({ ...summary, stats });
      process.stdout.write(`${summary.usable} brauchbar von ${stats.apiTotal ?? stats.input} \n`);
    } catch (err) {
      process.stdout.write(`${paint('Fehler', 'red')}\n`);
      fail(`  ${err.message}`);
      const hint = explain(err);
      if (hint) info(`    ${hint}`);
      return 1;
    }
  }

  rows.sort((a, b) => b.usable - a.usable);

  const pad = (text, width) => String(text).padEnd(width);
  const padStart = (text, width) => String(text).padStart(width);
  info(`\n  ${pad('Gewerk', 24)}${padStart('brauchbar', 10)}${padStart('pro Monat', 11)}${padStart('Median-Wert', 14)}${padStart('mit Frist', 11)}`);
  info(`  ${'─'.repeat(70)}`);
  for (const row of rows) {
    info(`  ${pad(row.name, 24)}${padStart(row.usable, 10)}${padStart(row.perMonth ?? '–', 11)}${padStart(formatMoney(row.medianValueEur), 14)}${padStart(row.withDeadline, 11)}`);
  }

  const best = rows[0];
  const THRESHOLD = 30;
  info('');
  if (!best || best.usable < THRESHOLD) {
    warn(paint(`Abbruchkriterium erreicht.`, 'bold'));
    info(`  Bestes Gewerk: ${best?.name ?? '–'} mit ${best?.usable ?? 0} brauchbaren Ausschreibungen in ${days} Tagen.`);
    info(`  Schwelle war ${THRESHOLD}. Das Produkt traegt in dieser Form nicht - und das steht fest,`);
    info(`  bevor ein Cent fuer Briefe ausgegeben wurde. Naechster Schritt waere ein anderes Gewerk`);
    info(`  (neue Datei in config/niches/) oder die Zuschlags-Variante aus geschaeftsmodelle.md.`);
  } else {
    ok(paint(`${best.name} traegt: ${best.usable} brauchbare Ausschreibungen in ${days} Tagen (${best.perMonth}/Monat).`, 'bold'));
    info(`  Das ist die Nische fuer die Briefkampagne. Naechster Schritt:`);
    info(`    node bin/radar.js run --niche ${best.slug}`);
    info(`  Dann VERTRIEB.md, Abschnitt "60 Briefe".`);
  }
  if (fixture) info(paint('\n  Hinweis: Diese Zahlen stammen aus Testdaten, nicht aus TED.', 'yellow'));
  return 0;
}

// ----------------------------------------------------------------- run/render

async function writeOutputs(niche, store, freshAlerts, now) {
  const archive = archiveOf(store);
  const siteDir = join(SITE_DIR, niche.slug);
  await mkdir(siteDir, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  await writeFile(join(siteDir, 'index.html'), renderArchive(archive, niche, { now }), 'utf8');
  await writeFile(join(siteDir, 'ausschreibungen.csv'), renderCsv(archive), 'utf8');
  await writeFile(join(siteDir, 'ausschreibungen.json'), `${JSON.stringify(archive, null, 2)}\n`, 'utf8');

  const mail = renderMail(freshAlerts, niche, { now });
  await writeFile(join(OUT_DIR, `mail-${niche.slug}-${now.toISOString().slice(0, 10)}.html`), mail.html, 'utf8');
  return { siteDir, archive, mail };
}

async function cmdRun(args) {
  const slug = args.niche;
  if (!slug) return usage('run braucht --niche <slug>');
  const niche = await loadNiche(slug);
  const schema = await loadSchema();
  const now = new Date();
  const days = num(args.days, 30);

  info(paint(`\n${niche.name} - Lauf vom ${now.toISOString().slice(0, 10)}\n`, 'bold'));

  const { notices, stats, query } = await pipeline(niche, {
    days, fixture: Boolean(args.fixture), schema, now,
    limit: num(args.limit, 100), maxPages: num(args['max-pages'], 10),
  });
  info(`  Abfrage: ${query}`);
  info(`  ${stats.input} geladen · ${stats.noCpvMatch} ohne CPV-Treffer · ${stats.excluded} per Stichwort ausgeschlossen · ${stats.kept} passend`);
  if (stats.skipped) warn(`${stats.skipped} Datensaetze waren unbrauchbar und wurden verworfen.`);

  const store = await loadStore(slug);
  const fresh = diffAndRecord(store, notices, now);
  const removed = prune(store, { now });
  await saveStore(store);

  const freshAlerts = alertable(fresh, niche, now);
  const { siteDir, archive } = await writeOutputs(niche, store, freshAlerts, now);

  ok(`${fresh.length} neu, davon ${freshAlerts.length} im Alert · Archiv: ${archive.length}${removed ? ` · ${removed} alte entfernt` : ''}`);
  info(`  Archivseite: ${join(siteDir, 'index.html')}`);
  info(`  Alert-Mail:  ${OUT_DIR}/mail-${slug}-${now.toISOString().slice(0, 10)}.html`);
  return 0;
}

async function cmdRender(args) {
  const slug = args.niche;
  if (!slug) return usage('render braucht --niche <slug>');
  const niche = await loadNiche(slug);
  const now = new Date();

  let store = await loadStore(slug);
  // Ohne gespeicherten Zustand aus den Fixtures rendern, damit man das Ergebnis
  // ansehen kann, bevor ueberhaupt eine Verbindung zu TED bestand.
  if (Object.keys(store.notices).length === 0 || args.fixture) {
    const schema = await loadSchema();
    const { notices } = await pipeline(niche, { days: 3650, fixture: true, schema, now });
    store = { slug, firstSeen: {}, notices: {}, lastRun: null };
    diffAndRecord(store, notices, now);
    warn('Kein gespeicherter Zustand - es wird aus fixtures/ gerendert.');
  }

  const archive = archiveOf(store);
  const { siteDir } = await writeOutputs(niche, store, alertable(archive, niche, now).slice(0, 15), now);
  ok(`${archive.length} Ausschreibungen gerendert nach ${siteDir}/`);
  return 0;
}

// ---------------------------------------------------------------------- send

async function cmdSend(args) {
  const slug = args.niche;
  if (!slug) return usage('send braucht --niche <slug>');
  const niche = await loadNiche(slug);
  const now = new Date();
  const store = await loadStore(slug);

  const since = new Date(now.getTime() - num(args.since, 1) * 86400000).toISOString();
  const fresh = archiveOf(store).filter((notice) => (store.firstSeen[notice.id] ?? '') >= since);
  const selection = alertable(fresh, niche, now);

  const recipients = await loadSubscribers(slug);
  const transport = pickTransport({ dryRun: Boolean(args['dry-run']) });
  const mail = renderMail(selection, niche, { now, archiveUrl: args['archive-url'] ?? null });

  if (transport.name === 'file') {
    warn(`Dry-Run (Transport "file"): es wird nichts verschickt.${process.env.RESEND_API_KEY ? '' : ' RESEND_API_KEY ist nicht gesetzt.'}`);
  }
  if (recipients.length === 0) warn('Keine Abonnenten in config/subscribers.json fuer diese Nische.');

  const result = await transport.send({ to: recipients, subject: mail.subject, html: mail.html, slug, now });
  if (result.delivered) ok(`Versendet an ${recipients.length} Empfaenger: "${mail.subject}"`);
  else ok(`Geschrieben nach ${result.path} - "${mail.subject}" (${selection.length} Ausschreibungen)`);
  return 0;
}

// ---------------------------------------------------------------------- main

function usage(message) {
  if (message) fail(message);
  console.log(`
${paint('Vergabe-Radar', 'bold')} - taegliche Alerts zu oeffentlichen Ausschreibungen

  node bin/radar.js doctor                    Konfiguration und TED-Verbindung pruefen
  node bin/radar.js scan   [--days 90]        Alle Gewerke vergleichen (Nischenwahl + Abbruchtest)
  node bin/radar.js run    --niche <slug>     Abrufen, filtern, speichern, rendern
  node bin/radar.js render --niche <slug>     Nur neu rendern, ohne Netz
  node bin/radar.js send   --niche <slug>     Alert verschicken (ohne Key: Dry-Run in out/)

  Flags: --days N  --limit N  --max-pages N  --fixture  --dry-run  --since N  --archive-url URL
`);
  return message ? 1 : 0;
}

const COMMANDS = { doctor: cmdDoctor, scan: cmdScan, run: cmdRun, render: cmdRender, send: cmdSend };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || args.help) return usage();
  const handler = COMMANDS[command];
  if (!handler) return usage(`Unbekannter Befehl "${command}".`);

  try {
    return await handler(args);
  } catch (err) {
    fail(err.message);
    const hint = explain(err);
    if (hint) info(`  ${paint('Was jetzt:', 'bold')} ${hint}`);
    if (err.detail) info(`  ${paint('Antwort von TED:', 'dim')} ${String(err.detail).slice(0, 600)}`);
    if (process.env.DEBUG) console.error(err);
    return 1;
  }
}

process.exitCode = await main();
