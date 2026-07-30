#!/usr/bin/env node
// Vergabe-Radar - CLI.
//
//   doctor                       Netz, API und Konfiguration pruefen
//   scan   [--days 90]           Alle Gewerke vergleichen -> Nischenauswahl und Abbruchtest
//   backfill --niche <slug>      Bestand rueckwirkend aufbauen, ohne Alerts
//   run    --niche <slug>        Abrufen, filtern, dedupen, speichern, Seite bauen
//   build-site                   Nur die Website neu erzeugen (offline)
//   send   --niche <slug>        Taeglicher Alert an Zahlende
//   digest --niche <slug>        Woechentlicher Gratis-Ueberblick an Bestaetigte
//   subscribers <unterbefehl>    Liste pflegen (add/confirm/remove/list/sync)
//   seo-report                   Qualitaet der erzeugten Seiten pruefen

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { styleText } from 'node:util';

import { fetchAll, fetchPage, buildQuery, istAbgeschnitten, TedError } from '../src/ted.js';
import { loadFixture } from '../src/fixtures.js';
import { normalizeAll, fieldReport } from '../src/normalize.js';
import { filterNotices, alertable, summarize } from '../src/filter.js';
import { loadNiche, loadAllNiches, loadSchema, loadSite, siteProblems, impressumProblems, anmeldeweg, listNicheSlugs } from '../src/config.js';
import { loadStore, saveStore, diffAndRecord, archiveOf, prune } from '../src/store.js';
import { renderMail, renderDigest, renderCsv, formatMoney } from '../src/render.js';
import { buildSite, publicArchive, publicGap, paths } from '../src/site.js';
import { pickTransport, OUT_DIR } from '../src/mail.js';
import * as subs from '../src/subscribers.js';

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

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

function explain(err) {
  if (!(err instanceof TedError)) return null;
  return {
    blocked: 'Ein Proxy oder eine Firewall blockiert ted.europa.eu. In einem Netz ohne Filter erneut versuchen, z. B. im GitHub-Actions-Workflow.',
    network: 'Keine Verbindung zu TED. Internetverbindung pruefen und erneut versuchen.',
    auth: 'TED weist die Anfrage ab. Falls ein TED_API_KEY gesetzt ist, diesen pruefen oder ganz weglassen - die Suche ist oeffentlich.',
    query: 'Ein Feldname in der Abfrage passt nicht zur API. Anpassen in config/ted-schema.json (ueberschreibt src/ted.js, ohne Codeaenderung). Die Originalmeldung unten nennt das Feld.',
    rate: 'TED drosselt. Spaeter erneut versuchen oder --limit senken.',
    server: 'TED hat ein Problem auf der eigenen Seite. Spaeter erneut versuchen.',
    parse: 'Die Antwort war kein gueltiges JSON - meist eine Wartungs- oder Fehlerseite.',
  }[err.kind] ?? null;
}

async function collect(niche, { days, fixture, schema, limit, maxPages, now }) {
  if (fixture) {
    const raw = await loadFixture(niche.slug, { now });
    return { raw, total: raw.length, query: '(Testdaten aus fixtures/)' };
  }
  const query = buildQuery(niche, { days, schema });
  const { notices, total } = await fetchAll({
    query, schema, limit, maxPages,
    onPage: ({ page, collected, total: t }) => info(`  Seite ${page}: ${collected}${t ? ` von ${t}` : ''} geladen`),
  });
  return { raw: notices, total, query };
}

async function pipeline(niche, options) {
  const { raw, total, query } = await collect(niche, options);
  const { notices: normalized, skipped } = normalizeAll(raw, options.schema);
  const { notices, stats } = filterNotices(normalized, niche, { now: options.now, maxAgeDays: options.days });
  return {
    notices,
    stats: { ...stats, skipped, apiTotal: total, geholt: raw.length, abgeschnitten: istAbgeschnitten(raw.length, total) },
    query,
  };
}

/** Meldet einen abgeschnittenen Abruf, sobald einer vorliegt. */
function warnAbgeschnitten(niche, stats) {
  if (!stats.abgeschnitten) return;
  warn(`${niche.name}: TED meldet ${stats.apiTotal} Treffer, geholt wurden ${stats.geholt}.`);
  info('    Der Seitendeckel hat zugeschlagen - das Archiv bekommt Loecher, die spaeter wie');
  info('    echte Datenlage aussehen. Mit hoeherem --max-pages erneut laufen lassen.');
}

