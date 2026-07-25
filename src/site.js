// Erzeugt die vollstaendige statische Website.
//
// Jede Funktion gibt HTML zurueck, geschrieben wird erst in buildSite(). Das
// haelt alles ohne Dateisystem testbar.
//
// Leitgedanke: Nicht der TED-Datensatz ist der Inhalt, sondern das, was aus dem
// eigenen Archiv darueber hinaus ableitbar ist - Auftraggeber-Profile,
// Preiseinordnung, regionale Verteilung. Ein reiner Spiegel oeffentlicher Daten
// hat keine Aussicht auf Sichtbarkeit.

import { escapeHtml, formatMoney, formatDate, layout, noticeCard, subscribeBlock, LIST_SCRIPT, UTM_SCRIPT, truncate } from './html.js';
import {
  groupByBuyer, groupByRegion, buyerProfile, regionStats, priceBand, similarNotices,
  buyerNarrative, priceNarrative, regionNarrative, bundeslandOf, slugify, BUNDESLAENDER,
} from './insights.js';

export const PAGE_SIZE = 50;

const safeId = (id) => String(id).replace(/[^A-Za-z0-9._-]/g, '_');

export const paths = {
  home: () => 'index.html',
  niche: (slug) => `${slug}/index.html`,
  offer: (slug) => `${slug}/angebot.html`,
  archive: (slug, page = 1) => (page === 1 ? `${slug}/archiv.html` : `${slug}/archiv-${page}.html`),
  notice: (slug, id) => `${slug}/a/${safeId(id)}.html`,
  buyer: (slug, buyerSlug) => `${slug}/auftraggeber/${buyerSlug}.html`,
  region: (slug, code) => `${slug}/region/${code.toLowerCase()}.html`,
};

/**
 * Erzeugt die internen Links. Der Praefix kommt aus dem Pfad der baseUrl:
 * Bei GitHub Pages unter einem Projektnamen liegt die Seite nicht im
 * Wurzelverzeichnis (…github.io/Business-Idee/), und ein Link auf /gewerk/
 * wuerde dort ins Leere zeigen. Mit eigener Domain ist der Praefix leer.
 */
export function linker(baseUrlOrSite) {
  const baseUrl = typeof baseUrlOrSite === 'string' ? baseUrlOrSite : baseUrlOrSite?.baseUrl;
  let prefix = '';
  try {
    if (baseUrl) prefix = new URL(baseUrl).pathname.replace(/\/+$/, '');
  } catch {
    prefix = '';
  }
  return (path) => `${prefix}/${path}`.replace(/\/index\.html$/, '/');
}

/**
 * Freemium-Grenze: Das oeffentliche Archiv zeigt eine Ausschreibung erst nach
 * publicDelayHours. Bei Ausschreibungen ist Zeit der Wert - wer zwei Tage
 * spaeter zu kalkulieren beginnt, hat zwei Tage weniger. Der Bestand fuer die
 * Suche bleibt davon unberuehrt, es fehlt nur das Allerneueste.
 */
export function publicArchive(archive, niche, now = new Date()) {
  const delayMs = (niche.publicDelayHours ?? 48) * 3600000;
  const cutoff = now.getTime() - delayMs;
  return archive.filter((notice) => !notice.publishedAt || new Date(notice.publishedAt).getTime() <= cutoff);
}

const isOpen = (notice, now) => !notice.deadline || new Date(notice.deadline).getTime() >= now.getTime();

function kpiBlock(entries) {
  return `<div class="kpi">${entries
    .filter(([, value]) => value != null && value !== '')
    .map(([label, value]) => `<div><b>${escapeHtml(String(value))}</b>${escapeHtml(label)}</div>`)
    .join('')}</div>`;
}

// ------------------------------------------------------------------ Startseite

