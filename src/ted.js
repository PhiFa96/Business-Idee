// Client fuer die TED Search API v3 (Tenders Electronic Daily der EU).
// Keine externen Abhaengigkeiten - nutzt das globale fetch aus Node >= 22.
//
// ACHTUNG, BEWUSSTE ENTSCHEIDUNG:
// Die exakten Feldnamen der TED-API konnten beim Bau nicht gegen die Live-API
// geprueft werden, weil der Host in der Build-Umgebung durch eine Egress-Policy
// gesperrt war. Alle Namen stehen deshalb ausschliesslich in DEFAULT_TED_SCHEMA
// und lassen sich ohne Codeaenderung ueber config/ted-schema.json ueberschreiben.
// `node bin/radar.js doctor` schickt eine Minimal-Abfrage und gibt die
// Validierungsmeldung der API im Klartext aus - damit ist eine Korrektur eine
// Sache von einer Minute statt einer Fehlersuche.

export class TedError extends Error {
  /** @param {string} kind  network | blocked | auth | query | rate | server | parse */
  constructor(kind, message, detail = null) {
    super(message);
    this.name = 'TedError';
    this.kind = kind;
    this.detail = detail;
  }
}

export const DEFAULT_TED_SCHEMA = {
  endpoint: 'https://api.ted.europa.eu/v3/notices/search',
  // Detailseite einer Bekanntmachung; die Publication-Number wird angehaengt.
  noticeUrl: 'https://ted.europa.eu/de/notice/-/detail/',
  // Felder, die wir von der API anfordern. Schluessel = unser internes Modell.
  fields: {
    id: 'publication-number',
    publishedAt: 'publication-date',
    title: 'notice-title',
    buyer: 'buyer-name',
    buyerCity: 'buyer-city',
    country: 'buyer-country',
    cpv: 'classification-cpv',
    deadline: 'deadline-receipt-request',
    value: 'total-value',
    nuts: 'place-of-performance',
    links: 'links',
  },
  // Feldnamen, wie sie in der Expert-Query-Syntax verwendet werden.
  query: {
    cpv: 'classification-cpv',
    country: 'buyer-country',
    date: 'publication-date',
  },
  // Sprachreihenfolge fuer mehrsprachige Felder.
  languages: ['deu', 'ger', 'de', 'eng', 'en'],
};

/** Tiefes Zusammenfuehren von Default-Schema und optionalem Override. */
export function mergeSchema(override) {
  if (!override || typeof override !== 'object') return structuredClone(DEFAULT_TED_SCHEMA);
  const base = structuredClone(DEFAULT_TED_SCHEMA);
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key]) {
      base[key] = { ...base[key], ...value };
    } else if (value !== undefined) {
      base[key] = value;
    }
  }
  return base;
}

/** yyyymmdd - das Format, das die TED-Expert-Query fuer Datumsvergleiche erwartet. */
export function tedDate(date) {
  const iso = date.toISOString().slice(0, 10);
  return iso.replaceAll('-', '');
}

/**
 * Baut die Expert-Query fuer ein Gewerk.
 * Beispiel: classification-cpv IN (90910000 90911200) AND buyer-country IN (DEU)
 *           AND publication-date >= 20260101
 */
export function buildQuery(niche, { days = 30, now = new Date(), schema = DEFAULT_TED_SCHEMA } = {}) {
  const codes = [...new Set([...(niche.cpv ?? [])])];
  if (codes.length === 0) {
    throw new TedError('query', `Nische "${niche.slug}" hat keine CPV-Codes in der Config.`);
  }
  const from = new Date(now.getTime() - days * 86400000);
  const parts = [
    `${schema.query.cpv} IN (${codes.join(' ')})`,
    `${schema.query.country} IN (${niche.country ?? 'DEU'})`,
    `${schema.query.date} >= ${tedDate(from)}`,
  ];
  return parts.join(' AND ');
}

