// Versand-Adapter.
//
// Default ist "file": die Mail wird nach out/ geschrieben statt verschickt.
// Damit laeuft die gesamte Kette ohne Account, ohne Kreditkarte und ohne das
// Risiko, im Test versehentlich echte Empfaenger anzuschreiben. Der echte
// Versand wird erst aktiv, wenn RESEND_API_KEY gesetzt ist.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const OUT_DIR = 'out';

function slugifyDate(now) {
  return now.toISOString().slice(0, 10);
}

export function fileTransport({ outDir = OUT_DIR } = {}) {
  return {
    name: 'file',
    async send({ to, subject, html, slug, now = new Date() }) {
      await mkdir(outDir, { recursive: true });
      const path = join(outDir, `mail-${slug}-${slugifyDate(now)}.html`);
      await writeFile(path, html, 'utf8');
      return { delivered: false, path, recipients: to, subject };
    },
  };
}

export function resendTransport({ apiKey, from, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new Error('resendTransport braucht einen API-Key.');
  if (!from) throw new Error('resendTransport braucht eine Absenderadresse (MAIL_FROM).');

  return {
    name: 'resend',
    async send({ to, subject, html }) {
      const recipients = Array.isArray(to) ? to : [to];
      if (recipients.length === 0) return { delivered: false, skipped: 'keine Empfaenger', recipients };

      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        // bcc, damit die Abonnenten sich nicht gegenseitig sehen.
        body: JSON.stringify({ from, to: from, bcc: recipients, subject, html }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Resend lehnt den Versand ab (HTTP ${response.status}): ${detail.slice(0, 400)}`);
      }
      const body = await response.json().catch(() => ({}));
      return { delivered: true, id: body.id ?? null, recipients, subject };
    },
  };
}

/**
 * Waehlt den Transport. Ohne Key oder mit --dry-run immer "file".
 * Bewusst so herum: der sichere Weg ist der Default, der Versand die Ausnahme.
 */
export function pickTransport({ dryRun = false, env = process.env, outDir = OUT_DIR } = {}) {
  if (dryRun || !env.RESEND_API_KEY) return fileTransport({ outDir });
  return resendTransport({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM });
}