export function renderHome(entries, site, { now = new Date() } = {}) {
  const url = linker(site);
  const body = `
<h1>Öffentliche Ausschreibungen nach Gewerk</h1>
<p class="sub">Täglich aus der EU-Datenbank TED zusammengestellt und nach Handwerk gefiltert &middot; Stand ${escapeHtml(formatDate(now))}</p>
<div class="grid">
${entries.map((entry) => `<article class="item">
  <h3><a href="${escapeHtml(url(paths.niche(entry.niche.slug)))}">${escapeHtml(entry.niche.name)}</a></h3>
  <p class="meta">${entry.open} laufende &middot; ${entry.total} erfasst${entry.totalEur != null ? `<br>Volumen ${formatMoney(entry.totalEur)}` : ''}</p>
</article>`).join('\n')}
</div>
<h2>Was das hier ist</h2>
<p>Öffentliche Auftraggeber müssen ab bestimmten Auftragswerten europaweit ausschreiben. Diese
Bekanntmachungen sind öffentlich, stehen aber verstreut und in einer Sprache, die nach Gewerken
zu durchsuchen Arbeit macht. Hier sind sie nach Handwerk sortiert, mit Auftragswert, Frist und
einer Einordnung, wie der Auftrag im Vergleich zu früheren Vergaben desselben Auftraggebers liegt.</p>`;

  return layout({
    title: 'Öffentliche Ausschreibungen nach Gewerk – Vergabe-Radar',
    description: 'Öffentliche Ausschreibungen aus der EU-Datenbank TED, nach Handwerk gefiltert: Gebäudereinigung, GaLaBau, Elektro und SHK, Metallbau. Mit Auftragswert, Frist und Auftraggeber-Historie.',
    body,
    canonical: url(paths.home()),
    baseUrl: site.baseUrl,
    impressum: site.impressum,
  });
}

// ------------------------------------------------------- Übersicht je Gewerk

export function renderNicheIndex(niche, archive, site, { now = new Date() } = {}) {
  const url = linker(site);
  const open = archive.filter((notice) => isOpen(notice, now));
  const regions = [...groupByRegion(archive).values()].sort((a, b) => b.notices.length - a.notices.length);
  const buyers = [...groupByBuyer(archive).values()].sort((a, b) => b.notices.length - a.notices.length).slice(0, 12);
  const values = archive.map((n) => n.valueEur).filter(Number.isFinite);

  const body = `
<h1>Ausschreibungen ${escapeHtml(niche.name)}</h1>
<p class="sub">Laufende öffentliche Ausschreibungen in Deutschland &middot; Stand ${escapeHtml(formatDate(now))}</p>
${kpiBlock([
    ['laufende Ausschreibungen', open.length],
    ['insgesamt erfasst', archive.length],
    ['erfasstes Volumen', values.length ? formatMoney(values.reduce((sum, v) => sum + v, 0)) : null],
  ])}
${subscribeBlock(niche, { endpoint: site.subscribeEndpoint, mailto: site.kontaktEmail, quelle: url(paths.niche(niche.slug)) })}

<h2>Laufende Ausschreibungen</h2>
<div class="controls">
  <input id="q" type="search" placeholder="Suchen nach Titel, Auftraggeber, Ort …" autocomplete="off" aria-label="Suchen">
  <select id="sort" aria-label="Sortierung">
    <option value="d">Frist zuerst</option>
    <option value="p">Neueste zuerst</option>
    <option value="v">Höchster Auftragswert</option>
  </select>
</div>
<p class="count" id="count">${open.length} Ausschreibungen</p>
<div id="list">
${open.length
    ? open.map((notice) => noticeCard(notice, { now, href: url(paths.notice(niche.slug, notice.id)) })).join('\n')
    : '<p class="empty">Derzeit keine laufenden Ausschreibungen mit offener Frist.</p>'}
</div>

${regions.length ? `<h2>Nach Bundesland</h2><div class="grid">${regions.map((region) => `<article class="item"><h3><a href="${escapeHtml(url(paths.region(niche.slug, region.code)))}">${escapeHtml(region.name)}</a></h3><p class="meta">${region.notices.length} Ausschreibungen</p></article>`).join('')}</div>` : ''}

${buyers.length ? `<h2>Auftraggeber, die regelmäßig ausschreiben</h2><div class="grid">${buyers.map((buyer) => `<article class="item"><h3><a href="${escapeHtml(url(paths.buyer(niche.slug, buyer.slug)))}">${escapeHtml(buyer.buyer)}</a></h3><p class="meta">${buyer.notices.length} Vergaben erfasst</p></article>`).join('')}</div>` : ''}

<p style="margin-top:26px"><a href="${escapeHtml(url(paths.archive(niche.slug)))}">Vollständiges Archiv, auch abgelaufene Ausschreibungen &rarr;</a></p>`;

  return layout({
    title: `Ausschreibungen ${niche.name} – aktuelle öffentliche Aufträge`,
    description: `${open.length} laufende öffentliche Ausschreibungen für ${niche.name} in Deutschland, mit Auftragswert, Angebotsfrist und Auftraggeber. Täglich aktualisiert aus TED.`,
    body,
    canonical: url(paths.niche(niche.slug)),
    baseUrl: site.baseUrl,
    breadcrumbs: [{ name: 'Start', href: url(paths.home()) }, { name: niche.name }],
    impressum: site.impressum,
    scripts: [LIST_SCRIPT],
  });
}