// Ein 403 kommt in der Praxis fast nie von TED selbst, sondern von einem
// Firmen-Proxy davor. Die Unterscheidung steht im Antworttext - und sie ist
// wichtig, weil die beiden Faelle voellig verschiedene Gegenmassnahmen haben.
const PROXY_MARKERS = /allowlist|egress|not in allow|blocked by|proxy|gateway|forbidden by policy/i;

function classifyStatus(status, body) {
  if (status === 403 && PROXY_MARKERS.test(String(body ?? ''))) {
    return new TedError('blocked', 'Nicht TED, sondern ein Proxy oder eine Netzwerk-Policy hat die Anfrage abgewiesen (HTTP 403).', body);
  }
  if (status === 401 || status === 403) return new TedError('auth', `TED lehnt die Anfrage ab (HTTP ${status}).`, body);
  if (status === 400 || status === 422) return new TedError('query', `TED hat die Abfrage als ungueltig zurueckgewiesen (HTTP ${status}). Meist stimmt ein Feldname in config/ted-schema.json nicht.`, body);
  if (status === 429) return new TedError('rate', 'TED drosselt (HTTP 429). Zu viele Anfragen in kurzer Zeit.', body);
  if (status >= 500) return new TedError('server', `TED antwortet mit einem Serverfehler (HTTP ${status}).`, body);
  return new TedError('server', `Unerwarteter HTTP-Status ${status} von TED.`, body);
}

function classifyNetworkError(err) {
  const text = String(err?.message ?? err);
  if (/CONNECT tunnel failed|403|proxy/i.test(text)) {
    return new TedError('blocked', 'Die Verbindung zu TED wurde von einem Proxy oder einer Netzwerk-Policy blockiert.', text);
  }
  return new TedError('network', 'TED ist nicht erreichbar (Netzwerkfehler).', text);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Eine Seite Suchergebnisse holen. Wiederholt bei 429 und 5xx mit wachsender
 * Wartezeit; alles andere wird sofort als TedError geworfen.
 */
export async function fetchPage({
  query,
  page = 1,
  limit = 100,
  schema = DEFAULT_TED_SCHEMA,
  apiKey = process.env.TED_API_KEY,
  fetchImpl = globalThis.fetch,
  maxRetries = 4,
  onRetry = () => {},
} = {}) {
  const body = {
    query,
    fields: Object.values(schema.fields),
    page,
    limit,
    scope: 'ALL',
    paginationMode: 'PAGE_NUMBER',
  };
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetchImpl(schema.endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (err) {
      throw classifyNetworkError(err);
    }

    if (response.ok) {
      let json;
      try {
        json = await response.json();
      } catch (err) {
        throw new TedError('parse', 'TED hat keine gueltige JSON-Antwort geliefert.', String(err));
      }
      return json;
    }

    const text = await response.text().catch(() => '');
    const error = classifyStatus(response.status, text.slice(0, 2000));
    const retriable = error.kind === 'rate' || error.kind === 'server';
    if (!retriable || attempt >= maxRetries) throw error;

    const retryAfter = Number(response.headers?.get?.('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
    onRetry({ attempt: attempt + 1, waitMs, kind: error.kind });
    await sleep(waitMs);
  }
}

/** Liest die Notice-Liste aus der Antwort, egal wie der Umschlag heisst. */
export function extractNotices(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['notices', 'results', 'content', 'items']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

export function extractTotal(payload, fallback) {
  for (const key of ['totalNoticeCount', 'totalCount', 'total', 'totalElements']) {
    const value = payload?.[key];
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

/** Alle Seiten einer Abfrage holen, bis maxPages oder keine Treffer mehr kommen. */
export async function fetchAll(options) {
  const { limit = 100, maxPages = 10, onPage = () => {} } = options;
  const collected = [];
  let total = null;

  for (let page = 1; page <= maxPages; page++) {
    const payload = await fetchPage({ ...options, page, limit });
    const notices = extractNotices(payload);
    total = extractTotal(payload, total);
    collected.push(...notices);
    onPage({ page, received: notices.length, collected: collected.length, total });
    if (notices.length < limit) break;
  }

  return { notices: collected, total: total ?? collected.length };
}
