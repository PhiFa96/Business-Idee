// Laden und Pruefen der Konfigurationsdateien.
// Eine Nische ist eine JSON-Datei - neue Gewerke brauchen keinen Code.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { mergeSchema } from './ted.js';

export const CONFIG_DIR = 'config';
export const NICHE_DIR = join(CONFIG_DIR, 'niches');

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`${path} ist kein gueltiges JSON: ${err.message}`);
  }
}

const REQUIRED = ['name', 'slug', 'cpv'];

export function validateNiche(niche, source) {
  const problems = REQUIRED.filter((key) => niche?.[key] == null).map((key) => `Feld "${key}" fehlt`);
  if (niche?.cpv && (!Array.isArray(niche.cpv) || niche.cpv.length === 0)) {
    problems.push('"cpv" muss eine nicht leere Liste sein');
  }
  for (const code of niche?.cpv ?? []) {
    if (!/^\d{8}$/.test(String(code))) problems.push(`CPV-Code "${code}" hat nicht das Format von acht Ziffern`);
  }
  if (problems.length) throw new Error(`Konfiguration ${source} ist unbrauchbar:\n  - ${problems.join('\n  - ')}`);
  return niche;
}

export async function loadNiche(slug, dir = NICHE_DIR) {
  const path = join(dir, `${slug}.json`);
  const niche = await readJson(path);
  if (!niche) {
    const available = await listNicheSlugs(dir);
    throw new Error(`Nische "${slug}" gibt es nicht. Verfuegbar: ${available.join(', ') || '(keine)'}`);
  }
  return validateNiche(niche, path);
}

export async function listNicheSlugs(dir = NICHE_DIR) {
  try {
    const files = await readdir(dir);
    return files.filter((file) => file.endsWith('.json')).map((file) => file.replace(/\.json$/, '')).sort();
  } catch {
    return [];
  }
}

export async function loadAllNiches(dir = NICHE_DIR) {
  const slugs = await listNicheSlugs(dir);
  return Promise.all(slugs.map((slug) => loadNiche(slug, dir)));
}

/** Optionales Schema-Override - damit falsche TED-Feldnamen ohne Codeaenderung korrigierbar sind. */
export async function loadSchema(dir = CONFIG_DIR) {
  return mergeSchema(await readJson(join(dir, 'ted-schema.json')));
}

export async function loadSubscribers(slug, dir = CONFIG_DIR) {
  const all = (await readJson(join(dir, 'subscribers.json'))) ?? {};
  const list = all[slug];
  if (!Array.isArray(list)) return [];
  return list.filter((entry) => typeof entry === 'string' && entry.includes('@'));
}
