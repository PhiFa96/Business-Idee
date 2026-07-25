// Zustand als JSON-Datei im Repo - kein Server, keine Datenbank.
//
// Das Repo ist der Speicher: der taegliche Workflow committet data/seen-*.json
// zurueck. Bei 2-200 Abonnenten traegt das ohne jede Aenderung, und es hat den
// angenehmen Nebeneffekt, dass die Historie in der Git-Historie steht.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const DATA_DIR = 'data';

export function storePath(slug, dataDir = DATA_DIR) {
  return join(dataDir, `seen-${slug}.json`);
}

export async function loadStore(slug, dataDir = DATA_DIR) {
  try {
    const raw = await readFile(storePath(slug, dataDir), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      slug,
      firstSeen: parsed.firstSeen ?? {},
      notices: parsed.notices ?? {},
      lastRun: parsed.lastRun ?? null,
    };
  } catch (err) {
    if (err.code === 'ENOENT') return { slug, firstSeen: {}, notices: {}, lastRun: null };
    // Kaputter Zustand darf den Lauf nicht blockieren, aber er muss auffallen.
    throw new Error(`Zustandsdatei ${storePath(slug, dataDir)} ist unlesbar: ${err.message}`);
  }
}

export async function saveStore(store, dataDir = DATA_DIR) {
  const path = storePath(store.slug, dataDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  return path;
}

/**
 * Trennt neu von bereits gesehen und aktualisiert den Zustand.
 * Der Alert enthaelt nur Neues - genau das ist der Grund, warum jemand ihn
 * taeglich oeffnet statt ihn zu ignorieren.
 */
export function diffAndRecord(store, notices, now = new Date()) {
  const stamp = now.toISOString();
  const fresh = [];

  for (const notice of notices) {
    if (!store.firstSeen[notice.id]) {
      store.firstSeen[notice.id] = stamp;
      fresh.push(notice);
    }
    store.notices[notice.id] = notice;
  }

  store.lastRun = stamp;
  return fresh;
}

/**
 * Alle je gesehenen Bekanntmachungen, neueste zuerst.
 *
 * Jeder Eintrag bekommt firstSeenAt mitgegeben - den Zeitpunkt der ersten
 * eigenen Sichtung. Der ist immer vorhanden, auch wenn TED kein
 * Veroeffentlichungsdatum liefert, und dient ueberall dort als Rueckfallwert,
 * wo sonst still etwas ausfaellt (Sortierung, Freemium-Verzoegerung).
 */
export function archiveOf(store) {
  return Object.values(store.notices)
    .map((notice) => ({ ...notice, firstSeenAt: store.firstSeen[notice.id] ?? null }))
    .sort((a, b) =>
      String(b.publishedAt ?? b.firstSeenAt ?? '').localeCompare(String(a.publishedAt ?? a.firstSeenAt ?? '')),
    );
}

/**
 * Haelt die Zustandsdatei in Grenzen. Der Default liegt bei drei Jahren, nicht
 * bei einem: Abgelaufene Ausschreibungen sind fuer den Abonnenten wertlos,
 * stellen aber die Masse der indexierbaren Seiten und die Datengrundlage der
 * Auftraggeber-Profile. Wer sie wegraeumt, loescht den Mehrwert.
 */
export function prune(store, { keepDays = 1100, now = new Date() } = {}) {
  const cutoff = now.getTime() - keepDays * 86400000;
  let removed = 0;
  for (const [id, notice] of Object.entries(store.notices)) {
    const stamp = notice.publishedAt ?? store.firstSeen[id];
    if (stamp && new Date(stamp).getTime() < cutoff) {
      delete store.notices[id];
      delete store.firstSeen[id];
      removed += 1;
    }
  }
  return removed;
}
