import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAll } from '../src/normalize.js';
import { filterNotices, alertable, scoreNotice, summarize, median, daysUntil } from '../src/filter.js';
import { loadFixture } from '../src/fixtures.js';
import { loadNiche } from '../src/config.js';

const NOW = new Date('2026-07-25T09:00:00Z');
const niche = await loadNiche('gebaeudereinigung');
const edge = normalizeAll(await loadFixture('edgecases', { now: NOW })).notices;
const byId = (list, id) => list.find((n) => n.id === id);

test('Hartfilter wirft falsches Land, fremde CPV und Ausschluss-Stichwoerter weg', () => {
  const { notices, stats } = filterNotices(edge, niche, { now: NOW });
  assert.equal(stats.wrongCountry, 1, 'Salzburg');
  assert.equal(stats.noCpvMatch, 1, 'Buerostuehle');
  assert.equal(stats.excluded, 1, 'Winterdienst');
  assert.equal(byId(notices, '00900008-2026'), undefined);
  assert.equal(byId(notices, '00900010-2026'), undefined);
  assert.equal(byId(notices, '00900009-2026'), undefined);
});

test('Praefix-Treffer bleibt erhalten, wird aber schlechter bewertet als exakter Treffer', () => {
  const { notices } = filterNotices(edge, niche, { now: NOW });
  const exact = byId(notices, '00900001-2026');
  const prefixOnly = byId(notices, '00900011-2026');
  assert.ok(prefixOnly, 'Praefix-Treffer wird nicht verworfen');
  assert.ok(exact.score > prefixOnly.score, `${exact.score} > ${prefixOnly.score}`);
});

test('fehlende Frist und fehlender Wert kosten Punkte, werfen aber nicht raus', () => {
  const { notices } = filterNotices(edge, niche, { now: NOW });
  const complete = byId(notices, '00900001-2026');
  const sparse = byId(notices, '00900006-2026');
  assert.ok(sparse, 'unvollstaendige Bekanntmachung bleibt im Archiv');
  assert.ok(complete.score > sparse.score);
});

test('Ergebnisse sind nach Score sortiert', () => {
  const { notices } = filterNotices(edge, niche, { now: NOW });
  const scores = notices.map((n) => n.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test('maxAgeDays filtert zu alte Bekanntmachungen', () => {
  const { stats } = filterNotices(edge, niche, { now: NOW, maxAgeDays: 10 });
  assert.ok(stats.tooOld > 0, 'die 40 Tage alte Bekanntmachung faellt raus');
});

test('alertable nimmt nur, was relevant genug und fristgerecht ist', () => {
  const { notices } = filterNotices(edge, niche, { now: NOW });
  const selection = alertable(notices, niche, NOW);
  assert.equal(byId(selection, '00900007-2026'), undefined, 'abgelaufene Frist gehoert nicht in den Alert');
  assert.ok(byId(selection, '00900001-2026'), 'der Normalfall schon');
  for (const notice of selection) assert.ok(notice.score >= niche.minScore);
});

test('Bekanntmachung ohne Frist bleibt im Alert - unbekannt ist nicht abgelaufen', () => {
  const { notices } = filterNotices(edge, niche, { now: NOW });
  const withoutDeadline = byId(notices, '00900006-2026');
  const selection = alertable([withoutDeadline], { ...niche, minScore: 0 }, NOW);
  assert.equal(selection.length, 1);
});

test('scoreNotice bleibt in den Grenzen 0 bis 100', () => {
  for (const notice of edge) {
    const score = scoreNotice(notice, niche, NOW);
    assert.ok(score >= 0 && score <= 100, `${notice.id}: ${score}`);
  }
});

test('der bestmoegliche Treffer erreicht genau 100, ohne an der Deckelung zu haengen', () => {
  // Sichert die Balance der Gewichte ab: summierten sie sich auf mehr als 100,
  // wuerden oben alle guten Treffer gleich aussehen und der Score waere blind.
  const perfect = {
    id: 'p', cpv: ['90911200'], valueEur: 500000, buyer: 'Stadt X',
    deadline: new Date(NOW.getTime() + 30 * 86400000).toISOString(), nuts: ['DEA51'],
  };
  assert.equal(scoreNotice(perfect, { ...niche, nuts: ['DEA'] }, NOW), 100);
  assert.equal(scoreNotice(perfect, { ...niche, nuts: [] }, NOW), 95, 'ohne Regionswunsch bleibt Luft nach oben');
});

test('nuts-Filter der Nische hebt passende Regionen an', () => {
  const notice = edge.find((n) => n.id === '00900001-2026');
  const neutral = scoreNotice(notice, { ...niche, nuts: [] }, NOW);
  const matching = scoreNotice(notice, { ...niche, nuts: ['DEA'] }, NOW);
  assert.ok(matching > neutral);
});

test('median und daysUntil verhalten sich bei Luecken vernuenftig', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([null, undefined, NaN]), null);
  assert.equal(median([]), null);
  assert.equal(daysUntil(null), null);
  assert.equal(daysUntil('kein Datum'), null);
  assert.equal(Math.round(daysUntil('2026-07-30T09:00:00Z', NOW)), 5);
});

test('summarize liefert die Kennzahlen, auf denen die Abbruchentscheidung beruht', () => {
  const { notices } = filterNotices(edge, niche, { now: NOW });
  const summary = summarize(notices, niche, { days: 90, now: NOW });
  assert.equal(summary.slug, 'gebaeudereinigung');
  assert.ok(summary.usable <= summary.total);
  assert.equal(summary.perMonth, Number(((summary.usable / 90) * 30).toFixed(1)));
});

test('echte Nischen-Fixtures ergeben die erwartete Rangfolge', async () => {
  // Metallbau ist bewusst duenn bestueckt - genau der Effekt, den die Analyse
  // vorhergesagt hat (Auftraege unterhalb der EU-Schwellenwerte fehlen in TED).
  const ranking = [];
  for (const slug of ['gebaeudereinigung', 'galabau', 'elektro-shk', 'metallbau']) {
    const config = await loadNiche(slug);
    const raw = await loadFixture(slug, { now: NOW });
    const { notices } = filterNotices(normalizeAll(raw).notices, config, { now: NOW, maxAgeDays: 90 });
    ranking.push({ slug, usable: summarize(notices, config, { days: 90, now: NOW }).usable });
  }
  ranking.sort((a, b) => b.usable - a.usable);
  assert.equal(ranking[0].slug, 'gebaeudereinigung');
  assert.equal(ranking.at(-1).slug, 'metallbau');
});
