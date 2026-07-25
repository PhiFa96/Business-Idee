// Cloudflare Worker fuer die Double-Opt-in-Anmeldung.
//
// Ohne Abhaengigkeiten, laeuft im kostenlosen Kontingent. Optional: Solange
// kein Endpunkt konfiguriert ist, meldet man sich auf der Website per mailto an
// und die Antwortmail ist selbst der Einwilligungsnachweis. Dieser Worker
// automatisiert genau diesen Schritt.
//
// Verantwortlichkeiten bewusst getrennt: Der Worker nimmt Anmeldungen entgegen
// und verwaltet Bestaetigungen. Wahrheitsquelle bleibt config/subscribers.json
// im Repo - "node bin/radar.js subscribers sync" holt den Stand ab. Damit
// liegt der Einwilligungsnachweis versioniert im Git und nicht nur in einem
// Key-Value-Speicher, den niemand sichert.
//
// Erforderliche Bindings:
//   KV-Namespace  SUBS
//   Secrets       RESEND_API_KEY, EXPORT_KEY
//   Variablen     MAIL_FROM, SITE_URL, IMPRESSUM
//
// Deployment:  npx wrangler deploy   (siehe worker/wrangler.toml)

const WORTLAUT = 'Ich möchte den wöchentlichen Überblick über neue Ausschreibungen per E-Mail erhalten.';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const page = (title, text, status = 200) =>
  new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:38rem;margin:12vh auto;padding:0 1.5rem;color:#1a1a1a}
@media(prefers-color-scheme:dark){body{background:#16171a;color:#ececec}}h1{font-size:1.5rem}</style></head>
<body><h1>${esc(title)}</h1><p>${esc(text)}</p></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim());

async function sendMail(env, { to, subject, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
}

function confirmationMail(env, entry) {
  const link = `${env.SITE_URL.replace(/\/$/, '')}/api/bestaetigen?token=${encodeURIComponent(entry.token)}`;
  return {
    subject: 'Bitte bestätigen Sie Ihre Anmeldung',
    html: `<!doctype html><html lang="de"><body style="font:15px/1.6 system-ui,sans-serif;color:#1a1a1a">
<p>Sie haben sich für den wöchentlichen Überblick über öffentliche Ausschreibungen angemeldet.</p>
<p><strong>Erst nach Ihrem Klick auf den folgenden Link verschicken wir etwas:</strong></p>
<p><a href="${esc(link)}" style="background:#1a4b8c;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;display:inline-block">Anmeldung bestätigen</a></p>
<p style="color:#666;font-size:13px">Ihre Erklärung: „${esc(WORTLAUT)}“<br>
Angemeldet am ${esc(entry.angemeldet)}${entry.quelle ? ` über ${esc(entry.quelle)}` : ''}.</p>
<p style="color:#666;font-size:13px">Haben Sie sich nicht angemeldet, ignorieren Sie diese Mail einfach &ndash;
ohne Ihre Bestätigung passiert nichts.</p>
<hr style="border:none;border-top:1px solid #e0e0dc">
<p style="color:#777;font-size:12px">${esc(env.IMPRESSUM ?? '')}</p>
</body></html>`,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    // ---------------------------------------------------------- Anmeldung
    if (request.method === 'POST' && (path === '/' || path === '/api/anmelden')) {
      const form = await request.formData().catch(() => null);
      const email = String(form?.get('email') ?? '').trim().toLowerCase();
      const niche = String(form?.get('niche') ?? '').trim();
      const quelle = String(form?.get('quelle') ?? '').trim();

      if (!isEmail(email) || !niche) return page('Angabe fehlt', 'Bitte eine gültige E-Mail-Adresse angeben.', 400);

      const key = `${niche}:${email}`;
      const existing = await env.SUBS.get(key, 'json');
      if (existing?.status === 'aktiv') {
        return page('Bereits angemeldet', 'Diese Adresse erhält den Überblick bereits.');
      }

      const entry = {
        email, nische: niche, plan: 'digest', quelle: quelle || url.origin,
        wortlaut: WORTLAUT,
        angemeldet: new Date().toISOString(),
        bestaetigt: null,
        token: crypto.randomUUID(),
        status: 'wartet_auf_bestaetigung',
        kanal: 'web',
      };

      await env.SUBS.put(key, JSON.stringify(entry));
      await env.SUBS.put(`token:${entry.token}`, key);

      try {
        await sendMail(env, { to: email, ...confirmationMail(env, entry) });
      } catch (err) {
        return page('Versand fehlgeschlagen', 'Die Bestätigungsmail konnte nicht zugestellt werden. Bitte später erneut versuchen.', 502);
      }

      return page('Fast geschafft', 'Wir haben Ihnen eine Bestätigungsmail geschickt. Erst nach Ihrem Klick darin verschicken wir etwas.');
    }

    // -------------------------------------------------------- Bestaetigung
    if (path === '/api/bestaetigen') {
      const token = url.searchParams.get('token');
      const key = token && (await env.SUBS.get(`token:${token}`));
      if (!key) return page('Link ungültig', 'Dieser Bestätigungslink ist unbekannt oder abgelaufen.', 404);

      const entry = await env.SUBS.get(key, 'json');
      if (!entry) return page('Link ungültig', 'Zu diesem Link gibt es keine Anmeldung mehr.', 404);

      entry.status = 'aktiv';
      entry.bestaetigt = new Date().toISOString();
      await env.SUBS.put(key, JSON.stringify(entry));
      return page('Anmeldung bestätigt', 'Sie erhalten ab jetzt den wöchentlichen Überblick. Abmeldung jederzeit mit einem Klick in jeder Mail.');
    }

    // ---------------------------------------------------------- Abmeldung
    // Ein Klick, keine Rueckfrage, kein Login. Alles andere waere unzulaessig.
    if (path === '/api/abmelden' || url.searchParams.has('abmelden')) {
      const token = url.searchParams.get('token') ?? url.searchParams.get('abmelden');
      const key = token && (await env.SUBS.get(`token:${token}`));
      if (!key) return page('Bereits abgemeldet', 'Zu diesem Link gibt es keine aktive Anmeldung.');

      const entry = await env.SUBS.get(key, 'json');
      if (entry) {
        entry.status = 'abgemeldet';
        entry.bestaetigt = null;
        entry.abgemeldet = new Date().toISOString();
        await env.SUBS.put(key, JSON.stringify(entry));
      }
      return page('Abgemeldet', 'Sie erhalten keine weiteren E-Mails. Es ist nichts weiter zu tun.');
    }

    // ------------------------------------------------------------- Export
    // Holt der taegliche Workflow ab, damit der Nachweis versioniert im Repo landet.
    if (path === '/api/export') {
      if (!env.EXPORT_KEY || url.searchParams.get('key') !== env.EXPORT_KEY) {
        return json({ fehler: 'nicht autorisiert' }, 401);
      }
      const out = {};
      let cursor;
      do {
        const list = await env.SUBS.list({ cursor });
        for (const item of list.keys) {
          if (item.name.startsWith('token:')) continue;
          const entry = await env.SUBS.get(item.name, 'json');
          if (!entry) continue;
          (out[entry.nische] ??= []).push(entry);
        }
        cursor = list.list_complete ? null : list.cursor;
      } while (cursor);
      return json(out);
    }

    return page('Nicht gefunden', 'Diese Adresse gibt es nicht.', 404);
  },
};