// ------------------------------------------------------------ Detailseiten

export function renderNoticePage(niche, notice, archive, site, { now = new Date() } = {}) {
  const url = linker(site);
  const profile = notice.buyer ? buyerProfile(archive, notice.buyer) : null;
  const band = priceBand(archive, notice);
  const similar = similarNotices(archive, notice, { limit: 5 });
  const region = bundeslandOf(notice);

  // Der abgeleitete Teil - das, was im Rohdatensatz nicht steht.
  const narratives = [buyerNarrative(profile), priceNarrative(band, notice)].filter(Boolean);

  const body = `
<h1>${escapeHtml(notice.title)}</h1>
<p class="sub">${escapeHtml(notice.buyer ?? 'Auftraggeber unbekannt')}${notice.buyerCity ? `, ${escapeHtml(notice.buyerCity)}` : ''} &middot; veröffentlicht ${escapeHtml(formatDate(notice.publishedAt))}</p>

${kpiBlock([
    ['Auftragswert', formatMoney(notice.valueEur)],
    ['Angebotsfrist', formatDate(notice.deadline)],
    ['Status', isOpen(notice, now) ? 'Frist offen' : 'Frist abgelaufen'],
  ])}

${narratives.length ? `<section class="note">${narratives.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}</section>` : ''}

<h2>Angaben zur Ausschreibung</h2>
<p class="meta">
  CPV-Codes: ${escapeHtml((notice.cpv ?? []).join(', ') || '–')}<br>
  ${region ? `Region: <a href="${escapeHtml(url(paths.region(niche.slug, region)))}">${escapeHtml(BUNDESLAENDER[region])}</a><br>` : ''}
  ${profile ? `Auftraggeber: <a href="${escapeHtml(url(paths.buyer(niche.slug, profile.slug)))}">Alle Vergaben von ${escapeHtml(profile.buyer)}</a><br>` : ''}
  ${notice.url ? `Amtliche Bekanntmachung: <a href="${escapeHtml(notice.url)}" rel="noopener">bei TED ansehen</a>` : ''}
</p>

${subscribeBlock(niche, { endpoint: site.subscribeEndpoint, mailto: site.kontaktEmail, quelle: url(paths.notice(niche.slug, notice.id)) })}

${similar.length ? `<h2>Ähnliche Vergaben</h2><div id="list">${similar.map((entry) => noticeCard(entry, { now, href: url(paths.notice(niche.slug, entry.id)) })).join('\n')}</div>` : ''}`;

  const descParts = [
    notice.buyer ? `${notice.buyer} schreibt aus:` : 'Öffentliche Ausschreibung:',
    notice.title,
    notice.valueEur != null ? `Auftragswert ${formatMoney(notice.valueEur)}.` : '',
    notice.deadline ? `Angebotsfrist ${formatDate(notice.deadline)}.` : '',
  ];

  return layout({
    title: `${truncate(notice.title, 65)} – ${notice.buyerCity ?? niche.name}`,
    description: truncate(descParts.filter(Boolean).join(' ')),
    body,
    canonical: url(paths.notice(niche.slug, notice.id)),
    baseUrl: site.baseUrl,
    breadcrumbs: [
      { name: 'Start', href: url(paths.home()) },
      { name: niche.name, href: url(paths.niche(niche.slug)) },
      { name: truncate(notice.title, 45) },
    ],
    impressum: site.impressum,
  });
}

