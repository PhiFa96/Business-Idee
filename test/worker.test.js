// Tests fuer den Anmelde-Worker.
//
// Er ist das rechtlich tragende Stueck: Was hier schiefgeht, erzeugt entweder
// einen Versand ohne Einwilligung oder eine Einwilligung, die nie zustande
// kommt. Beides faellt im Betrieb nicht auf - im ersten Fall beschwert sich
// irgendwann jemand, im zweiten meldet sich schlicht niemand an.
//
// Cloudflare wird nicht gebraucht: Node 22 bringt Request, Response und
// crypto.randomUUID mit, KV und der Mailversand sind hier Doppel.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/subscribe.js';

const WORKER_URL = 'https://vergabe-radar-anmeldung.test.workers.dev';

/** KV-Doppel mit genau den Methoden, die der Worker benutzt. */
function kvDouble(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(key, typ) {
      const value = store.get(key);
      if (value == null) return null;
      return typ === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) { store.set(key, value); },
    async list({ cursor } = {}) {
      void cursor;
      return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true };
    },
  };
}

let gesendet;
let mailSchlaegtFehl;

function env(extra = {}) {
  return {
    SUBS: kvDouble(),
    RESEND_API_KEY: 'test',
    MAIL_FROM: 'radar@example.test',
    SITE_URL: 'https://beispiel.test/radar/',
    IMPRESSUM: 'Fade Digital GmbH',
    EXPORT_KEY: 'geheim',
    ...extra,
  };
}

beforeEach(() => {
  gesendet = [];
  mailSchlaegtFehl = false;
  globalThis.fetch = async (url, options) => {
    gesendet.push(JSON.parse(options.body));
    return mailSchlaegtFehl
      ? new Response('nope', { status: 422 })
      : new Response('{}', { status: 200 });
  };
});

function anmeldung(felder = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ email: 'chef@firma.test', niche: 'galabau', ...felder })) {
    if (value != null) form.set(key, value);
  }
  return new Request(`${WORKER_URL}/api/anmelden`, { method: 'POST', body: form });
}

// ------------------------------------------------------------------ Anmeldung

test('Anmeldung legt den Einwilligungsnachweis an - aber niemals als aktiv', async () => {
  const e = env();
  const antwort = await worker.fetch(anmeldung({ quelle: 'https://beispiel.test/galabau/a/1.html' }), e);
  assert.equal(antwort.status, 200);

  const eintrag = await e.SUBS.get('galabau:chef@firma.test', 'json');
  assert.equal(eintrag.status, 'wartet_auf_bestaetigung');
  assert.equal(eintrag.bestaetigt, null, 'ohne Klick gibt es keine Bestaetigung');
  assert.equal(eintrag.email, 'chef@firma.test');
  assert.equal(eintrag.nische, 'galabau');
  assert.equal(eintrag.plan, 'digest');
  assert.equal(eintrag.kanal, 'web');
  assert.equal(eintrag.quelle, 'https://beispiel.test/galabau/a/1.html');

  // Der Wortlaut ist der Nachweis. Ohne ihn belegt der Eintrag nichts.
  assert.match(eintrag.wortlaut, /wöchentlichen Überblick/);
  assert.ok(!Number.isNaN(Date.parse(eintrag.angemeldet)), 'Zeitpunkt muss auswertbar sein');
  assert.ok(eintrag.token, 'ohne Token gibt es keinen Bestaetigungsweg');
});

