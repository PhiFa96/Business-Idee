// Rohantwort der TED-API -> internes Notice-Modell.
//
// Grundregel: keine Funktion hier darf werfen. TED liefert je nach Formular
// mal Strings, mal Arrays, mal mehrsprachige Objekte ({"deu": ["..."]}) und
// bei optionalen Angaben gar nichts. Ein einzelner kaputter Datensatz darf
// nie den ganzen Tageslauf kippen.

import { DEFAULT_TED_SCHEMA } from './ted.js';

/** Holt aus einem mehrsprachigen Feld den besten verfuegbaren Text. */
export function pickLang(value, languages = DEFAULT_TED_SCHEMA.languages) {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = pickLang(entry, languages);
      if (text) return text;
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const lang of languages) {
      if (value[lang] != null) {
        const text = pickLang(value[lang], languages);
        if (text) return text;
      }
    }
    // Keine bevorzugte Sprache dabei: erste nicht leere Angabe nehmen.
    for (const entry of Object.values(value)) {
      const text = pickLang(entry, languages);
      if (text) return text;
    }
  }
  return null;
}

export function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Zieht CPV-Codes aus allem, was TED an dieser Stelle liefern kann. */
export function asCpvList(value) {
  const out = [];
  for (const entry of asArray(value)) {
    if (entry == null) continue;
    if (typeof entry === 'object') {
      const nested = entry.code ?? entry.value ?? entry.cpv ?? null;
      if (nested != null) out.push(...asCpvList(nested));
      continue;
    }
    // "90910000-9" oder "90910000" -> "90910000"
    const match = String(entry).match(/\d{8}/);
    if (match) out.push(match[0]);
  }
  return [...new Set(out)];
}

/**
 * Datum aus TED. Nicht jedes Feld kommt im gleichen Format:
 * Fristen liefert TED mit Uhrzeit ("2026-08-11T07:30:00Z"), das
 * Veroeffentlichungsdatum dagegen als reines Datum - je nach Formular als
 * "20260720" oder als xs:date mit Zeitzone ("2026-07-20+02:00"). Beide
 * verwirft new Date(), und genau daran blieb publishedAt bei allen 475
 * Bekanntmachungen leer, obwohl das Feld sehr wohl geliefert wurde.
 *
 * Ein Datum ohne Uhrzeit wird bewusst auf Mitternacht in seiner eigenen
 * Zeitzone gelegt und nicht auf UTC gezwungen - sonst verschoebe sich der
 * Veroeffentlichungstag um einen Tag.
 */
export function asDate(value) {
  const text = pickLang(value);
  if (!text) return null;

  const parsed = new Date(normalizeDateText(text));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeDateText(text) {
  const kompakt = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (kompakt) return `${kompakt[1]}-${kompakt[2]}-${kompakt[3]}`;

  // Reines Datum mit Zeitzonenangabe: die Laenge des Datumsteils ist fest,
  // deshalb ist das fuehrende Minus des Offsets eindeutig vom Datum trennbar.
  const mitZone = /^(\d{4}-\d{2}-\d{2})([+-]\d{2}:\d{2}|Z)$/.exec(text);
  if (mitZone) return `${mitZone[1]}T00:00:00${mitZone[2]}`;

  return text;
}

/**
 * Auftragswert in Euro. TED liefert Betraege je nach Formular als Zahl, als
 * String mit Tausendertrennern oder als Objekt mit Waehrung. Fremdwaehrungen
 * werden bewusst NICHT umgerechnet - ein geschaetzter Kurs waere hier eine
 * erfundene Zahl. Sie liefern null und fallen damit aus der Wertfilterung.
 */
export function asMoneyEur(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const amount = asMoneyEur(entry);
      if (amount != null) return amount;
    }
    return null;
  }

  if (typeof value === 'object') {
    const currency = String(value.currency ?? value.currencyId ?? value.cur ?? 'EUR').toUpperCase();
    if (currency && currency !== 'EUR') return null;
    return asMoneyEur(value.amount ?? value.value ?? value.total ?? null);
  }

  const text = String(value).replace(/[^\d,.-]/g, '');
  if (!text) return null;
  // "1.234.567,89" (deutsch) vs "1234567.89" (englisch) auseinanderhalten.
  const normalized = text.includes(',') && text.lastIndexOf(',') > text.lastIndexOf('.')
    ? text.replaceAll('.', '').replace(',', '.')
    : text.replaceAll(',', '');
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : null;
}