// ------------------------------------------------------- Auftraggeber-Profil

export function renderBuyerPage(niche, profile, site, { now = new Date() } = {}) {
  const url = linker(site);
  const narrative = buyerNarrative(profile);
  const sorted = [...profile.notices].sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')));

  const body = `
<h1>Ausschreibungen von ${escapeHtml(profile.buyer)}</h1>
<p class="sub">${escapeHtml(niche.name)}${profile.city ? ` &middot; ${escapeHtml(profile.city)}` : ''} &middot; ${profile.count} Vergaben erfasst</p>

${kpiBlock([
    ['Vergaben', profile.count],
    ['erfasstes Volumen', profile.totalEur != null ? formatMoney(profile.totalEur) : null],
    ['mittlerer Auftragswert', profile.medianEur != null ? formatMoney(profile.medianEur) : null],
    ['Rhythmus', profile.avgIntervalDays ? `alle ${profile.avgIntervalDays} Tage` : null],
  ])}

${narrative ? `<section class="note"><p>${escapeHtml(narrative)}</p>
<p class="meta">Erste erfasste Vergabe ${escapeHtml(formatDate(profile.firstAt))}, letzte ${escapeHtml(formatDate(profile.lastAt))}.</p></section>` : ''}

${subscribeBlock(niche, { endpoint: site.subscribeEndpoint, mailto: site.kontaktEmail, quelle: url(paths.buyer(niche.slug, profile.slug)) })}

<h2>Alle erfassten Vergaben</h2>
<div id="list">
${sorted.map((notice) => noticeCard(notice, { now, href: url(paths.notice(niche.slug, notice.id)) })).join('\n')}
</div>`;

  return layout({
    title: `${truncate(profile.buyer, 55)} – Ausschreibungen ${niche.name}`,
    description: truncate(narrative ?? `Alle erfassten öffentlichen Ausschreibungen von ${profile.buyer} im Bereich ${niche.name}, mit Auftragswerten und Fristen.`),
    body,
    canonical: url(paths.buyer(niche.slug, profile.slug)),
    baseUrl: site.baseUrl,
    breadcrumbs: [
      { name: 'Start', href: url(paths.home()) },
      { name: niche.name, href: url(paths.niche(niche.slug)) },
      { name: truncate(profile.buyer, 45) },
    ],
    impressum: site.impressum,
  });
}

// ------------------------------------------------------------ Bundeslandseite

