// Hartfilter und Relevanz-Score.
//
// Trennung mit Absicht: Der Hartfilter wirft weg, was fachlich nicht zur Nische
// gehoert. Der Score sortiert nur noch, was uebrig bleibt. So bleibt
// nachvollziehbar, WARUM eine Ausschreibung im Alert steht - das ist die Frage,
// die ein Abonnent stellt, bevor er kuendigt.

export const DEFAULT_MIN_SCORE = 50;

export function daysUntil(isoDate, now = new Date()) {
  if (!isoDate) return null;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return null;
  return (target.getTime() - now.getTime()) / 86400000;
}

function matchesCpv(notice, niche) {
  const exact = notice.cpv.filter((code) => (niche.cpv ?? []).includes(code));
  const prefix = notice.cpv.filter(
    (code) => (niche.cpvPrefixes ?? []).some((p) => code.startsWith(p)) && !exact.includes(code),
  );
  return { exact, prefix };
}

function hitsExcludeKeyword(notice, niche) {
  const haystack = `${notice.title ?? ''} ${notice.buyer ?? ''}`.toLowerCase();
  return (niche.excludeKeywords ?? []).find((word) => haystack.includes(String(word).toLowerCase())) ?? null;
}

/**
 * Relevanz 0..100. Die Gewichte sind bewusst grob - sie sollen sortieren,
 * nicht so tun, als waere Relevanz exakt messbar.
 *
 * Die Einzelgewichte summieren sich auf exakt 100 (40+20+20+15+5). Das ist
 * kein Zufall: waeren es mehr, wuerde die Deckelung am oberen Ende genau die
 * Unterschiede verschlucken, die der Score treffen soll - alle guten Treffer
 * saehen gleich gut aus. Wer hier ein Gewicht aendert, muss ein anderes senken.
 */
const WEIGHTS = {
  cpvExact: 40,
  cpvPrefix: 20,
  valueInRange: 20,
  valueAboveMin: 10,
  valueUnknown: 8,
  deadlineComfortable: 20,
  deadlineTight: 5,
  deadlineUnknown: 5,
  regionMatch: 15,
  regionNoPreference: 10,
  buyerKnown: 5,
};

export function scoreNotice(notice, niche, now = new Date()) {
  const { exact, prefix } = matchesCpv(notice, niche);
  let score = 0;

  if (exact.length > 0) score += WEIGHTS.cpvExact;
  else if (prefix.length > 0) score += WEIGHTS.cpvPrefix;

  const min = niche.minValueEur ?? 0;
  const max = niche.maxValueEur ?? Number.POSITIVE_INFINITY;
  if (notice.valueEur == null) score += WEIGHTS.valueUnknown; // Unbekannt ist nicht schlecht, nur unbekannt.
  else if (notice.valueEur >= min && notice.valueEur <= max) score += WEIGHTS.valueInRange;
  else if (notice.valueEur >= min) score += WEIGHTS.valueAboveMin;

  const remaining = daysUntil(notice.deadline, now);
  const minDays = niche.minDaysToDeadline ?? 10;
  if (remaining == null) score += WEIGHTS.deadlineUnknown;
  else if (remaining >= minDays) score += WEIGHTS.deadlineComfortable;
  else if (remaining > 0) score += WEIGHTS.deadlineTight; // Zu knapp zum Kalkulieren, aber nicht wertlos.

  const wanted = niche.nuts ?? [];
  if (wanted.length === 0) score += WEIGHTS.regionNoPreference;
  else if (notice.nuts.some((code) => wanted.some((w) => code.startsWith(w)))) score += WEIGHTS.regionMatch;

  if (notice.buyer) score += WEIGHTS.buyerKnown;

  return Math.max(0, Math.min(100, score));
}

/**
 * Wendet Hartfilter an und ergaenzt score/matchedCpv.
 * Gibt zusaetzlich eine Statistik zurueck, damit `scan` erklaeren kann, warum
 * eine Nische wenig Treffer hat - "0 Ergebnisse" ohne Grund ist wertlos.
 */
export function filterNotices(notices, niche, { now = new Date(), maxAgeDays = null } = {}) {
  const stats = { input: notices.length, wrongCountry: 0, noCpvMatch: 0, excluded: 0, tooOld: 0, kept: 0 };
  const kept = [];

  for (const notice of notices) {
    if (niche.country && notice.country && notice.country.toUpperCase() !== niche.country.toUpperCase()) {
      stats.wrongCountry += 1;
      continue;
    }

    const { exact, prefix } = matchesCpv(notice, niche);
    if (exact.length === 0 && prefix.length === 0) {
      stats.noCpvMatch += 1;
      continue;
    }

    if (hitsExcludeKeyword(notice, niche)) {
      stats.excluded += 1;
      continue;
    }

    if (maxAgeDays != null && notice.publishedAt) {
      const ageDays = (now.getTime() - new Date(notice.publishedAt).getTime()) / 86400000;
      if (ageDays > maxAgeDays) {
        stats.tooOld += 1;
        continue;
      }
    }

    kept.push({ ...notice, matchedCpv: [...exact, ...prefix], score: scoreNotice(notice, niche, now) });
  }

  kept.sort((a, b) => b.score - a.score || String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')));
  stats.kept = kept.length;
  return { notices: kept, stats };
}

/** Was tatsaechlich in die Alert-Mail geht: relevant genug und Frist noch offen. */
export function alertable(notices, niche, now = new Date()) {
  const minScore = niche.minScore ?? DEFAULT_MIN_SCORE;
  const minDays = niche.minDaysToDeadline ?? 10;
  return notices.filter((notice) => {
    if (notice.score < minScore) return false;
    const remaining = daysUntil(notice.deadline, now);
    return remaining == null || remaining >= minDays;
  });
}

export function median(values) {
  const numbers = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (numbers.length === 0) return null;
  const mid = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[mid] : (numbers[mid - 1] + numbers[mid]) / 2;
}

/** Kennzahlen, auf denen die Nischenauswahl und die Abbruchentscheidung beruhen. */
export function summarize(notices, niche, { days, now = new Date() } = {}) {
  const usable = alertable(notices, niche, now);
  return {
    slug: niche.slug,
    name: niche.name,
    total: notices.length,
    usable: usable.length,
    perMonth: days ? Number(((usable.length / days) * 30).toFixed(1)) : null,
    medianValueEur: median(notices.map((n) => n.valueEur)),
    withValue: notices.filter((n) => n.valueEur != null).length,
    withDeadline: notices.filter((n) => n.deadline != null).length,
  };
}
