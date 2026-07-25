import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAll } from '../src/normalize.js';
import { filterNotices, summarize } from '../src/filter.js';
import { loadFixture } from '../src/fixtures.js';
import { loadNiche } from '../src/config.js';
import {
  slugify, bundeslandOf, buyerProfile, regionStats, priceBand, similarNotices,
  buyerNarrative, priceNarrative, groupByBuyer, groupByRegion,
} from '../src/insights.js';
import { buildSite, publicArchive, paths, renderSitemap, renderRobots, linker, PAGE_SIZE } from '../src/site.js';
import * as subs from '../src/subscribers.js';
import { archiveOf } from '../src/store.js';

const NOW = new Date('2026-07-25T09:00:00Z');
const niche = await loadNiche('gebaeudereinigung');
const archive = filterNotices(
  normalizeAll(await loadFixture('gebaeudereinigung', { now: NOW })).notices,
  niche,
  { now: NOW },
).notices;

const SITE = {
  baseUrl: 'https://vergabe-radar.test',
  betreiber: 'Max Muster',
  impressum: 'Max Muster · Musterweg 1 · 12345 Musterstadt',
  kontaktEmail: 'kontakt@vergabe-radar.test',
  subscribeEndpoint: null,
  stripeLinks: { gebaeudereinigung: 'https://buy.stripe.test/abc' },
};

// ------------------------------------------------------------------ insights

test('slugify erzeugt stabile, URL-taugliche Bezeichner mit Umlautbehandlung', () => {
  assert.equal(slugify('Stadt Bochum, Zentrale Vergabestelle'), 'stadt-bochum-zentrale-vergabestelle');
  assert.equal(slugify('Universität Leipzig'), 'universitaet-leipzig');
  assert.equal(slugify('Groß & Klein GmbH'), 'gross-klein-gmbh');
  assert.equal(slugify(''), 'unbekannt');
  assert.equal(slugify(null), 'unbekannt');
});

test('bundeslandOf erkennt das Land aus dem NUTS-Code', () => {
  assert.equal(bundeslandOf({ nuts: ['DEA51'] }), 'DEA');
  assert.equal(bundeslandOf({ nuts: ['DE254'] }), 'DE2');
  assert.equal(bundeslandOf({ nuts: [] }), null);
  assert.equal(bundeslandOf({ nuts: ['AT130'] }), null, 'Oesterreich ist kein Bundesland');
});

test('buyerProfile fasst die Vergaben eines Auftraggebers zusammen', () => {
  const profile = buyerProfile(archive, 'Bundesanstalt für Immobilienaufgaben');
  assert.ok(profile);
  assert.equal(profile.count, 1);
  assert.equal(profile.slug, 'bundesanstalt-fuer-immobilienaufgaben');
  assert.equal(buyerProfile(archive, 'Gibt Es Nicht'), null);
});

test('buyerProfile rechnet den Vergaberhythmus aus mehreren Vergaben aus', () => {
  const synthetic = [
    { id: 'a', buyer: 'Stadt X', publishedAt: '2026-01-01T00:00:00Z', valueEur: 100000, cpv: ['90911200'], nuts: [] },
    { id: 'b', buyer: 'Stadt X', publishedAt: '2026-04-01T00:00:00Z', valueEur: 300000, cpv: ['90911200'], nuts: [] },
    { id: 'c', buyer: 'Stadt X', publishedAt: '2026-07-01T00:00:00Z', valueEur: 200000, cpv: ['90911200'], nuts: [] },
  ];
  const profile = buyerProfile(synthetic, 'Stadt X');
  assert.equal(profile.count, 3);
  assert.equal(profile.totalEur, 600000);
  assert.equal(profile.medianEur, 200000);
  assert.ok(profile.avgIntervalDays >= 88 && profile.avgIntervalDays <= 92, `${profile.avgIntervalDays}`);
  assert.match(buyerNarrative(profile), /Stadt X hat seit 2026 3 Aufträge/);
  assert.match(buyerNarrative(profile), /vierteljährlich/);
});

test('buyerNarrative schweigt bei einer einzigen Vergabe', () => {
  // Aus einem Datenpunkt laesst sich kein Muster ableiten. Eine Aussage waere
  // hier erfunden, nicht abgeleitet.
  const profile = buyerProfile(archive, 'Stadt Kassel');
  assert.equal(profile.count, 1);
  assert.equal(buyerNarrative(profile), null);
});

