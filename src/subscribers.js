// Abonnentenliste mit Einwilligungsnachweis.
//
// Der rechtlich entscheidende Teil ist nicht die Adresse, sondern der Beleg
// daneben: wann, ueber welche Seite und mit welchem Wortlaut jemand zugestimmt
// hat. Im Streitfall muss die Einwilligung nachweisbar sein - ohne Zeitpunkt,
// Quelle und Wortlaut ist sie es nicht.
//
// Speicher bleibt eine JSON-Datei. Bei zweistelliger Abonnentenzahl ist jede
// Datenbank Overhead; wird es unuebersichtlich, ist das ein gutes Problem.

import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const CONFIG_DIR = 'config';
export const SUBSCRIBERS_FILE = 'subscribers.json';

export const WORTLAUT_ALERT = 'Ich möchte den täglichen Ausschreibungs-Alert per E-Mail erhalten.';
export const WORTLAUT_DIGEST = 'Ich möchte den wöchentlichen Gratis-Überblick per E-Mail erhalten.';

export const STATUS = { PENDING: 'wartet_auf_bestaetigung', ACTIVE: 'aktiv', REMOVED: 'abgemeldet' };
export const PLAN = { FREE: 'digest', PAID: 'alert' };

const isEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Migriert das alte Format (reine Adressliste) auf Objekte.
 * Wichtig: Altbestaende bekommen KEINE Bestaetigung untergeschoben - sie
 * landen als "wartet_auf_bestaetigung", weil ein Nachweis nicht existiert.
 * Lieber eine unbequeme Liste als ein erfundener Beleg.
 */
export function migrateEntry(entry, slug) {
  if (typeof entry === 'string') {
    if (!isEmail(entry)) return null;
    return {
      email: normalizeEmail(entry),
      nische: slug,
      plan: PLAN.PAID,
      quelle: 'Altbestand vor Einfuehrung der Einwilligungsdokumentation',
      wortlaut: null,
      angemeldet: null,
      bestaetigt: null,
      token: randomUUID(),
      status: STATUS.PENDING,
    };
  }
  if (!entry || !isEmail(entry.email)) return null;
  return {
    email: normalizeEmail(entry.email),
    nische: entry.nische ?? slug,
    plan: entry.plan ?? PLAN.PAID,
    quelle: entry.quelle ?? null,
    wortlaut: entry.wortlaut ?? null,
    angemeldet: entry.angemeldet ?? null,
    bestaetigt: entry.bestaetigt ?? null,
    token: entry.token ?? randomUUID(),
    status: entry.status ?? STATUS.PENDING,
    kanal: entry.kanal ?? undefined,
    notiz: entry.notiz ?? undefined,
  };
}

/**
 * Laedt die Liste - bevorzugt aus der Umgebungsvariablen SUBSCRIBERS_JSON.
 *
 * Grund: Das Repository ist oeffentlich, damit GitHub Pages kostenlos bleibt.
 * E-Mail-Adressen und Einwilligungsnachweise duerfen dort nicht liegen.
 * GitHub-Secrets sind auch in oeffentlichen Repositories privat, also kommt
 * die Liste im Betrieb von dort und nur lokal aus der Datei.
 */