export function renderRegionPage(niche, stats, site, { now = new Date() } = {}) {
  const url = linker(site);
  const narrative = regionNarrative(stats);
  const sorted = [...stats.notices].sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')));

  const body = `
<h1>Ausschreibungen ${escapeHtml(niche.name)} in ${escapeHtml(stats.name)}</h1>
<p class="sub">${stats.count} erfasste Vergaben &middot; Stand ${escapeHtml(formatDate(now))}</p>

${kpiBlock([
    ['Ausschreibungen', stats.count],
    ['erfasstes Volumen', stats.totalEur != null ? formatMoney(stats.totalEur) : null],
    ['mittlerer Auftragswert', stats.medianEur != null ? formatMoney(stats.medianEur) : null],
  ])}

${narrative ? `<section class="note"><p>${escapeHtml(narrative)}</p></section>` : ''}

${stats.topBuyers.length ? `<h2>Auftraggeber in ${escapeHtml(stats.name)}</h2><div class="grid">${stats.topBuyers.map((buyer) => `<article class="item"><h3><a href="${escapeHtml(url(paths.buyer(niche.slug, buyer.slug)))}">${escapeHtml(buyer.buyer)}</a></h3><p class="meta">${buyer.notices.length} Vergaben</p></article>`).join('')}</div>` : ''}

${subscribeBlock(niche, { endpoint: site.subscribeEndpoint, mailto: site.kontaktEmail, quelle: url(paths.region(niche.slug, stats.code)) })}

<h2>Alle Vergaben in ${escapeHtml(stats.name)}</h2>
<div id="list">
${sorted.map((notice) => noticeCard(notice, { now, href: url(paths.notice(niche.slug, notice.id)) })).join('\n')}
</div>`;

  return layout({
    title: `Ausschreibungen ${niche.name} ${stats.name}`,
    description: truncate(narrative ?? `Öffentliche Ausschreibungen für ${niche.name} in ${stats.name}, mit Auftragswert, Frist und Auftraggeber.`),
    body,
    canonical: url(paths.region(niche.slug, stats.code)),
    baseUrl: site.baseUrl,
    breadcrumbs: [
      { name: 'Start', href: url(paths.home()) },
      { name: niche.name, href: url(paths.niche(niche.slug)) },
      { name: stats.name },
    ],
    impressum: site.impressum,
  });
}

// ------------------------------------------------------------- Archiv, paginiert

export function renderArchivePage(niche, pageNotices, site, { page, pageCount, now = new Date() } = {}) {
  const url = linker(site);
  const pager = pageCount > 1
    ? `<nav class="pager">${Array.from({ length: pageCount }, (_, index) => {
      const number = index + 1;
      return number === page
        ? `<span aria-current="page">${number}</span>`
        : `<a href="${escapeHtml(url(paths.archive(niche.slug, number)))}">${number}</a>`;
    }).join('')}</nav>`
    : '';

  const body = `
<h1>Archiv ${escapeHtml(niche.name)}${page > 1 ? ` – Seite ${page}` : ''}</h1>
<p class="sub">Alle erfassten Ausschreibungen, auch mit abgelaufener Frist &middot; Seite ${page} von ${pageCount}</p>
<div class="controls">
  <input id="q" type="search" placeholder="Suchen nach Titel, Auftraggeber, Ort …" autocomplete="off" aria-label="Suchen">
  <select id="sort" aria-label="Sortierung">
    <option value="p">Neueste zuerst</option>
    <option value="v">Höchster Auftragswert</option>
    <option value="d">Frist zuerst</option>
  </select>
</div>
<p class="count" id="count">${pageNotices.length} Ausschreibungen</p>
<div id="list">
${pageNotices.map((notice) => noticeCard(notice, { now, href: url(paths.notice(niche.slug, notice.id)) })).join('\n')}
</div>
${pager}`;

  return layout({
    title: `Archiv Ausschreibungen ${niche.name}${page > 1 ? ` – Seite ${page}` : ''}`,
    description: `Archiv aller erfassten öffentlichen Ausschreibungen für ${niche.name} in Deutschland, mit Auftragswerten, Fristen und Auftraggebern.`,
    body,
    canonical: url(paths.archive(niche.slug, page)),
    baseUrl: site.baseUrl,
    breadcrumbs: [
      { name: 'Start', href: url(paths.home()) },
      { name: niche.name, href: url(paths.niche(niche.slug)) },
      { name: 'Archiv' },
    ],
    impressum: site.impressum,
    scripts: [LIST_SCRIPT],
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: `Öffentliche Ausschreibungen ${niche.name}`,
      description: `Aus TED zusammengestellte öffentliche Ausschreibungen für ${niche.name} in Deutschland.`,
      isAccessibleForFree: true,
      creator: site.betreiber ? { '@type': 'Organization', name: site.betreiber } : undefined,
    }],
  });
}

