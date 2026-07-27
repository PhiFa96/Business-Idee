// Auswertungen ueber dem eigenen Archiv.
//
// Das ist der Teil, der die Seiten von einem TED-Spiegel unterscheidet: Nichts
// hier wird kopiert, alles wird aus dem gesammelten Bestand abgeleitet. Ein
// Auftraggeber-Profil oder eine Preiseinordnung steht in keinem Rohdatensatz -
// sie entsteht erst dadurch, dass man ein Jahr Vergaben nebeneinanderlegt.
//
// Alle Funktionen sind rein und ohne Netz testbar.

import { median } from './filter.js';

// NUTS-Ebene 1 fuer Deutschland. Reicht fuer Bundeslandseiten; tiefere Ebenen
// waeren fuer die Zielgruppe zu kleinteilig.
export const BUNDESLAENDER = {
  DE1: 'Baden-Württemberg',
  DE2: 'Bayern',
  DE3: 'Berlin',
  DE4: 'Brandenburg',
  DE5: 'Bremen',
  DE6: 'Hamburg',
  DE7: 'Hessen',
  DE8: 'Mecklenburg-Vorpommern',
  DE9: 'Niedersachsen',
  DEA: 'Nordrhein-Westfalen',
  DEB: 'Rheinland-Pfalz',
  DEC: 'Saarland',
  DED: 'Sachsen',
  DEE: 'Sachsen-Anhalt',
  DEF: 'Schleswig-Holstein',
  DEG: 'Thüringen',
};

export function bundeslandOf(notice) {
  for (const code of notice.nuts ?? []) {
    const prefix = code.slice(0, 3).toUpperCase();
    if (BUNDESLAENDER[prefix]) return prefix;
  }
  return null;
}

/** URL-tauglicher Bezeichner. Muss stabil sein - er ist Teil dauerhafter Adressen. */
export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unbekannt';
}

export function groupByBuyer(archive) {
  const groups = new Map();
  for (const notice of archive) {
    if (!notice.buyer) continue;
    const key = slugify(notice.buyer);
    if (!groups.has(key)) groups.set(key, { slug: key, buyer: notice.buyer, notices: [] });
    groups.get(key).notices.push(notice);
  }
  return groups;
}

export function groupByRegion(archive) {
  const groups = new Map();
  for (const notice of archive) {
    const code = bundeslandOf(notice);
    if (!code) continue;
    if (!groups.has(code)) groups.set(code, { code, name: BUNDESLAENDER[code], notices: [] });
    groups.get(code).notices.push(notice);
  }
  return groups;
}

const byDate = (a, b) => String(a.publishedAt ?? '').localeCompare(String(b.publishedAt ?? ''));

/**
 * Kennzahlen zu einem Auftraggeber. avgIntervalDays ist die eigentlich
 * interessante Zahl: Sie sagt einem Betrieb, wann er dort wieder mit einer
 * Ausschreibung rechnen kann.
 */
export function buyerProfile(archive, buyerSlugOrName) {
  const key = slugify(buyerSlugOrName);
  const notices = archive.filter((n) => n.buyer && slugify(n.buyer) === key).sort(byDate);
  if (notices.length === 0) return null;

  const values = notices.map((n) => n.valueEur).filter((v) => Number.isFinite(v));
  const dates = notices.map((n) => n.publishedAt).filter(Boolean).map((d) => new Date(d).getTime());

  let avgIntervalDays = null;
  if (dates.length >= 2) {
    const span = Math.max(...dates) - Math.min(...dates);
    avgIntervalDays = Math.round(span / 86400000 / (dates.length - 1));
  }

  return {
    slug: key,
    buyer: notices.at(-1).buyer,
    city: notices.map((n) => n.buyerCity).find(Boolean) ?? null,
    count: notices.length,
    totalEur: values.length ? values.reduce((sum, v) => sum + v, 0) : null,
    medianEur: median(values),
    withValue: values.length,
    firstAt: notices[0].publishedAt ?? null,
    lastAt: notices.at(-1).publishedAt ?? null,
    avgIntervalDays,
    notices,
  };
}

export function regionStats(archive, code) {
  const notices = archive.filter((n) => bundeslandOf(n) === code).sort(byDate);
  if (notices.length === 0) return null;
  const values = notices.map((n) => n.valueEur).filter((v) => Number.isFinite(v));
  const buyers = groupByBuyer(notices);

  return {
    code,
    name: BUNDESLAENDER[code] ?? code,
    count: notices.length,
    totalEur: values.length ? values.reduce((sum, v) => sum + v, 0) : null,
    medianEur: median(values),
    topBuyers: [...buyers.values()].sort((a, b) => b.notices.length - a.notices.length).slice(0, 8),
    notices,
  };
}

