import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickLang, asCpvList, asMoneyEur, asNuts, asDate, fieldReport, normalizeNotice, normalizeAll } from '../src/normalize.js';
import { loadFixture } from '../src/fixtures.js';

const NOW = new Date('2026-07-25T09:00:00Z');

test('pickLang bevorzugt Deutsch, faellt sonst auf Englisch zurueck', () => {
  assert.equal(pickLang({ deu: ['Reinigung'], eng: ['Cleaning'] }), 'Reinigung');
  assert.equal(pickLang({ eng: ['Cleaning'] }), 'Cleaning');
  assert.equal(pickLang({ fra: ['Nettoyage'] }), 'Nettoyage', 'unbekannte Sprache ist besser als nichts');
  assert.equal(pickLang('direkt'), 'direkt');
  assert.equal(pickLang(null), null);
  assert.equal(pickLang({ deu: [''] }), null, 'leerer String zaehlt nicht als Treffer');
});

test('asCpvList schneidet den Pruefziffernsuffix ab und entdoppelt', () => {
  assert.deepEqual(asCpvList(['90911200-8', '90911200', '90919200-4']), ['90911200', '90919200']);
  assert.deepEqual(asCpvList({ code: '77314000-4' }), ['77314000']);
  assert.deepEqual(asCpvList('keine Zahl'), []);
  assert.deepEqual(asCpvList(null), []);
});

test('asMoneyEur versteht Zahl, deutschen und englischen String sowie Objekte', () => {
  assert.equal(asMoneyEur(2400000), 2400000);
  assert.equal(asMoneyEur('1.234.567,89 EUR'), 1234567.89);
  assert.equal(asMoneyEur('1234567.89'), 1234567.89);
  assert.equal(asMoneyEur({ amount: 500, currency: 'EUR' }), 500);
  assert.equal(asMoneyEur(null), null);
  assert.equal(asMoneyEur('keine Zahl'), null);
});

test('asMoneyEur rechnet Fremdwaehrung NICHT um, sondern liefert null', () => {
  // Ein geschaetzter Wechselkurs waere eine erfundene Zahl in einem Feld,
  // nach dem der Kunde filtert. Lieber keine Angabe als eine falsche.
  assert.equal(asMoneyEur({ amount: 900000, currency: 'PLN' }), null);
  assert.equal(asMoneyEur({ amount: 900000, currency: 'chf' }), null);
});

test('asNuts findet deutsche Regionalcodes in verschachtelten Strukturen', () => {
  assert.deepEqual(asNuts({ nuts: ['DEA51'] }), ['DEA51']);
  assert.deepEqual(asNuts({ a: { b: ['DE300', 'DE300'] } }), ['DE300']);
  assert.deepEqual(asNuts(null), []);
});

test('normalizeNotice verwirft Datensaetze ohne Publication-Number', () => {
  assert.equal(normalizeNotice({ 'notice-title': 'ohne Kennung' }), null);
  assert.equal(normalizeNotice(null), null);
  assert.equal(normalizeNotice('kein Objekt'), null);
});

test('normalizeNotice baut eine Detail-URL, wenn keine mitgeliefert wird', () => {
  const notice = normalizeNotice({ 'publication-number': '00412345-2026' });
  assert.match(notice.url, /00412345-2026$/);
});

test('normalizeAll ueberlebt die gesamte Randfall-Sammlung und zaehlt Verworfenes', () => {
  return loadFixture('edgecases', { now: NOW }).then((raw) => {
    const { notices, skipped } = normalizeAll(raw);
    assert.equal(skipped, 1, 'genau der Datensatz ohne Kennung faellt raus');
    assert.equal(notices.length, raw.length - 1);
    for (const notice of notices) {
      assert.ok(notice.id, 'jeder Datensatz hat eine Kennung');
      assert.ok(Array.isArray(notice.cpv));
      assert.ok(typeof notice.title === 'string' && notice.title.length > 0);
    }
  });
});