// ---------------------------------------------------------------- Landingpage

export function renderOffer(niche, summary, site, { now = new Date(), sample = [] } = {}) {
  const url = linker(site);
  const stripe = site.stripeLinks?.[niche.slug] ?? null;
  const price = niche.price?.monthly ?? 79;

  const body = `
<h1>Jeden Werktag um 6 Uhr: alle neuen Ausschreibungen für ${escapeHtml(niche.name)}</h1>
<p class="sub">Gefiltert auf Ihr Gewerk. Keine Portalsuche, keine verpassten Fristen.</p>

<section class="note">
  <p><strong>In den letzten 90 Tagen waren das ${summary.usable} Ausschreibungen${summary.totalEur != null ? ` mit zusammen ${formatMoney(summary.totalEur)} Auftragsvolumen` : ''}.</strong></p>
  <p class="meta">Zahlen aus dem eigenen Bestand, nachprüfbar im
  <a href="${escapeHtml(url(paths.archive(niche.slug)))}">offenen Archiv</a>.</p>
</section>

<h2>Was Sie bekommen</h2>
<ul>
  <li>Werktägliche E-Mail mit allen neuen Ausschreibungen Ihres Gewerks, sobald sie erscheinen</li>
  <li>Auftraggeber, Auftragswert und Angebotsfrist auf einen Blick</li>
  <li>Einordnung, wie der Auftrag im Vergleich zu früheren Vergaben desselben Auftraggebers liegt</li>
  <li>Auch an Tagen ohne Treffer eine Mail &ndash; damit Sie wissen, dass nichts untergegangen ist</li>
</ul>

${sample.length ? `<h2>So sieht die Liste aus</h2><div id="list">${sample.slice(0, 3).map((notice) => noticeCard(notice, { now, href: url(paths.notice(niche.slug, notice.id)) })).join('\n')}</div>` : ''}

<h2>Preis</h2>
<p><strong>${price} € im Monat</strong>, monatlich kündbar. Der erste Monat kostet 1 €.</p>
${stripe
    ? `<p><a class="cta" data-utm href="${escapeHtml(stripe)}">Ersten Monat für 1 € starten</a></p>`
    : '<p class="meta">Zahlungslink noch nicht hinterlegt (config/site.json → stripeLinks).</p>'}

<h2>Lieber erst kostenlos ansehen?</h2>
${subscribeBlock(niche, { endpoint: site.subscribeEndpoint, mailto: site.kontaktEmail, quelle: url(paths.offer(niche.slug)) })}
<p class="meta">Der kostenlose Überblick kommt einmal pro Woche und zeigt Ausschreibungen mit
${niche.publicDelayHours ?? 48} Stunden Verzögerung. Der bezahlte Alert kommt werktäglich, sobald
eine Ausschreibung erscheint.</p>`;

  return layout({
    title: `Ausschreibungs-Alert ${niche.name} – täglich per E-Mail`,
    description: `Werktägliche E-Mail mit allen neuen öffentlichen Ausschreibungen für ${niche.name}. In den letzten 90 Tagen ${summary.usable} Ausschreibungen. ${price} € im Monat, erster Monat 1 €.`,
    body,
    canonical: url(paths.offer(niche.slug)),
    baseUrl: site.baseUrl,
    breadcrumbs: [
      { name: 'Start', href: url(paths.home()) },
      { name: niche.name, href: url(paths.niche(niche.slug)) },
      { name: 'Alert abonnieren' },
    ],
    impressum: site.impressum,
    scripts: [UTM_SCRIPT],
  });
}