/**
 * Fuer die Vorschau: Fuellt fehlende Pflichtangaben mit erkennbaren Platzhaltern,
 * damit man die Seite ansehen kann, bevor Gewerbeanmeldung und Impressum stehen.
 * Nur mit --demo, nie im Versandpfad - dort muessen die echten Angaben her.
 */
async function loadSiteForPreview(args) {
  const site = await loadSite();
  if (!args.demo) return site;

  const demo = {
    ...site,
    betreiber: site.betreiber || 'VORSCHAU',
    impressum: site.impressum || 'VORSCHAU – Platzhalter, vor dem Livegang in config/site.json ersetzen',
    kontaktEmail: site.kontaktEmail || 'vorschau@example.invalid',
  };
  warn('Vorschaumodus: fehlende Angaben aus config/site.json sind durch Platzhalter ersetzt.');
  return demo;
}

// ---------------------------------------------------------------- Mail-Helfer

/** Jeder Empfaenger braucht seinen eigenen Abmeldeweg - deshalb pro Token. */
function unsubscribeUrl(site, token) {
  if (site.subscribeEndpoint) return `${site.subscribeEndpoint}?abmelden=${encodeURIComponent(token)}`;
  if (site.kontaktEmail) return `mailto:${site.kontaktEmail}?subject=${encodeURIComponent(`Abmeldung ${token}`)}`;
  return null;
}

/**
 * Baut die Pflichtangaben fuer eine Mail.
 *
 * Die Strenge haengt daran, ob wirklich etwas rausgeht: Beim echten Versand
 * fehlt ohne Impressum und Abmeldeweg die Rechtsgrundlage, also wird
 * abgebrochen. Beim Dry-Run in eine Datei entsteht kein Empfaenger und kein
 * Risiko - dort wuerde ein harter Abbruch nur den taeglichen Lauf killen,
 * bevor er Daten geholt und die Seite gebaut hat.
 */
function mailContext(site, niche, token, { delivering = true } = {}) {
  const problems = siteProblems(site);
  if (problems.length && delivering) {
    throw new Error(`config/site.json ist unvollstaendig:\n  - ${problems.join('\n  - ')}`);
  }

  const PLATZHALTER = 'PLATZHALTER – vor dem ersten Versand impressum in config/site.json füllen';
  return {
    impressum: site.impressum || PLATZHALTER,
    unsubscribeUrl: unsubscribeUrl(site, token) ?? `mailto:abmeldung@example.invalid?subject=${encodeURIComponent(`Abmeldung ${token}`)}`,
    archiveUrl: site.baseUrl ? new URL(paths.archive(niche.slug), site.baseUrl).href : null,
    offerUrl: site.baseUrl ? new URL(paths.offer(niche.slug), site.baseUrl).href : null,
  };
}

// -------------------------------------------------------------------- doctor

/** Rohwert einer Bekanntmachung kurz und einzeilig, damit Formatfehler auffallen. */
function probe(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const einzeilig = String(text ?? '').replace(/\s+/g, ' ').trim();
  return einzeilig.length > 60 ? `${einzeilig.slice(0, 57)}…` : einzeilig;
}