/**
 * Wo liegt der Auftragswert im Vergleich zu aehnlichen Vergaben?
 * Nur aussagekraeftig ab einer Handvoll Vergleichswerten - darunter wird
 * bewusst null zurueckgegeben, statt eine Scheingenauigkeit zu erzeugen.
 */
export function priceBand(archive, notice, { minComparable = 5 } = {}) {
  if (notice.valueEur == null) return null;
  const cpvGroup = (notice.cpvMain ?? notice.cpv?.[0] ?? '').slice(0, 5);
  if (!cpvGroup) return null;

  const comparable = archive
    .filter((n) => n.id !== notice.id && Number.isFinite(n.valueEur))
    .filter((n) => (n.cpv ?? []).some((code) => code.startsWith(cpvGroup)))
    .map((n) => n.valueEur)
    .sort((a, b) => a - b);

  if (comparable.length < minComparable) return null;

  const below = comparable.filter((v) => v < notice.valueEur).length;
  const percentile = Math.round((below / comparable.length) * 100);
  const band = percentile >= 67 ? 'oberen Drittel' : percentile >= 34 ? 'mittleren Drittel' : 'unteren Drittel';

  return { percentile, band, comparableCount: comparable.length, medianEur: median(comparable) };
}

/** Aehnliche fruehere Vergaben - dient zugleich der internen Verlinkung. */
export function similarNotices(archive, notice, { limit = 5 } = {}) {
  const cpvGroup = (notice.cpvMain ?? notice.cpv?.[0] ?? '').slice(0, 5);
  const region = bundeslandOf(notice);

  return archive
    .filter((n) => n.id !== notice.id)
    .map((n) => {
      let affinity = 0;
      if (cpvGroup && (n.cpv ?? []).some((code) => code.startsWith(cpvGroup))) affinity += 3;
      if (region && bundeslandOf(n) === region) affinity += 2;
      if (n.buyer && notice.buyer && slugify(n.buyer) === slugify(notice.buyer)) affinity += 4;
      return { notice: n, affinity };
    })
    .filter((entry) => entry.affinity > 0)
    .sort((a, b) => b.affinity - a.affinity || String(b.notice.publishedAt ?? '').localeCompare(String(a.notice.publishedAt ?? '')))
    .slice(0, limit)
    .map((entry) => entry.notice);
}

// --------------------------------------------------------------- Formulierung

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
// Deutsche Zeitzone, siehe ZEITZONE in html.js: Am Jahreswechsel kippt sonst
// die Jahreszahl in "schreibt seit 2024 aus" um ein Jahr.
const JAHR = new Intl.DateTimeFormat('de-DE', { year: 'numeric', timeZone: 'Europe/Berlin' });

function intervalPhrase(days) {
  if (days == null) return null;
  if (days <= 45) return 'etwa monatlich';
  if (days <= 100) return 'etwa vierteljährlich';
  if (days <= 200) return 'etwa halbjährlich';
  if (days <= 400) return 'etwa jährlich';
  return `im Abstand von rund ${Math.round(days / 30)} Monaten`;
}

/**
 * Der Absatz, der auf der Detailseite steht. Bewusst als Text und nicht als
 * Kennzahlenblock: Er soll fuer einen Kalkulator lesbar sein und nebenbei der
 * Seite Substanz geben, die der Rohdatensatz nicht hat.
 */
export function buyerNarrative(profile) {
  if (!profile || profile.count < 2) return null;
  const seit = profile.firstAt ? JAHR.format(new Date(profile.firstAt)) : null;
  const parts = [`${profile.buyer} hat${seit ? ` seit ${seit}` : ''} ${profile.count} Aufträge in diesem Gewerk ausgeschrieben`];

  if (profile.totalEur != null && profile.withValue >= 2) {
    parts.push(`zusammen ${EUR.format(profile.totalEur)}${profile.withValue < profile.count ? ` (bei ${profile.withValue} von ${profile.count} mit Wertangabe)` : ''}`);
  }
  const rhythm = intervalPhrase(profile.avgIntervalDays);
  if (rhythm) parts.push(`im Schnitt ${rhythm}`);

  return `${parts.join(', ')}.`;
}

export function priceNarrative(band, notice) {
  if (!band) return null;
  return `Mit ${EUR.format(notice.valueEur)} liegt dieser Auftrag im ${band.band} von ${band.comparableCount} vergleichbaren Vergaben (Median ${EUR.format(band.medianEur)}).`;
}

export function regionNarrative(stats) {
  if (!stats || stats.count < 2) return null;
  const parts = [`In ${stats.name} wurden ${stats.count} Aufträge in diesem Gewerk ausgeschrieben`];
  if (stats.totalEur != null) parts.push(`mit einem erfassten Volumen von ${EUR.format(stats.totalEur)}`);
  if (stats.medianEur != null) parts.push(`der mittlere Auftragswert liegt bei ${EUR.format(stats.medianEur)}`);
  return `${parts.join(', ')}.`;
}