test('priceBand ordnet nur ein, wenn es genug Vergleichswerte gibt', () => {
  const notice = archive.find((n) => n.valueEur != null);
  assert.equal(priceBand(archive, notice, { minComparable: 99 }), null, 'zu wenig Vergleich = keine Aussage');

  const band = priceBand(archive, notice, { minComparable: 3 });
  if (band) {
    assert.ok(band.percentile >= 0 && band.percentile <= 100);
    assert.match(band.band, /Drittel$/);
    assert.match(priceNarrative(band, notice), /liegt dieser Auftrag im/);
  }
});

test('priceBand schweigt bei fehlendem Auftragswert', () => {
  assert.equal(priceBand(archive, { id: 'x', valueEur: null, cpv: ['90911200'] }), null);
});

test('similarNotices bevorzugt denselben Auftraggeber, dann Gewerk und Region', () => {
  const notice = archive[0];
  const similar = similarNotices(archive, notice, { limit: 5 });
  assert.ok(similar.length > 0);
  assert.ok(!similar.some((entry) => entry.id === notice.id), 'nie sich selbst vorschlagen');
});

test('groupByBuyer und groupByRegion ignorieren Datensaetze ohne Angabe', () => {
  const buyers = groupByBuyer([...archive, { id: 'z', buyer: null, cpv: [], nuts: [] }]);
  assert.ok(!buyers.has('unbekannt'));
  const regions = groupByRegion([{ id: 'z', nuts: [], cpv: [] }]);
  assert.equal(regions.size, 0);
});

test('regionStats liefert Volumen und die aktivsten Auftraggeber', () => {
  const code = bundeslandOf(archive.find((n) => bundeslandOf(n)));
  const stats = regionStats(archive, code);
  assert.ok(stats.count > 0);
  assert.ok(Array.isArray(stats.topBuyers));
  assert.equal(regionStats(archive, 'DEZ'), null);
});

// ---------------------------------------------------------------------- site

test('publicArchive haelt die juengsten Ausschreibungen zurueck', () => {
  // Das ist die Freemium-Grenze: Zahlende sehen sofort, das offene Archiv
  // 48 Stunden spaeter.
  const frisch = { id: 'neu', publishedAt: new Date(NOW.getTime() - 3600000).toISOString(), cpv: [], nuts: [] };
  const alt = { id: 'alt', publishedAt: new Date(NOW.getTime() - 5 * 86400000).toISOString(), cpv: [], nuts: [] };
  const shown = publicArchive([frisch, alt], { publicDelayHours: 48 }, NOW);
  assert.deepEqual(shown.map((n) => n.id), ['alt']);

  const ohneVerzoegerung = publicArchive([frisch, alt], { publicDelayHours: 0 }, NOW);
  assert.equal(ohneVerzoegerung.length, 2);
});

const built = buildSite(
  [{ niche, archive, summary: summarize(archive, niche, { days: 90, now: NOW }) }],
  SITE,
  { now: NOW },
);

test('buildSite erzeugt alle vorgesehenen Seitentypen', () => {
  const paths_ = built.files.map((file) => file.path);
  assert.ok(paths_.includes('index.html'));
  assert.ok(paths_.includes('404.html'));
  assert.ok(paths_.includes('robots.txt'));
  assert.ok(paths_.includes('sitemap.xml'));
  assert.ok(paths_.includes(paths.niche(niche.slug)));
  assert.ok(paths_.includes(paths.offer(niche.slug)));
  assert.ok(paths_.includes(paths.archive(niche.slug)));
  assert.ok(paths_.some((path) => path.startsWith(`${niche.slug}/a/`)), 'Detailseiten');
  assert.ok(paths_.some((path) => path.startsWith(`${niche.slug}/auftraggeber/`)), 'Auftraggeberseiten');
  assert.ok(paths_.some((path) => path.startsWith(`${niche.slug}/region/`)), 'Regionsseiten');
});

test('aus einer Seite sind viele geworden', () => {
  const visible = publicArchive(archive, niche, NOW);
  const detail = built.files.filter((file) => file.path.startsWith(`${niche.slug}/a/`));
  assert.equal(detail.length, visible.length);
  assert.ok(built.files.length > visible.length + 5);
});