async function cmdDoctor() {
  const schema = await loadSchema();
  const site = await loadSite();
  const slugs = await listNicheSlugs();

  info(paint('\nKonfiguration', 'bold'));
  if (slugs.length === 0) return fail('Keine Nischen in config/niches/ gefunden.'), 1;
  for (const slug of slugs) {
    const niche = await loadNiche(slug);
    ok(`${slug}: ${niche.cpv.length} CPV-Codes, ${niche.cpvPrefixes?.length ?? 0} Praefixe, ${niche.publicDelayHours ?? 48} h Verzoegerung`);
  }

  const problems = siteProblems(site);
  if (problems.length) {
    warn('config/site.json ist noch unvollstaendig:');
    problems.forEach((problem) => info(`    ${problem}`));
  } else ok('config/site.json vollstaendig.');

  const impressum = impressumProblems(site.impressum);
  if (impressum.length) {
    warn(`Impressum unvollstaendig ("${site.impressum ?? ''}"). Es fehlt:`);
    impressum.forEach((problem) => info(`    ${problem}`));
    info('    Ein unvollstaendiges Impressum ist ebenso abmahnfaehig wie ein fehlendes (Paragraf 5 DDG).');
  } else ok('Impressum enthaelt alle Pflichtangaben.');

  const weg = anmeldeweg(site);
  if (weg.aktiv) ok(`Anmeldeweg: ${weg.text}`);
  else {
    fail(`Anmeldeweg: ${weg.text}`);
    info('    Die Seiten werden taeglich gebaut und ausgeliefert, aber niemand kann etwas bestellen.');
    info('    Es genuegt kontaktEmail in config/site.json - subscribeEndpoint kann spaeter folgen.');
  }

  info(paint('\nTED-Schema', 'bold'));
  info(`  Endpunkt   ${schema.endpoint}`);
  info(`  Felder     ${Object.values(schema.fields).join(', ')}`);

  info(paint('\nVerbindung zu TED', 'bold'));
  const niche = await loadNiche(slugs[0]);
  const query = buildQuery(niche, { days: 7, schema });
  info(`  Testabfrage: ${query}`);

  try {
    // Stichprobe, nicht Einzelfall: bei einer Bekanntmachung sieht jedes
    // optionale Feld wie ein Konfigurationsfehler aus.
    const payload = await fetchPage({ query, schema, limit: 25, maxRetries: 1 });
    ok(`TED antwortet. Treffer: ${payload?.totalNoticeCount ?? payload?.total ?? '?'}`);

    const rows = fieldReport(payload?.notices ?? [], schema);
    const gepruefte = rows[0]?.total ?? 0;
    if (gepruefte === 0) {
      warn('Keine Bekanntmachungen in der Stichprobe - Felder nicht pruefbar.');
      return 0;
    }

    info(paint(`\nFelder (Stichprobe: ${gepruefte} Bekanntmachungen)`, 'bold'));
    for (const row of rows) {
      const label = `${row.key} -> "${row.api}"`.padEnd(34);
      if (row.delivered === 0) fail(`${label} kommt nie an`);
      else if (row.usable === 0) fail(`${label} kommt an, wird aber nicht verstanden  Beispiel: ${probe(row.sample)}`);
      else if (row.usable < row.delivered) warn(`${label} ${row.usable}/${row.delivered} verwertbar  Beispiel: ${probe(row.sample)}`);
      else ok(`${label} ${row.delivered}/${gepruefte}`);
    }

    const kaputt = rows.filter((row) => row.delivered === 0 || row.usable === 0);
    if (kaputt.length) {
      info('');
      warn('"kommt nie an" heisst falscher Feldname - in config/ted-schema.json korrigieren.');
      warn('"nicht verstanden" heisst richtiger Name, aber unerwartetes Format - das gehoert in src/normalize.js.');
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
    const { notices, stats } = await pipeline(niche, {
      days, fixture, schema, now, limit: num(args.limit, 100), maxPages: num(args['max-pages'], 10),
    });
    const summary = summarize(notices, niche, { days, now });
    rows.push({ ...summary, stats });
    process.stdout.write(`${summary.usable} brauchbar von ${stats.geholt ?? stats.input} geholt`
      + `${stats.apiTotal != null ? ` (TED meldet ${stats.apiTotal})` : ''}\n`);

    // Die "brauchbar"-Zahl ist dann eine Stichprobe, keine Gesamtzahl. Wer das
    // uebersieht, plant den Backfill nach einer Zahl, die um ein Vielfaches
    // danebenliegt.
    if (stats.abgeschnitten) {
      warn(`    Stichprobe: hochgerechnet etwa ${Math.round(summary.usable * (stats.apiTotal / stats.geholt))} brauchbare bei vollem Abruf.`);
    }
  }

  rows.sort((a, b) => b.usable - a.usable);
  const pad = (t, w) => String(t).padEnd(w);
  const padS = (t, w) => String(t).padStart(w);
  info(`\n  ${pad('Gewerk', 24)}${padS('brauchbar', 10)}${padS('pro Monat', 11)}${padS('Median-Wert', 14)}${padS('mit Frist', 11)}`);
  info(`  ${'─'.repeat(70)}`);
  for (const row of rows) {
    info(`  ${pad(row.name, 24)}${padS(row.usable, 10)}${padS(row.perMonth ?? '–', 11)}${padS(formatMoney(row.medianValueEur), 14)}${padS(row.withDeadline, 11)}`);
  }

  const best = rows[0];
  const THRESHOLD = 30;
  info('');
  if (!best || best.usable < THRESHOLD) {
    warn(paint('Abbruchkriterium erreicht.', 'bold'));
    info(`  Bestes Gewerk: ${best?.name ?? '–'} mit ${best?.usable ?? 0} brauchbaren Ausschreibungen in ${days} Tagen (Schwelle ${THRESHOLD}).`);
    info('  Naechster Schritt waere ein anderes Gewerk (neue Datei in config/niches/)');
    info('  oder die Zuschlags-Variante aus geschaeftsmodelle.md.');
  } else {
    ok(paint(`${best.name} traegt: ${best.usable} brauchbare Ausschreibungen in ${days} Tagen (${best.perMonth}/Monat).`, 'bold'));
    info(`  Naechster Schritt:  node bin/radar.js backfill --niche ${best.slug} --days 365`);
  }
  if (fixture) info(paint('\n  Hinweis: Diese Zahlen stammen aus Testdaten, nicht aus TED.', 'yellow'));
  return 0;
}

// ------------------------------------------------------------------ backfill

/**
 * Welche Gewerke ein Befehl bearbeitet.
 *
 * Ohne --niche (oder mit "alle") sind es alle. Das ist der Normalfall im
 * taeglichen Lauf: Ein einzelnes Gewerk zu holen hiesse, die uebrigen drei
 * veralten zu lassen, waehrend ihre Seiten weiter ausgeliefert werden.
 */
async function nichesFromArgs(args) {
  const slug = args.niche;
  if (!slug || slug === 'alle') return loadAllNiches();
  return [await loadNiche(slug)];
}

async function cmdBackfill(args) {
  const niches = await nichesFromArgs(args);
  const schema = await loadSchema();
  const now = new Date();
  const days = num(args.days, 365);

  info(paint(`\nBestand der letzten ${days} Tage aufbauen (${niches.map((n) => n.name).join(', ')})\n`, 'bold'));
  info('  Ohne Bestand gibt es nichts zu indexieren und keine Auftraggeber-Historie.');
  info('  Dieser Lauf loest bewusst KEINE Alerts aus.\n');

  for (const niche of niches) {
    info(paint(`  ${niche.name}`, 'bold'));
    const { notices, stats } = await pipeline(niche, {
      days, fixture: Boolean(args.fixture), schema, now,
      limit: num(args.limit, 100), maxPages: num(args['max-pages'], 200),
    });

    const store = await loadStore(niche.slug);
    const fresh = diffAndRecord(store, notices, now);
    prune(store, { keepDays: niche.archiveKeepDays ?? 1100, now });
    await saveStore(store);

    info(`  ${stats.input} geladen · ${stats.noCpvMatch} ohne CPV-Treffer · ${stats.excluded} ausgeschlossen`);
    warnAbgeschnitten(niche, stats);
    ok(`${fresh.length} neu aufgenommen · Archiv jetzt ${Object.keys(store.notices).length}\n`);
  }

  info(`  Weiter mit:  node bin/radar.js build-site`);
  return 0;
}

// ----------------------------------------------------------------- run/site

async function loadAllArchives({ now, days = 90 }) {
  const niches = await loadAllNiches();
  const data = [];
  for (const niche of niches) {
    const store = await loadStore(niche.slug);
    const archive = archiveOf(store);
    data.push({ niche, archive, summary: summarize(archive, niche, { days, now }) });
  }
  return data;
}

async function writeSite(site, now, { days = 90 } = {}) {
  const data = await loadAllArchives({ now, days });
  const { files, sitemap } = buildSite(data, site, { now });

  await rm(SITE_DIR, { recursive: true, force: true });
  for (const file of files) {
    const target = join(SITE_DIR, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }

  // Exporte je Nische bleiben erhalten - sie sind Teil des Nutzens.
  for (const { niche, archive } of data) {
    const shown = publicArchive(archive, niche, now);
    await writeFile(join(SITE_DIR, niche.slug, 'ausschreibungen.csv'), renderCsv(shown), 'utf8');
    await writeFile(join(SITE_DIR, niche.slug, 'ausschreibungen.json'), `${JSON.stringify(shown, null, 2)}\n`, 'utf8');
  }

  return { files, sitemap, data };
}

async function cmdBuildSite(args) {
  const site = await loadSiteForPreview(args);
  const now = new Date();
  const { files, sitemap, data } = await writeSite(site, now);

  ok(`${files.length} Dateien nach ${SITE_DIR}/ geschrieben, ${sitemap.length} davon in der Sitemap.`);

  // Ohne Veroeffentlichungsdatum greift die Freemium-Sperre nicht. Das darf
  // nicht still passieren - sonst ist das Bezahlprodukt verschenkt.
  for (const { niche, archive } of data) {
    const luecke = publicGap(archive);
    if (luecke.kritisch) {
      warn(`${niche.name}: ${luecke.ohneDatum} von ${luecke.total} Ausschreibungen ohne Veroeffentlichungsdatum `
        + `(${Math.round(luecke.anteil * 100)} %) - die ${niche.publicDelayHours ?? 48}-Stunden-Sperre greift dort nicht.`);
      info('    Ursache ist meist ein falscher Feldname. "node bin/radar.js doctor" nennt ihn.');
    }
  }
  if (!site.baseUrl) warn('Ohne baseUrl in config/site.json wurde keine sitemap.xml erzeugt.');
  info(`  Ansehen mit:  node bin/radar.js serve${args.demo ? ' --demo' : ''}`);

  const impressum = impressumProblems(site.impressum);
  if (impressum.length) {
    warn(`Impressum unvollstaendig - es fehlt: ${impressum.join('; ')}`);
  }
  if (args.verbose) files.slice(0, 20).forEach((file) => info(`    ${file.path}`));
  return 0;
}

async function cmdRun(args) {
  const niches = await nichesFromArgs(args);
  const schema = await loadSchema();
  const site = await loadSite();
  const now = new Date();
  const days = num(args.days, 30);

  info(paint(`\nLauf vom ${now.toISOString().slice(0, 10)}\n`, 'bold'));

  for (const niche of niches) {
    info(paint(`  ${niche.name}`, 'bold'));
    // Der Deckel ist eine Obergrenze, keine Kosten: fetchAll hoert auf, sobald
    // eine Seite nicht mehr voll ist. Grosszuegig heisst also nur "faellt nicht
    // in eine Falle", nicht "laedt unnoetig". Elektro/SHK liefert rund 1200
    // Bekanntmachungen im Monat - bei den vorherigen 2000 waere schon ein
    // lebhafter Monat abgeschnitten worden.
    const { notices, stats, query } = await pipeline(niche, {
      days, fixture: Boolean(args.fixture), schema, now,
      limit: num(args.limit, 100), maxPages: num(args['max-pages'], 60),
    });
    info(`  Abfrage: ${query}`);
    info(`  ${stats.input} geladen · ${stats.noCpvMatch} ohne CPV-Treffer · ${stats.excluded} ausgeschlossen · ${stats.kept} passend`);
    if (stats.skipped) warn(`${stats.skipped} Datensaetze waren unbrauchbar und wurden verworfen.`);
    warnAbgeschnitten(niche, stats);

    const store = await loadStore(niche.slug);
    const fresh = diffAndRecord(store, notices, now);
    const removed = prune(store, { keepDays: niche.archiveKeepDays ?? 1100, now });
    await saveStore(store);
    ok(`${fresh.length} neu · Archiv ${Object.keys(store.notices).length}${removed ? ` · ${removed} entfernt` : ''}\n`);
  }

  // Genau einmal, nicht je Gewerk: writeSite baut ohnehin alle Gewerke aus
  // ihren Zustandsdateien. Innerhalb der Schleife waere es derselbe Bau von
  // zigtausend Seiten, viermal hintereinander.
  const { files } = await writeSite(site, now);
  ok(`${files.length} Seiten erzeugt`);
  return 0;
}

// ------------------------------------------------------------- send / digest

async function deliver({ slug, plan, build, since, dryRun, label }) {
  const niche = await loadNiche(slug);
  const site = await loadSite();
  const now = new Date();
  const store = await loadStore(slug);

  const all = await subs.loadAll();
  const recipients = subs.activeOf(all, slug, plan);
  const transport = pickTransport({ dryRun });

  const cutoff = new Date(now.getTime() - since * 86400000).toISOString();
  const archive = archiveOf(store);
  const pool = plan === subs.PLAN.FREE ? publicArchive(archive, niche, now) : archive;
  const fresh = pool.filter((notice) => (store.firstSeen[notice.id] ?? '') >= cutoff);
  const selection = alertable(fresh, niche, now);

  if (transport.name === 'file') {
    warn(`Dry-Run (Transport "file"): es wird nichts verschickt.${process.env.RESEND_API_KEY ? '' : ' RESEND_API_KEY ist nicht gesetzt.'}`);
    const offen = siteProblems(site);
    if (offen.length) {
      warn('Vor dem ersten echten Versand noch zu erledigen:');
      offen.forEach((problem) => info(`    ${problem}`));
    }
    const context = mailContext(site, niche, 'VORSCHAU-TOKEN', { delivering: false });
    const mail = build(selection, niche, { now, ...context });
    const result = await transport.send({ to: [], subject: mail.subject, html: mail.html, slug, now });
    ok(`${label} als Vorschau nach ${result.path} (${selection.length} Ausschreibungen, ${recipients.length} Empfaenger vorgemerkt)`);
    return 0;
  }

  if (recipients.length === 0) {
    warn(`Keine bestaetigten Empfaenger fuer "${slug}" (${plan}). Es wird nichts verschickt.`);
    return 0;
  }

  // Einzelversand statt bcc: Jeder Empfaenger braucht seinen eigenen
  // Abmeldelink, sonst meldet ein Klick alle anderen mit ab.
  let sent = 0;
  for (const entry of recipients) {
    const context = mailContext(site, niche, entry.token);
    const mail = build(selection, niche, { now, ...context });
    await transport.send({ to: [entry.email], subject: mail.subject, html: mail.html, slug, now });
    sent += 1;
  }
  ok(`${label} an ${sent} Empfaenger verschickt (${selection.length} Ausschreibungen)`);
  return 0;
}

/**
 * Versand ueber alle betroffenen Gewerke. Ein Fehlschlag bei einem Gewerk darf
 * die uebrigen nicht verschlucken - sonst haengt der Versand an drei
 * Empfaengern, weil beim vierten etwas klemmte.
 */
async function deliverAll(args, { plan, build, since, label }) {
  const niches = await nichesFromArgs(args);
  let code = 0;
  for (const niche of niches) {
    const result = await deliver({
      slug: niche.slug, plan, build,
      since: num(args.since, since), dryRun: Boolean(args['dry-run']), label,
    });
    if (result !== 0) code = result;
  }
  return code;
}

const cmdSend = (args) =>
  deliverAll(args, { plan: subs.PLAN.PAID, build: renderMail, since: 1, label: 'Alert' });

const cmdDigest = (args) =>
  deliverAll(args, { plan: subs.PLAN.FREE, build: renderDigest, since: 7, label: 'Wochenueberblick' });

// ----------------------------------------------------------- subscribers

async function cmdSubscribers(args) {
  const action = args._[1];
  const all = await subs.loadAll();
  const slug = args.niche;

  if (action === 'list' || !action) {
    info(paint('\nAbonnenten\n', 'bold'));
    const rows = subs.stats(all);
    if (rows.length === 0) return info('  (keine Eintraege)'), 0;
    info(`  ${'Nische'.padEnd(22)}${'aktiv'.padStart(8)}${'davon zahlend'.padStart(15)}${'wartend'.padStart(9)}${'abgemeldet'.padStart(12)}`);
    info(`  ${'─'.repeat(66)}`);
    for (const row of rows) {
      info(`  ${row.slug.padEnd(22)}${String(row.aktiv).padStart(8)}${String(row.zahlend).padStart(15)}${String(row.wartend).padStart(9)}${String(row.abgemeldet).padStart(12)}`);
    }
    if (args.detail && slug) {
      info('');
      for (const entry of all[slug] ?? []) {
        info(`  ${entry.email.padEnd(34)} ${entry.status.padEnd(24)} ${entry.plan}  ${entry.bestaetigt ?? '–'}`);
      }
    }
    return 0;
  }

  if (action === 'sync') {
    // Holt den Stand aus dem Worker ins Repo. Der Einwilligungsnachweis gehoert
    // versioniert ins Git und nicht allein in einen Key-Value-Speicher.
    const from = args.from ?? process.env.SUBSCRIBE_EXPORT_URL;
    const key = args.key ?? process.env.EXPORT_KEY;
    if (!from || !key) return usage('subscribers sync braucht --from <url> und --key <schluessel> (oder SUBSCRIBE_EXPORT_URL / EXPORT_KEY)');

    const response = await fetch(`${from}?key=${encodeURIComponent(key)}`);
    if (!response.ok) throw new Error(`Export nicht abrufbar (HTTP ${response.status}).`);
    const remote = await response.json();

    let added = 0;
    let updated = 0;
    for (const [remoteSlug, list] of Object.entries(remote)) {
      all[remoteSlug] ??= [];
      for (const raw of list) {
        const entry = subs.migrateEntry(raw, remoteSlug);
        if (!entry) continue;
        const local = subs.findEntry(all, remoteSlug, entry.email);
        if (!local) {
          all[remoteSlug].push(entry);
          added += 1;
        } else if (JSON.stringify(local) !== JSON.stringify({ ...local, ...entry })) {
          Object.assign(local, entry);
          updated += 1;
        }
      }
    }
    await subs.saveAll(all);
    ok(`${added} neu, ${updated} aktualisiert. Nicht vergessen: config/subscribers.json committen.`);
    return 0;
  }

  if (!slug) return usage(`subscribers ${action} braucht --niche <slug>`);

  if (action === 'add') {
    if (!args.email) return usage('subscribers add braucht --email');
    const plan = args.plan === 'digest' ? subs.PLAN.FREE : subs.PLAN.PAID;
    const { entry } = subs.addPending(all, slug, { email: args.email, quelle: args.quelle ?? 'manuell über CLI', plan });
    await subs.saveAll(all);
    ok(`${entry.email} vorgemerkt (${entry.status}).`);
    info(`  Token: ${entry.token}`);
    info('  Erst nach "subscribers confirm" geht Post an diese Adresse.');
    return 0;
  }

  if (action === 'confirm') {
    if (!args.email) return usage('subscribers confirm braucht --email');
    const kanal = args.kanal ?? 'web';
    const entry = subs.confirm(all, slug, { email: args.email, token: args.token, kanal, notiz: args.notiz });
    await subs.saveAll(all);
    ok(`${entry.email} bestaetigt am ${entry.bestaetigt} (Kanal: ${entry.kanal}).`);
    return 0;
  }

  if (action === 'remove') {
    if (!args.email) return usage('subscribers remove braucht --email');
    const entry = subs.remove(all, slug, args.email);
    await subs.saveAll(all);
    return entry ? (ok(`${entry.email} abgemeldet.`), 0) : (warn('Adresse war nicht in der Liste.'), 0);
  }

  return usage(`Unbekannter Unterbefehl "${action}". Erlaubt: add, confirm, remove, list, sync.`);
}

// ---------------------------------------------------------------------- serve

/**
 * Vorschau-Server. Noetig, weil die Seiten absolute Links verwenden - per
 * Doppelklick aus dem Dateimanager (file://) wuerde die Navigation ins Leere
 * laufen. Haengt die Seite unter denselben Basispfad wie spaeter im Betrieb,
 * damit die Vorschau ehrlich ist.
 */
async function cmdServe(args) {
  const { createServer } = await import('node:http');
  const { readFile: read, stat } = await import('node:fs/promises');
  const { extname, normalize, resolve } = await import('node:path');

  const site = await loadSiteForPreview(args);
  const port = num(args.port, 8080);
  let basePath = '';
  try {
    if (site.baseUrl) basePath = new URL(site.baseUrl).pathname.replace(/\/+$/, '');
  } catch { basePath = ''; }

  const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
  };
  const root = resolve(SITE_DIR);

  try {
    await stat(join(SITE_DIR, 'index.html'));
  } catch {
    fail(`${SITE_DIR}/index.html fehlt. Erst "node bin/radar.js build-site" laufen lassen.`);
    return 1;
  }

  const server = createServer(async (request, response) => {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (basePath && path.startsWith(basePath)) path = path.slice(basePath.length);
    if (path.endsWith('/')) path += 'index.html';

    // Kein Ausbruch aus site/ ueber ".." - auch eine Vorschau liest nur, was sie soll.
    const target = resolve(root, `.${normalize(path)}`);
    if (!target.startsWith(root)) {
      response.writeHead(403).end('Verboten');
      return;
    }

    try {
      const body = await read(target);
      response.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' }).end(body);
    } catch {
      const notFound = await read(join(root, '404.html')).catch(() => 'Nicht gefunden');
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end(notFound);
    }
  });

  await new Promise((done) => server.listen(port, done));
  ok(`Vorschau laeuft: ${paint(`http://localhost:${port}${basePath}/`, 'bold')}`);
  info('  Beenden mit Strg+C.');
  return new Promise(() => {}); // laeuft, bis der Benutzer abbricht
}

// ----------------------------------------------------------------- seo-report

async function cmdSeoReport() {
  const site = await loadSite();
  const now = new Date();
  const { files, sitemap } = buildSite(await loadAllArchives({ now }), site, { now });

  const html = files.filter((file) => file.path.endsWith('.html'));
  const withNote = html.filter((file) => file.content.includes('class="note"'));
  const thin = html.filter((file) => file.content.length < 2500);
  const links = html.map((file) => (file.content.match(/href="\//g) ?? []).length);
  const noDescription = html.filter((file) => !/name="description" content="[^"]{20,}"/.test(file.content));

  info(paint('\nSEO-Bericht\n', 'bold'));
  info(`  Seiten insgesamt          ${html.length}`);
  // Ohne baseUrl wird gar keine sitemap.xml geschrieben - dann waere jede Zahl
  // hier eine Behauptung ueber eine Datei, die es nicht gibt.
  info(`  davon in der Sitemap      ${site.baseUrl ? sitemap.length : '– (keine Sitemap ohne baseUrl)'}`);
  info(`  mit Anreicherungsabsatz   ${withNote.length}  (${Math.round((withNote.length / Math.max(1, html.length)) * 100)} %)`);
  info(`  duenn (< 2.500 Zeichen)   ${thin.length}`);
  info(`  ohne brauchbare Beschreibung  ${noDescription.length}`);
  info(`  interne Links je Seite    ${links.length ? (links.reduce((a, b) => a + b, 0) / links.length).toFixed(1) : 0} im Schnitt`);

  info('');
  if (!site.baseUrl) warn('Ohne baseUrl gibt es keine Sitemap - und ohne Sitemap keine Indexierung.');
  if (noDescription.length) warn(`${noDescription.length} Seiten haben keine brauchbare Beschreibung.`);
  if (thin.length > html.length * 0.5) {
    warn('Mehr als die Haelfte der Seiten ist duenn. Ein Archiv mit wenig Bestand liefert wenig');
    info('  Anreicherung - erst backfill laufen lassen, dann erneut pruefen.');
  }
  info(paint('  Abbruchkriterium:', 'bold'));
  info('  Sind nach 90 Tagen laut Search Console weniger als 20 % der eingereichten Seiten');
  info('  indexiert, rankt diese Seite nicht. Dann ist der Kanal tot, unabhaengig vom Aufwand.');
  return 0;
}

// ---------------------------------------------------------------------- main

function usage(message) {
  if (message) fail(message);
  console.log(`
${paint('Vergabe-Radar', 'bold')} - oeffentliche Ausschreibungen als Abo

  node bin/radar.js doctor                     Konfiguration und TED-Verbindung pruefen
  node bin/radar.js scan   [--days 90]         Alle Gewerke vergleichen
  node bin/radar.js backfill [--niche <slug>]  Bestand rueckwirkend aufbauen (keine Alerts)
  node bin/radar.js run    [--niche <slug>]    Taeglicher Lauf + Seitenbau
  node bin/radar.js build-site                 Nur die Website neu erzeugen
  node bin/radar.js serve  [--port 8080]       Vorschau im Browser ansehen
  node bin/radar.js send   [--niche <slug>]    Taeglicher Alert an Zahlende
  node bin/radar.js digest [--niche <slug>]    Woechentlicher Gratis-Ueberblick

  Ohne --niche laufen backfill, run, send und digest ueber alle Gewerke.
  node bin/radar.js subscribers list|add|confirm|remove|sync
  node bin/radar.js seo-report                 Qualitaet der erzeugten Seiten

  Flags: --days N --limit N --max-pages N --fixture --demo --dry-run --since N --port N
         --email … --token … --plan alert|digest --kanal web|telefon --notiz …
`);
  return message ? 1 : 0;
}

const COMMANDS = {
  doctor: cmdDoctor, scan: cmdScan, backfill: cmdBackfill, run: cmdRun,
  'build-site': cmdBuildSite, serve: cmdServe, send: cmdSend, digest: cmdDigest,
  subscribers: cmdSubscribers, 'seo-report': cmdSeoReport,
};

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
