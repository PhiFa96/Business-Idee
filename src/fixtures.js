// Laden der Testdaten.
//
// Fixtures enthalten Datumsangaben als relative Platzhalter ({{today-4}},
// {{today+24}}) statt fester Daten. Sonst wuerden sie mit der Zeit aus jedem
// Zeitfilter herausfallen und die Demo wuerde eines Tages "0 Treffer" zeigen,
// ohne dass sich am Code etwas geaendert haette.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const FIXTURE_DIR = 'fixtures';

export function materialize(text, now = new Date()) {
  return text.replace(/\{\{today([+-]\d+)?\}\}/g, (_, offset) => {
    const days = offset ? Number(offset) : 0;
    return new Date(now.getTime() + days * 86400000).toISOString();
  });
}

export async function loadFixture(slug, { now = new Date(), dir = FIXTURE_DIR } = {}) {
  const candidates = [join(dir, `ted-${slug}.json`), join(dir, 'ted-sample.json')];
  for (const path of candidates) {
    try {
      const raw = await readFile(path, 'utf8');
      const payload = JSON.parse(materialize(raw, now));
      return Array.isArray(payload) ? payload : (payload.notices ?? []);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  throw new Error(`Keine Fixture-Datei fuer "${slug}" gefunden (erwartet ${candidates.join(' oder ')}).`);
}