test('jede HTML-Seite hat Titel und Beschreibung', () => {
  for (const file of built.files.filter((entry) => entry.path.endsWith('.html'))) {
    assert.match(file.content, /<title>[^<]{10,}<\/title>/, `Titel fehlt: ${file.path}`);
    assert.match(file.content, /name="description" content="[^"]{20,}"/, `Beschreibung fehlt: ${file.path}`);
  }
});

test('die Sitemap enthaelt jede Adresse genau einmal und keine Rauschseiten', () => {
  const locs = [...built.files.find((file) => file.path === 'sitemap.xml').content.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, locs.length, 'keine Dubletten');
  assert.equal(locs.length, built.sitemap.length);
  assert.ok(!locs.some((loc) => loc.endsWith('/404.html')), '404 gehoert nicht in die Sitemap');
  for (const loc of locs) assert.ok(loc.startsWith(SITE.baseUrl), loc);
});

test('renderSitemap verweigert relative Adressen', () => {
  assert.throws(() => renderSitemap([{ path: 'a.html' }], null), /baseUrl/);
});

test('robots.txt verweist auf die Sitemap', () => {
  assert.match(renderRobots(SITE.baseUrl), /Sitemap: https:\/\/vergabe-radar\.test\/sitemap\.xml/);
  assert.doesNotMatch(renderRobots(null), /Sitemap:/);
});