export async function loadAll(dir = CONFIG_DIR, { env = process.env } = {}) {
  let raw = {};

  if (env.SUBSCRIBERS_JSON) {
    try {
      raw = JSON.parse(env.SUBSCRIBERS_JSON);
    } catch (err) {
      // Ein kaputtes Secret darf den taeglichen Lauf nicht abbrechen - sonst
      // faellt auch der Abruf und der Seitenbau aus. Lieber ohne Empfaenger
      // weiterlaufen und laut meckern.
      console.error(`! SUBSCRIBERS_JSON ist kein gueltiges JSON (${err.message}) - es wird niemand angeschrieben.`);
      return {};
    }
  } else {
    try {
      raw = JSON.parse(await readFile(join(dir, SUBSCRIBERS_FILE), 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`${SUBSCRIBERS_FILE} ist unlesbar: ${err.message}`);
    }
  }

  const out = {};
  for (const [slug, list] of Object.entries(raw)) {
    if (slug.startsWith('_') || !Array.isArray(list)) continue;
    out[slug] = list.map((entry) => migrateEntry(entry, slug)).filter(Boolean);
  }
  return out;
}

export async function saveAll(all, dir = CONFIG_DIR, { env = process.env } = {}) {
  const payload = {
    _kommentar:
      'Abonnenten je Nische mit Einwilligungsnachweis. Diese Datei ist bewusst NICHT im Repository ' +
      '(.gitignore) - das Repo ist oeffentlich. Im Betrieb kommt die Liste aus dem Secret ' +
      'SUBSCRIBERS_JSON. Eintraege niemals von Hand auf "aktiv" setzen, ohne dass eine echte ' +
      'Bestaetigung vorliegt - der Nachweis ist der einzige Schutz im Streitfall.',
    ...all,
  };
  await writeFile(join(dir, SUBSCRIBERS_FILE), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  // Wer aus dem Secret gelesen hat, aendert mit saveAll nur die lokale Kopie.
  // Ohne diesen Hinweis glaubt man, der Kunde sei eingetragen - und wundert
  // sich, warum der naechste Lauf ihn nicht kennt.
  if (env.SUBSCRIBERS_JSON) {
    console.error('! Gelesen wurde aus SUBSCRIBERS_JSON, geschrieben nur in die lokale Datei.');
    console.error('  Damit die Aenderung wirkt, den Inhalt in das Secret SUBSCRIBERS_JSON uebertragen.');
  }
}

/** Nur wer bestaetigt hat, bekommt Post. */
export function activeOf(all, slug, plan = null) {
  return (all[slug] ?? []).filter(
    (entry) => entry.status === STATUS.ACTIVE && entry.bestaetigt && (plan == null || entry.plan === plan),
  );
}

export function findEntry(all, slug, email) {
  const wanted = normalizeEmail(email);
  return (all[slug] ?? []).find((entry) => entry.email === wanted) ?? null;
}

/**
 * Anmeldung vormerken. Erzeugt noch keine Berechtigung zum Versand - dafuer
 * braucht es confirm().
 */
export function addPending(all, slug, { email, quelle, plan = PLAN.PAID, wortlaut = null, kanal = 'web', now = new Date() }) {
  if (!isEmail(email)) throw new Error(`"${email}" ist keine gueltige E-Mail-Adresse.`);
  all[slug] ??= [];

  const existing = findEntry(all, slug, email);
  if (existing && existing.status === STATUS.ACTIVE) return { entry: existing, created: false };

  const entry = {
    email: normalizeEmail(email),
    nische: slug,
    plan,
    quelle: quelle ?? null,
    wortlaut: wortlaut ?? (plan === PLAN.PAID ? WORTLAUT_ALERT : WORTLAUT_DIGEST),
    angemeldet: now.toISOString(),
    bestaetigt: null,
    token: randomUUID(),
    status: STATUS.PENDING,
    kanal,
  };

  if (existing) Object.assign(existing, entry);
  else all[slug].push(entry);

  return { entry: findEntry(all, slug, email), created: !existing };
}

/**
 * Bestaetigung. Ueber den Token, weil nur der beweist, dass die Zustimmung vom
 * Inhaber des Postfachs kam. `kanal: 'telefon'` erlaubt die dokumentierte
 * muendliche Zustimmung - dann ist die Notiz Pflicht.
 */
export function confirm(all, slug, { email, token = null, kanal = 'web', notiz = null, now = new Date() }) {
  const entry = findEntry(all, slug, email);
  if (!entry) throw new Error(`${email} ist fuer "${slug}" nicht vorgemerkt.`);
  if (kanal === 'web' && entry.token !== token) throw new Error('Der Bestaetigungs-Token passt nicht.');
  if (kanal !== 'web' && !notiz) throw new Error('Eine Bestaetigung ausserhalb des Webformulars braucht eine Notiz als Nachweis.');

  entry.bestaetigt = now.toISOString();
  entry.status = STATUS.ACTIVE;
  entry.kanal = kanal;
  if (notiz) entry.notiz = notiz;
  return entry;
}

/** Abmeldung muss sofort und dauerhaft wirken. */
export function remove(all, slug, email, { now = new Date() } = {}) {
  const entry = findEntry(all, slug, email);
  if (!entry) return null;
  entry.status = STATUS.REMOVED;
  entry.bestaetigt = null;
  entry.abgemeldet = now.toISOString();
  return entry;
}

export function findByToken(all, token) {
  for (const [slug, list] of Object.entries(all)) {
    const entry = list.find((candidate) => candidate.token === token);
    if (entry) return { slug, entry };
  }
  return null;
}

export function stats(all) {
  const rows = [];
  for (const [slug, list] of Object.entries(all)) {
    rows.push({
      slug,
      gesamt: list.length,
      aktiv: list.filter((e) => e.status === STATUS.ACTIVE).length,
      wartend: list.filter((e) => e.status === STATUS.PENDING).length,
      abgemeldet: list.filter((e) => e.status === STATUS.REMOVED).length,
      zahlend: list.filter((e) => e.status === STATUS.ACTIVE && e.plan === PLAN.PAID).length,
    });
  }
  return rows;
}