test('normalizeAll wirft nicht bei kaputter oder leerer Eingabe', () => {
  assert.deepEqual(normalizeAll(null).notices, []);
  assert.deepEqual(normalizeAll([]).notices, []);
  assert.equal(normalizeAll([null, undefined, 42]).skipped, 3);
});

test('asDate versteht die Datumsformate, die TED tatsaechlich liefert', () => {
  // Fristen kommen mit Uhrzeit - das ging immer schon.
  assert.equal(asDate('2026-08-11T07:30:00Z'), '2026-08-11T07:30:00.000Z');

  // Das Veroeffentlichungsdatum nicht. An diesen beiden Formaten blieb
  // publishedAt bei allen 475 Bekanntmachungen leer.
  assert.equal(asDate('20260720'), '2026-07-20T00:00:00.000Z', 'kompaktes Datum');
  assert.equal(asDate('2026-07-20+02:00'), '2026-07-19T22:00:00.000Z', 'Datum mit Zeitzone');
  assert.equal(asDate('2026-07-20-03:00'), '2026-07-20T03:00:00.000Z', 'negativer Offset ist kein Teil des Datums');
  assert.equal(asDate('2026-07-20Z'), '2026-07-20T00:00:00.000Z');

  assert.equal(asDate({ deu: ['20260720'] }), '2026-07-20T00:00:00.000Z', 'auch mehrsprachig verpackt');
  assert.equal(asDate('kein Datum'), null);
  assert.equal(asDate('2026-13-45'), null, 'plausibel geformt, aber unmoeglich');
  assert.equal(asDate(null), null);
});

test('fieldReport trennt "kommt nicht an" von "wird nicht verstanden"', () => {
  const raw = [
    {
      'publication-number': '1-2026',
      'publication-date': '20260720',
      'notice-title': { deu: ['Reinigung A'] },
      'buyer-name': { deu: ['Stadt A'] },
      'classification-cpv': ['90911200'],
      'total-value': 100000,
    },
    {
      'publication-number': '2-2026',
      'publication-date': '20260721',
      'notice-title': { deu: ['Reinigung B'] },
      'buyer-name': { deu: ['Stadt B'] },
      'classification-cpv': ['90911200'],
      // kein total-value: optionales Feld, das bei einer Stichprobe von einer
      // Bekanntmachung faelschlich als Konfigurationsfehler erschienen waere.
    },
  ];
  const rows = fieldReport(raw);
  const von = (key) => rows.find((row) => row.key === key);

  assert.equal(von('publishedAt').delivered, 2);
  assert.equal(von('publishedAt').usable, 2, 'kompaktes Datum wird jetzt verstanden');

  assert.equal(von('value').delivered, 1, 'nur eine der beiden traegt einen Wert');
  assert.equal(von('value').usable, 1);
  assert.equal(von('value').total, 2);

  assert.equal(von('deadline').delivered, 0, 'gar nicht geliefert - das waere ein falscher Feldname');
  assert.equal(von('links').usable, 0, 'die aus der Kennung gebaute URL zaehlt nicht als echter Link');
});

test('fieldReport meldet ein ankommendes, aber unlesbares Feld als unbrauchbar', () => {
  const rows = fieldReport([
    { 'publication-number': '1-2026', 'publication-date': 'letzten Dienstag' },
  ]);
  const datum = rows.find((row) => row.key === 'publishedAt');
  assert.equal(datum.delivered, 1);
  assert.equal(datum.usable, 0);
  assert.equal(datum.sample, 'letzten Dienstag', 'der Rohwert wird zur Diagnose mitgeliefert');
});

test('fieldReport wirft nicht bei kaputter Eingabe', () => {
  assert.equal(fieldReport(null).every((row) => row.total === 0), true);
  assert.equal(fieldReport([null, 42, 'x']).every((row) => row.delivered === 0), true);
});
