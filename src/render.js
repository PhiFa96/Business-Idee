// Alert-Mail, Archivseite und Exporte.
//
// Die Mail nutzt Inline-CSS und Tabellen-Layout, weil Outlook nichts anderes
// zuverlaessig darstellt. Die Darstellungsprimitive liegen in html.js, damit
// site.js dieselben verwenden kann.

import {
  escapeHtml, formatMoney, formatDate, deadlineLabel, truncate,
  layout, noticeCard, LIST_SCRIPT,
} from './html.js';

// Weiterreichen, damit bestehende Aufrufer nicht wissen muessen, dass die
// Primitive umgezogen sind.
export { escapeHtml, formatMoney, formatDate, truncate };

const DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

// ---------------------------------------------------------------- Alert-Mail

/**
 * Abmeldelink und Absenderangabe sind keine Option, sondern Pflicht: Eine
 * Werbemail ohne beides ist rechtswidrig, auch an Einwilligende. Deshalb wirft
 * renderMail lieber, als eine unvollstaendige Mail zu erzeugen - ein roter
 * Workflow ist billiger als eine Abmahnung.
 */
export function renderMail(notices, niche, { now = new Date(), archiveUrl = null, unsubscribeUrl = null, impressum = null } = {}) {
  if (!unsubscribeUrl) throw new Error('renderMail braucht eine unsubscribeUrl - eine Mail ohne Abmeldemöglichkeit darf nicht rausgehen.');
  if (!impressum) throw new Error('renderMail braucht eine Absenderangabe (impressum) - Pflichtangabe in jeder Werbemail.');

  const dateLabel = DATE.format(now);
  const rows = notices
    .map((notice) => {
      const link = notice.url
        ? `<a href="${escapeHtml(notice.url)}" style="color:#1a4b8c;text-decoration:underline;">${escapeHtml(notice.title)}</a>`
        : escapeHtml(notice.title);
      return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #e3e3e3;">
          <div style="font-size:15px;line-height:1.4;font-weight:600;margin-bottom:6px;">${link}</div>
          <div style="font-size:13px;color:#444;line-height:1.5;">
            ${escapeHtml(notice.buyer ?? 'Auftraggeber unbekannt')}${notice.buyerCity ? `, ${escapeHtml(notice.buyerCity)}` : ''}<br>
            Auftragswert: <strong>${formatMoney(notice.valueEur)}</strong> &nbsp;·&nbsp;
            Angebotsfrist: <strong>${escapeHtml(deadlineLabel(notice, now))}</strong><br>
            <span style="color:#777;">CPV ${escapeHtml(notice.matchedCpv?.join(', ') || notice.cpvMain || '–')} · veröffentlicht ${formatDate(notice.publishedAt)}</span>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  const empty = `
      <tr><td style="padding:24px 0;font-size:14px;color:#555;">
        Heute sind keine neuen Ausschreibungen in Ihrem Gewerk erschienen.
        Diese Mail kommt trotzdem &ndash; damit Sie wissen, dass der Dienst läuft und nichts untergegangen ist.
      </td></tr>`;

  const subject = notices.length
    ? `${niche.name}: ${notices.length} neue Ausschreibung${notices.length === 1 ? '' : 'en'} (${dateLabel})`
    : `${niche.name}: keine neuen Ausschreibungen (${dateLabel})`;

  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e0e0dc;">
  <tr><td style="padding:24px 28px 16px;border-bottom:2px solid #1a4b8c;">
    <div style="font-size:19px;font-weight:700;color:#1a1a1a;">${escapeHtml(niche.name)} &ndash; Vergabe-Radar</div>
    <div style="font-size:13px;color:#666;margin-top:4px;">Öffentliche Ausschreibungen vom ${escapeHtml(dateLabel)}</div>
  </td></tr>
  <tr><td style="padding:4px 28px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${notices.length ? rows : empty}</table>
  </td></tr>
  <tr><td style="padding:16px 28px 24px;background:#fafaf8;font-size:12px;color:#777;line-height:1.6;">
    ${archiveUrl ? `Vollständiges Archiv: <a href="${escapeHtml(archiveUrl)}" style="color:#1a4b8c;">${escapeHtml(archiveUrl)}</a><br>` : ''}
    Quelle: Tenders Electronic Daily (TED) der Europäischen Union.
    Angaben ohne Gewähr &ndash; verbindlich sind allein die Vergabeunterlagen des Auftraggebers.<br><br>
    ${escapeHtml(impressum)}<br>
    <a href="${escapeHtml(unsubscribeUrl)}" style="color:#777;">Diesen Alert abbestellen</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html };
}

/** Wöchentlicher Gratis-Überblick - die Brücke vom Interessenten zum Abo. */
export function renderDigest(notices, niche, { now = new Date(), archiveUrl = null, unsubscribeUrl = null, impressum = null, offerUrl = null } = {}) {
  const base = renderMail(notices, niche, { now, archiveUrl, unsubscribeUrl, impressum });
  const subject = `${niche.name}: ${notices.length} Ausschreibung${notices.length === 1 ? '' : 'en'} dieser Woche`;

  const upsell = offerUrl
    ? `<tr><td style="padding:0 28px 20px;">
      <div style="background:#f0f4fa;border:1px solid #d7e0ee;border-radius:6px;padding:14px 16px;font-size:13px;color:#333;line-height:1.55;">
        Dieser Überblick kommt einmal pro Woche und zeigt Ausschreibungen mit 48 Stunden Verzögerung.
        Wer keine Frist verlieren will, bekommt sie werktäglich um 6 Uhr, sobald sie erscheinen:
        <a href="${escapeHtml(offerUrl)}" style="color:#1a4b8c;font-weight:600;">täglicher Alert für 79 € im Monat</a>.
      </div>
    </td></tr>`
    : '';

  return {
    subject,
    html: base.html.replace('</table>\n</td></tr></table>', `${upsell}</table>\n</td></tr></table>`),
  };
}

// -------------------------------------------------------------- Archivseite

/**
 * Vollstaendiges Archiv als echtes HTML. Das Skript filtert nur noch bereits
 * vorhandene Knoten - ohne JavaScript bleibt die Liste sichtbar.
 */
export function renderArchive(notices, niche, { now = new Date(), title = null, description = null, canonical = null, baseUrl = null, breadcrumbs = [], impressum = null, extra = '' } = {}) {
  const pageTitle = title ?? `${niche.name} – Vergabe-Radar`;

  const body = `
<h1>${escapeHtml(pageTitle)}</h1>
<p class="sub">Öffentliche Ausschreibungen aus TED &middot; Stand ${escapeHtml(DATE.format(now))}</p>
${extra}
<div class="controls">
  <input id="q" type="search" placeholder="Suchen nach Titel, Auftraggeber, Ort …" autocomplete="off" aria-label="Suchen">
  <select id="sort" aria-label="Sortierung">
    <option value="p">Neueste zuerst</option>
    <option value="d">Frist zuerst</option>
    <option value="v">Höchster Auftragswert</option>
  </select>
</div>
<p class="count" id="count">${notices.length} Ausschreibungen</p>
<div id="list">
${notices.length ? notices.map((notice) => noticeCard(notice, { now })).join('\n') : '<p class="empty">Keine Ausschreibungen erfasst.</p>'}
</div>`;

  return layout({
    title: pageTitle,
    description: description ?? `Alle erfassten öffentlichen Ausschreibungen für ${niche.name} in Deutschland, durchsuchbar und nach Frist sortierbar.`,
    body,
    canonical,
    baseUrl,
    breadcrumbs,
    impressum,
    scripts: [LIST_SCRIPT],
  });
}

// ----------------------------------------------------------------- Exporte

export function renderCsv(notices) {
  const header = ['id', 'veroeffentlicht', 'titel', 'auftraggeber', 'ort', 'wert_eur', 'frist', 'cpv', 'score', 'url'];
  const cell = (value) => {
    const text = value == null ? '' : String(value);
    return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = notices.map((n) =>
    [n.id, n.publishedAt ?? '', n.title, n.buyer ?? '', n.buyerCity ?? '', n.valueEur ?? '',
      n.deadline ?? '', (n.matchedCpv ?? n.cpv ?? []).join(' '), n.score ?? '', n.url ?? ''].map(cell).join(';'),
  );
  // Semikolon + BOM, damit Excel unter Windows die Datei ohne Importdialog richtig oeffnet.
  return `﻿${[header.join(';'), ...lines].join('\r\n')}\r\n`;
}