/** NUTS-Regionalcodes (z. B. DEA2 fuer Koeln) aus beliebiger Struktur ziehen. */
export function asNuts(value) {
  const out = [];
  const walk = (entry) => {
    if (entry == null) return;
    if (typeof entry === 'string') {
      const match = entry.match(/\bDE[A-Z0-9]{1,3}\b/g);
      if (match) out.push(...match);
      return;
    }
    if (Array.isArray(entry)) return entry.forEach(walk);
    if (typeof entry === 'object') return Object.values(entry).forEach(walk);
  };
  walk(value);
  return [...new Set(out)];
}

function buildUrl(id, links, schema) {
  const fromLinks = pickLang(links?.html ?? links?.pdf ?? links?.self ?? null);
  if (fromLinks && /^https?:\/\//.test(fromLinks)) return fromLinks;
  return id ? `${schema.noticeUrl}${encodeURIComponent(id)}` : null;
}

/** Eine einzelne Bekanntmachung normalisieren. Gibt null zurueck, wenn sie unbrauchbar ist. */
export function normalizeNotice(raw, schema = DEFAULT_TED_SCHEMA) {
  if (!raw || typeof raw !== 'object') return null;
  const f = schema.fields;
  const get = (key) => raw[f[key]] ?? raw[key] ?? null;

  const id = pickLang(get('id'));
  if (!id) return null; // Ohne Kennung ist Deduplizierung unmoeglich.

  const cpv = asCpvList(get('cpv'));
  return {
    id,
    publishedAt: asDate(get('publishedAt')),
    title: pickLang(get('title')) ?? '(ohne Titel)',
    buyer: pickLang(get('buyer')),
    buyerCity: pickLang(get('buyerCity')),
    country: pickLang(get('country')),
    cpv,
    cpvMain: cpv[0] ?? null,
    valueEur: asMoneyEur(get('value')),
    deadline: asDate(get('deadline')),
    nuts: asNuts(get('nuts')),
    url: buildUrl(id, get('links'), schema),
  };
}

/**
 * Prueft je konfiguriertem Feld, ob es geliefert wird UND ob wir es verstehen.
 *
 * Die Unterscheidung ist der ganze Zweck: publishedAt kam von TED bei jeder
 * Bekanntmachung an und war trotzdem bei allen 475 leer, weil das Datumsformat
 * nicht geparst wurde. Eine reine Vorhandenseinspruefung haette das nie
 * gezeigt - und eine Stichprobe von einer Bekanntmachung meldet umgekehrt
 * jedes optionale Feld faelschlich als fehlend.
 */
const IST_BRAUCHBAR = {
  id: (n) => Boolean(n.id),
  publishedAt: (n) => Boolean(n.publishedAt),
  title: (n) => n.title !== '(ohne Titel)',
  buyer: (n) => Boolean(n.buyer),
  buyerCity: (n) => Boolean(n.buyerCity),
  country: (n) => Boolean(n.country),
  cpv: (n) => n.cpv.length > 0,
  deadline: (n) => Boolean(n.deadline),
  value: (n) => n.valueEur != null,
  nuts: (n) => n.nuts.length > 0,
  // Die URL faellt notfalls auf eine aus der Kennung gebaute Adresse zurueck.
  // Genau die zaehlt hier nicht als brauchbar, sonst blieben kaputte Links
  // unsichtbar.
  links: (n, schema) => Boolean(n.url) && n.url !== `${schema.noticeUrl}${encodeURIComponent(n.id)}`,
};

export function fieldReport(rawList, schema = DEFAULT_TED_SCHEMA) {
  const raws = (rawList ?? []).filter((raw) => raw && typeof raw === 'object');
  const rows = [];

  for (const [key, api] of Object.entries(schema.fields)) {
    let delivered = 0;
    let usable = 0;
    let sample = null;

    for (const raw of raws) {
      const value = raw[api] ?? raw[key] ?? null;
      if (value == null) continue;
      delivered += 1;
      if (sample == null) sample = value;

      const notice = normalizeNotice(raw, schema);
      if (notice && (IST_BRAUCHBAR[key] ?? (() => true))(notice, schema)) usable += 1;
    }

    rows.push({ key, api, delivered, usable, total: raws.length, sample });
  }
  return rows;
}

/** Liste normalisieren, unbrauchbare Datensaetze still verwerfen und zaehlen. */
export function normalizeAll(rawList, schema = DEFAULT_TED_SCHEMA) {
  const notices = [];
  let skipped = 0;
  for (const raw of rawList ?? []) {
    const notice = normalizeNotice(raw, schema);
    if (notice) notices.push(notice);
    else skipped += 1;
  }
  return { notices, skipped };
}