test('die Detailseite traegt den abgeleiteten Mehrwert und interne Links', () => {
  const page = built.files.find((file) => file.path.startsWith(`${niche.slug}/a/`));
  assert.match(page.content, /class="note"/, 'Anreicherungsblock oder Anmeldeblock fehlt');
  assert.match(page.content, /href="\/gebaeudereinigung\//, 'keine interne Verlinkung');
  assert.match(page.content, /BreadcrumbList/, 'kein strukturiertes Datenobjekt');
});

test('die Landingpage nennt Preis, Beleg und Zahlungsweg', () => {
  const page = built.files.find((file) => file.path === paths.offer(niche.slug)).content;
  assert.match(page, /79 € im Monat/);
  assert.match(page, /erste Monat kostet 1 €/);
  assert.ok(page.includes(SITE.stripeLinks.gebaeudereinigung));
  assert.match(page, /data-utm/, 'ohne UTM-Durchreichung ist die Kampagne nicht messbar');
});

test('die 404-Seite wird nicht indexiert', () => {
  const page = built.files.find((file) => file.path === '404.html').content;
  assert.match(page, /name="robots" content="noindex/);
});

test('Fremddaten werden auf jeder erzeugten Seite maskiert', () => {
  const evil = {
    id: '<script>x</script>', title: '<img src=x onerror=alert(1)>', buyer: '"><script>y</script>',
    buyerCity: 'X', cpv: ['90911200'], matchedCpv: ['90911200'], nuts: ['DEA51'],
    publishedAt: NOW.toISOString(), deadline: null, valueEur: 1000, url: 'https://e.test', score: 90,
  };
  const result = buildSite(
    [{ niche, archive: [evil], summary: summarize([evil], niche, { days: 90, now: NOW }) }],
    SITE, { now: NOW },
  );
  for (const file of result.files.filter((entry) => entry.path.endsWith('.html'))) {
    assert.ok(!file.content.includes('<img src=x'), `unmaskiert in ${file.path}`);
    assert.ok(!file.content.includes('<script>x</script>'), `unmaskiert in ${file.path}`);
    assert.ok(!file.content.includes('<script>y</script>'), `unmaskiert in ${file.path}`);
  }
  // Auch der Dateiname darf keine Sonderzeichen aus Fremddaten uebernehmen.
  assert.ok(result.files.every((file) => /^[A-Za-z0-9._\-/]+$/.test(file.path)), 'unsicherer Pfad');
});

test('das Archiv wird ab PAGE_SIZE paginiert', () => {
  const many = Array.from({ length: PAGE_SIZE + 5 }, (_, index) => ({
    id: `n${index}`, title: `Ausschreibung ${index}`, buyer: 'Stadt Y', buyerCity: 'Y',
    cpv: ['90911200'], matchedCpv: ['90911200'], nuts: ['DEA51'], valueEur: 100000 + index,
    publishedAt: new Date(NOW.getTime() - (index + 5) * 86400000).toISOString(), deadline: null, score: 80,
  }));
  const result = buildSite(
    [{ niche, archive: many, summary: summarize(many, niche, { days: 90, now: NOW }) }],
    SITE, { now: NOW },
  );
  assert.ok(result.files.some((file) => file.path === paths.archive(niche.slug, 2)), 'zweite Archivseite fehlt');
  assert.match(result.files.find((file) => file.path === paths.archive(niche.slug)).content, /aria-current="page"/);
});

// --------------------------------------------------------------- subscribers

test('Altbestand wird uebernommen, aber NICHT als bestaetigt ausgegeben', () => {
  // Fuer alte Adressen existiert kein Nachweis. Sie einfach auf "aktiv" zu
  // setzen, waere ein erfundener Beleg - genau das darf nicht passieren.
  const entry = subs.migrateEntry('alt@firma.de', 'gebaeudereinigung');
  assert.equal(entry.status, subs.STATUS.PENDING);
  assert.equal(entry.bestaetigt, null);
  assert.equal(subs.migrateEntry('keine-mail', 'x'), null);
});

test('Anmeldung erzeugt noch keine Versandberechtigung', () => {
  const all = {};
  const { entry } = subs.addPending(all, 'gebaeudereinigung', { email: 'A@Firma.DE ', quelle: '/gebaeudereinigung/' });
  assert.equal(entry.email, 'a@firma.de', 'Adressen werden normalisiert');
  assert.equal(entry.status, subs.STATUS.PENDING);
  assert.equal(subs.activeOf(all, 'gebaeudereinigung').length, 0);
  assert.ok(entry.token && entry.angemeldet && entry.wortlaut);
});

test('Bestaetigung braucht den passenden Token', () => {
  const all = {};
  const { entry } = subs.addPending(all, 'x', { email: 'a@b.de' });
  assert.throws(() => subs.confirm(all, 'x', { email: 'a@b.de', token: 'falsch' }), /Token/);
  const confirmed = subs.confirm(all, 'x', { email: 'a@b.de', token: entry.token });
  assert.equal(confirmed.status, subs.STATUS.ACTIVE);
  assert.ok(confirmed.bestaetigt);
  assert.equal(subs.activeOf(all, 'x').length, 1);
});

test('muendliche Zustimmung ist nur mit Nachweisnotiz gueltig', () => {
  const all = {};
  subs.addPending(all, 'x', { email: 'a@b.de' });
  assert.throws(() => subs.confirm(all, 'x', { email: 'a@b.de', kanal: 'telefon' }), /Notiz/);
  const entry = subs.confirm(all, 'x', { email: 'a@b.de', kanal: 'telefon', notiz: 'Zustimmung am Telefon, Herr Meier, 25.07.2026 10:14' });
  assert.equal(entry.kanal, 'telefon');
  assert.match(entry.notiz, /Herr Meier/);
});

test('Abmeldung wirkt sofort und dauerhaft', () => {
  const all = {};
  const { entry } = subs.addPending(all, 'x', { email: 'a@b.de' });
  subs.confirm(all, 'x', { email: 'a@b.de', token: entry.token });
  subs.remove(all, 'x', 'A@B.de');
  assert.equal(subs.activeOf(all, 'x').length, 0);
  assert.equal(subs.findEntry(all, 'x', 'a@b.de').status, subs.STATUS.REMOVED);
});

test('activeOf trennt zahlende Abos vom kostenlosen Ueberblick', () => {
  const all = {};
  for (const [email, plan] of [['zahler@b.de', subs.PLAN.PAID], ['gratis@b.de', subs.PLAN.FREE]]) {
    const { entry } = subs.addPending(all, 'x', { email, plan });
    subs.confirm(all, 'x', { email, token: entry.token });
  }
  assert.equal(subs.activeOf(all, 'x').length, 2);
  assert.equal(subs.activeOf(all, 'x', subs.PLAN.PAID)[0].email, 'zahler@b.de');
  assert.equal(subs.activeOf(all, 'x', subs.PLAN.FREE)[0].email, 'gratis@b.de');
});

test('findByToken findet den Eintrag ueber alle Nischen hinweg', () => {
  const all = {};
  const { entry } = subs.addPending(all, 'galabau', { email: 'a@b.de' });
  assert.equal(subs.findByToken(all, entry.token).slug, 'galabau');
  assert.equal(subs.findByToken(all, 'unbekannt'), null);
});

test('ungueltige Adressen werden abgewiesen', () => {
  assert.throws(() => subs.addPending({}, 'x', { email: 'kein-at-zeichen' }), /gueltige E-Mail/);
});

// ------------------------------------------------------- Basispfad der Links

test('interne Links tragen den Projektpfad, wenn die Seite nicht im Wurzelverzeichnis liegt', () => {
  // GitHub Pages serviert Projekt-Repos unter …github.io/<Repo>/. Ein Link auf
  // /gebaeudereinigung/ ginge dort ins Leere - genau das darf nicht passieren.
  const projekt = { ...SITE, baseUrl: 'https://phifa96.github.io/Business-Idee/' };
  const link = linker(projekt);
  assert.equal(link(paths.home()), '/Business-Idee/');
  assert.equal(link(paths.niche('gebaeudereinigung')), '/Business-Idee/gebaeudereinigung/');
  assert.equal(link(paths.archive('gebaeudereinigung')), '/Business-Idee/gebaeudereinigung/archiv.html');

  const gebaut = buildSite(
    [{ niche, archive, summary: summarize(archive, niche, { days: 90, now: NOW }) }],
    projekt, { now: NOW },
  );
  const start = gebaut.files.find((file) => file.path === 'index.html').content;
  assert.ok(start.includes('href="/Business-Idee/gebaeudereinigung/"'), 'Startseite verlinkt ohne Projektpfad');
  assert.ok(!/href="\/gebaeudereinigung\//.test(start), 'noch ein Link ohne Projektpfad vorhanden');
});

test('mit eigener Domain bleibt der Praefix leer', () => {
  const link = linker(SITE);
  assert.equal(link(paths.home()), '/');
  assert.equal(link(paths.niche('galabau')), '/galabau/');
  assert.equal(linker(null)(paths.home()), '/', 'ohne Konfiguration keine kaputten Links');
  assert.equal(linker({ baseUrl: 'kaputt' })(paths.home()), '/', 'unbrauchbare baseUrl faellt sauber zurueck');
});

test('die Sitemap nutzt denselben Praefix wie die Links', () => {
  const projekt = { ...SITE, baseUrl: 'https://phifa96.github.io/Business-Idee/' };
  const gebaut = buildSite(
    [{ niche, archive, summary: summarize(archive, niche, { days: 90, now: NOW }) }],
    projekt, { now: NOW },
  );
  const locs = [...gebaut.files.find((file) => file.path === 'sitemap.xml').content.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const loc of locs) assert.ok(loc.startsWith('https://phifa96.github.io/Business-Idee/'), loc);
});

test('ohne Veroeffentlichungsdatum greift die Erstsichtung als Rueckfall', () => {
  // Beim ersten Live-Lauf lieferte TED kein publishedAt. Ohne Rueckfall waere
  // jede Ausschreibung sofort im Gratis-Archiv gelandet und das Bezahlprodukt
  // damit verschenkt gewesen.
  const alt = { id: 'a', publishedAt: null, firstSeenAt: new Date(NOW.getTime() - 5 * 86400000).toISOString(), cpv: [], nuts: [] };
  const frisch = { id: 'b', publishedAt: null, firstSeenAt: new Date(NOW.getTime() - 3600000).toISOString(), cpv: [], nuts: [] };
  const blind = { id: 'c', publishedAt: null, firstSeenAt: null, cpv: [], nuts: [] };

  const shown = publicArchive([alt, frisch, blind], { publicDelayHours: 48 }, NOW);
  assert.deepEqual(shown.map((n) => n.id), ['a'], 'nur der alte Eintrag ist oeffentlich');
  assert.ok(!shown.some((n) => n.id === 'c'), 'ohne jede Zeitangabe wird zurueckgehalten, nicht gezeigt');
});

test('archiveOf reicht die Erstsichtung an jeden Eintrag durch', () => {
  const store = { slug: 'x', firstSeen: { a: '2026-07-01T00:00:00Z' }, notices: { a: { id: 'a', publishedAt: null } }, lastRun: null };
  assert.equal(archiveOf(store)[0].firstSeenAt, '2026-07-01T00:00:00Z');
});