test('der Bestaetigungslink zeigt auf den Worker, nicht auf die Website', async () => {
  // Genau hier lag der Fehler: gebaut wurde er aus SITE_URL, bedient wird
  // /api/bestaetigen aber vom Worker. Auf GitHub Pages lief damit jeder Link
  // in eine 404 - und ohne Bestaetigung darf nie etwas rausgehen.
  const e = env({ SITE_URL: 'https://phifa96.github.io/Business-Idee/' });
  await worker.fetch(anmeldung(), e);

  const [mail] = gesendet;
  const link = /href="([^"]*\/api\/bestaetigen[^"]*)"/.exec(mail.html)?.[1];
  assert.ok(link, 'die Mail muss einen Bestaetigungslink enthalten');
  assert.equal(new URL(link).origin, WORKER_URL, 'der Link muss zum Worker fuehren');
  assert.doesNotMatch(link, /github\.io/, 'die Website bedient /api/bestaetigen nicht');

  const eintrag = await e.SUBS.get('galabau:chef@firma.test', 'json');
  assert.equal(new URL(link).searchParams.get('token'), eintrag.token);
});

test('ungueltige Adresse wird abgewiesen, ohne etwas zu speichern oder zu senden', async () => {
  for (const kaputt of ['keine-adresse', '', 'zwei@@at.test', 'ohne@punkt']) {
    const e = env();
    const antwort = await worker.fetch(anmeldung({ email: kaputt }), e);
    assert.equal(antwort.status, 400, `"${kaputt}" haette abgelehnt werden muessen`);
    assert.equal(e.SUBS.store.size, 0);
  }
  assert.deepEqual(gesendet, [], 'an eine ungueltige Adresse geht nichts raus');
});

test('fehlendes Gewerk wird abgewiesen - ein Nachweis ohne Bezug belegt nichts', async () => {
  const e = env();
  const antwort = await worker.fetch(anmeldung({ niche: '' }), e);
  assert.equal(antwort.status, 400);
  assert.equal(e.SUBS.store.size, 0);
});

test('bereits Angemeldete bekommen keine zweite Mail', async () => {
  const e = env();
  await worker.fetch(anmeldung(), e);
  const eintrag = await e.SUBS.get('galabau:chef@firma.test', 'json');
  eintrag.status = 'aktiv';
  await e.SUBS.put('galabau:chef@firma.test', JSON.stringify(eintrag));

  gesendet = [];
  const antwort = await worker.fetch(anmeldung(), e);
  assert.equal(antwort.status, 200);
  assert.deepEqual(gesendet, [], 'sonst wird die Anmeldung zum Werkzeug gegen den Empfaenger');
});

test('scheitert der Mailversand, entsteht daraus keine Berechtigung', async () => {
  const e = env();
  mailSchlaegtFehl = true;
  const antwort = await worker.fetch(anmeldung(), e);
  assert.equal(antwort.status, 502);

  const eintrag = await e.SUBS.get('galabau:chef@firma.test', 'json');
  assert.equal(eintrag.status, 'wartet_auf_bestaetigung', 'ohne zugestellte Mail kann niemand bestaetigen');
});

// --------------------------------------------------------------- Bestaetigung

test('Bestaetigung schaltet frei und haelt den Zeitpunkt fest', async () => {
  const e = env();
  await worker.fetch(anmeldung(), e);
  const { token } = await e.SUBS.get('galabau:chef@firma.test', 'json');

  const antwort = await worker.fetch(new Request(`${WORKER_URL}/api/bestaetigen?token=${token}`), e);
  assert.equal(antwort.status, 200);

  const eintrag = await e.SUBS.get('galabau:chef@firma.test', 'json');
  assert.equal(eintrag.status, 'aktiv');
  assert.ok(!Number.isNaN(Date.parse(eintrag.bestaetigt)));
});

test('unbekanntes oder fehlendes Token bestaetigt nichts', async () => {
  const e = env();
  for (const suffix of ['?token=erfunden', '?token=', '']) {
    const antwort = await worker.fetch(new Request(`${WORKER_URL}/api/bestaetigen${suffix}`), e);
    assert.equal(antwort.status, 404);
  }
});

// ------------------------------------------------------------------ Abmeldung