export function render404(site) {
  const url = linker(site);
  return layout({
    title: 'Seite nicht gefunden – Vergabe-Radar',
    description: 'Diese Seite existiert nicht. Zurück zur Übersicht der Gewerke.',
    body: `<h1>Seite nicht gefunden</h1><p>Diese Adresse gibt es nicht (mehr). <a href="${escapeHtml(url(paths.home()))}">Zurück zur Übersicht</a>.</p>`,
    baseUrl: site.baseUrl,
    impressum: site.impressum,
    noindex: true,
  });
}

// ------------------------------------------------------------ Sitemap, robots

export function renderSitemap(entries, baseUrl) {
  const url = linker(baseUrl);
  if (!baseUrl) throw new Error('renderSitemap braucht eine baseUrl - relative Adressen sind in einer Sitemap unzulaessig.');
  const items = entries.map(({ path, lastmod }) => {
    const absolute = new URL(url(path), baseUrl).href;
    return `  <url><loc>${escapeHtml(absolute)}</loc>${lastmod ? `<lastmod>${escapeHtml(String(lastmod).slice(0, 10))}</lastmod>` : ''}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items.join('\n')}
</urlset>
`;
}

export function renderRobots(baseUrl) {
  return `User-agent: *
Allow: /
${baseUrl ? `\nSitemap: ${new URL('/sitemap.xml', baseUrl).href}\n` : ''}`;
}

// ------------------------------------------------------------------- Aufbau

/**
 * Baut alle Seiten und gibt sie als Liste zurueck. Schreiben passiert im
 * Aufrufer - so bleibt der gesamte Seitenaufbau ohne Dateisystem testbar.
 */
export function buildSite(nicheData, site, { now = new Date() } = {}) {
  const url = linker(site);
  const files = [];
  const sitemap = [];
  const homeEntries = [];

  const add = (path, content, { lastmod = null, indexable = true } = {}) => {
    files.push({ path, content });
    if (indexable) sitemap.push({ path, lastmod: lastmod ?? now.toISOString() });
  };

  for (const { niche, archive: fullArchive, summary } of nicheData) {
    const archive = publicArchive(fullArchive, niche, now);
    const values = archive.map((n) => n.valueEur).filter(Number.isFinite);
    homeEntries.push({
      niche,
      total: archive.length,
      open: archive.filter((notice) => isOpen(notice, now)).length,
      totalEur: values.length ? values.reduce((sum, v) => sum + v, 0) : null,
    });

    add(paths.niche(niche.slug), renderNicheIndex(niche, archive, site, { now }));
    add(paths.offer(niche.slug), renderOffer(niche, { ...summary, totalEur: values.length ? values.reduce((sum, v) => sum + v, 0) : null }, site, { now, sample: archive.slice(0, 3) }));

    const pageCount = Math.max(1, Math.ceil(archive.length / PAGE_SIZE));
    for (let page = 1; page <= pageCount; page++) {
      const slice = archive.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      add(paths.archive(niche.slug, page), renderArchivePage(niche, slice, site, { page, pageCount, now }));
    }

    for (const notice of archive) {
      add(paths.notice(niche.slug, notice.id), renderNoticePage(niche, notice, archive, site, { now }), { lastmod: notice.publishedAt });
    }

    for (const group of groupByBuyer(archive).values()) {
      const profile = buyerProfile(archive, group.buyer);
      if (profile) add(paths.buyer(niche.slug, profile.slug), renderBuyerPage(niche, profile, site, { now }), { lastmod: profile.lastAt });
    }

    for (const code of groupByRegion(archive).keys()) {
      const stats = regionStats(archive, code);
      if (stats) add(paths.region(niche.slug, code), renderRegionPage(niche, stats, site, { now }));
    }
  }

  add(paths.home(), renderHome(homeEntries, site, { now }));
  files.push({ path: '404.html', content: render404(site) });
  files.push({ path: 'robots.txt', content: renderRobots(site.baseUrl) });
  if (site.baseUrl) files.push({ path: 'sitemap.xml', content: renderSitemap(sitemap, site.baseUrl) });

  return { files, sitemap };
}