test('Abmeldung wirkt mit einem Klick, ohne Rueckfrage', async () => {
  const e = env();
  await worker.fetch(anmeldung(), e);
  const { token } = await e.SUBS.get('galabau:chef@firma.test', 'json');
  await worker.fetch(new Request(`${WORKER_URL}/api/bestaetigen?token=${token}`), e);

  // So baut bin/radar.js den Abmeldelink: Endpunkt plus ?abmelden=<token>.
  const antwort = await worker.fetch(new Request(`${WORKER_URL}/?abmelden=${token}`), e);
  assert.equal(antwort.status, 200);

  const eintrag = await e.SUBS.get('galabau:chef@firma.test', 'json');
  assert.equal(eintrag.status, 'abgemeldet');
  assert.equal(eintrag.bestaetigt, null, 'die alte Bestaetigung darf nicht weitergelten');
  assert.ok(!Number.isNaN(Date.parse(eintrag.abgemeldet)));
});

test('ein unbekannter Abmeldelink laeuft freundlich aus, statt zu scheitern', async () => {
  // Wer abbestellen will, darf nie auf einen Fehler stossen - er wuerde es als
  // "hat nicht geklappt" lesen und es bleibt eine Beschwerde uebrig.
  const e = env();
  const antwort = await worker.fetch(new Request(`${WORKER_URL}/api/abmelden?token=erfunden`), e);
  assert.equal(antwort.status, 200);
});

// --------------------------------------------------------------------- Export

test('Export ohne gueltigen Schluessel gibt keine Adressen heraus', async () => {
  const e = env();
  await worker.fetch(anmeldung(), e);

  for (const suffix of ['', '?key=', '?key=falsch']) {
    const antwort = await worker.fetch(new Request(`${WORKER_URL}/api/export${suffix}`), e);
    assert.equal(antwort.status, 401);
    assert.doesNotMatch(await antwort.text(), /chef@firma\.test/);
  }
});

test('Export ohne gesetzten EXPORT_KEY gibt nichts heraus', async () => {
  // Sonst waere eine vergessene Variable gleichbedeutend mit einer offenen
  // Adressliste im Netz.
  const e = env({ EXPORT_KEY: undefined });
  await worker.fetch(anmeldung(), e);
  const antwort = await worker.fetch(new Request(`${WORKER_URL}/api/export`), e);
  assert.equal(antwort.status, 401);
});

test('Export liefert nach Gewerk gruppiert und ohne die Token-Hilfsschluessel', async () => {
  const e = env();
  await worker.fetch(anmeldung({ email: 'a@firma.test', niche: 'galabau' }), e);
  await worker.fetch(anmeldung({ email: 'b@firma.test', niche: 'metallbau' }), e);

  const antwort = await worker.fetch(new Request(`${WORKER_URL}/api/export?key=geheim`), e);
  assert.equal(antwort.status, 200);
  const daten = await antwort.json();

  assert.deepEqual(Object.keys(daten).sort(), ['galabau', 'metallbau']);
  assert.equal(daten.galabau.length, 1);
  assert.equal(daten.galabau[0].email, 'a@firma.test');
  assert.ok(daten.galabau[0].wortlaut, 'der Nachweis muss mitkommen, sonst ist der Export wertlos');
  assert.ok(Object.values(daten).flat().every((eintrag) => eintrag.email),
    'die token:-Schluessel duerfen nicht als Eintraege durchrutschen');
});

// ----------------------------------------------------------------- Sonstiges

test('Adressen werden normalisiert, damit niemand doppelt gefuehrt wird', async () => {
  const e = env();
  await worker.fetch(anmeldung({ email: '  Chef@Firma.Test  ' }), e);
  assert.ok(await e.SUBS.get('galabau:chef@firma.test', 'json'));
});

test('unbekannte Pfade antworten mit 404, nicht mit einem Absturz', async () => {
  const e = env();
  const antwort = await worker.fetch(new Request(`${WORKER_URL}/gibtesnicht`), e);
  assert.equal(antwort.status, 404);
});
