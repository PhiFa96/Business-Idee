// Erzeugt die Alert-Mail, die statische Archivseite und die Exporte.
//
// Die Mail nutzt Inline-CSS und Tabellen-Layout, weil Outlook nichts anderes
// zuverlaessig darstellt. Die Archivseite ist eine einzelne HTML-Datei mit
// eingebettetem Filter - kein Server, kein Build, keine externen Ressourcen.

const MONEY = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatMoney(value) {
  return value == null ? '–' : MONEY.format(value);
}

export function formatDate(value) {
  if (!value) return '–';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '–' : DATE.format(date);
}

function deadlineLabel(notice, now = new Date()) {
  if (!notice.deadline) return 'ohne Frist';
  const days = Math.floor((new Date(notice.deadline).getTime() - now.getTime()) / 86400000);
  if (Number.isNaN(days)) return 'ohne Frist';
  if (days < 0) return `abgelaufen (${formatDate(notice.deadline)})`;
  if (days === 0) return 'Frist heute';
  return `noch ${days} Tag${days === 1 ? '' : 'e'} (${formatDate(notice.deadline)})`;
}

// ---------------------------------------------------------------- Alert-Mail

export function renderMail(notices, niche, { now = new Date(), archiveUrl = null } = {}) {
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
    Angaben ohne Gewähr &ndash; verbindlich sind allein die Vergabeunterlagen des Auftraggebers.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html };
}

// ------------------------------------------------------------- Archivseite

export function renderArchive(notices, niche, { now = new Date(), title = null } = {}) {
  const pageTitle = title ?? `${niche.name} – Vergabe-Radar`;
  const payload = notices.map((notice) => ({
    id: notice.id,
    t: notice.title,
    b: notice.buyer,
    c: notice.buyerCity,
    v: notice.valueEur,
    d: notice.deadline,
    p: notice.publishedAt,
    u: notice.url,
    s: notice.score ?? null,
  }));

  return `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<style>
:root{color-scheme:light dark;--bg:#f4f4f2;--card:#fff;--fg:#1a1a1a;--muted:#666;--line:#e0e0dc;--accent:#1a4b8c}
@media (prefers-color-scheme:dark){:root{--bg:#16171a;--card:#1e2024;--fg:#ececec;--muted:#9a9a9a;--line:#32353b;--accent:#7fb0ee}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:24px;margin:0 0 4px}
.sub{color:var(--muted);font-size:14px;margin-bottom:22px}
.controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
input,select{padding:9px 11px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);font-size:14px}
input{flex:1;min-width:200px}
.item{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:10px}
.item h2{font-size:16px;margin:0 0 6px;line-height:1.35}
.item a{color:var(--accent)}
.meta{color:var(--muted);font-size:13px}
.meta strong{color:var(--fg);font-weight:600}
.count{color:var(--muted);font-size:13px;margin-bottom:12px}
footer{margin-top:32px;color:var(--muted);font-size:12px;line-height:1.6;border-top:1px solid var(--line);padding-top:16px}
.empty{padding:28px;text-align:center;color:var(--muted)}
</style></head>
<body><div class="wrap">
<h1>${escapeHtml(pageTitle)}</h1>
<div class="sub">Öffentliche Ausschreibungen aus TED &middot; Stand ${escapeHtml(DATE.format(now))}</div>
<div class="controls">
  <input id="q" type="search" placeholder="Suchen nach Titel, Auftraggeber, Ort …" autocomplete="off">
  <select id="sort">
    <option value="p">Neueste zuerst</option>
    <option value="d">Frist zuerst</option>
    <option value="v">Höchster Auftragswert</option>
  </select>
</div>
<div class="count" id="count"></div>
<div id="list"></div>
<footer>
  Quelle: Tenders Electronic Daily (TED) der Europäischen Union. TED enthält Vergaben oberhalb
  der EU-Schwellenwerte. Angaben ohne Gewähr &ndash; verbindlich sind allein die Vergabeunterlagen
  des Auftraggebers.
</footer>
</div>
<script id="data" type="application/json">${JSON.stringify(payload).replaceAll('<', '\\u003c')}</script>
<script>
const items = JSON.parse(document.getElementById('data').textContent);
const money = new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const date = new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
const fmtDate = v => v ? date.format(new Date(v)) : '–';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list = document.getElementById('list'), count = document.getElementById('count');
const q = document.getElementById('q'), sort = document.getElementById('sort');

function render(){
  const term = q.value.trim().toLowerCase();
  let rows = items.filter(i => !term || (i.t+' '+(i.b||'')+' '+(i.c||'')).toLowerCase().includes(term));
  const key = sort.value;
  rows.sort((a,b) => {
    if(key==='v') return (b.v??-1)-(a.v??-1);
    if(key==='d') return String(a.d??'9999').localeCompare(String(b.d??'9999'));
    return String(b.p??'').localeCompare(String(a.p??''));
  });
  count.textContent = rows.length + ' von ' + items.length + ' Ausschreibungen';
  list.innerHTML = rows.length ? rows.map(i => \`
    <div class="item">
      <h2>\${i.u ? \`<a href="\${esc(i.u)}" rel="noopener">\${esc(i.t)}</a>\` : esc(i.t)}</h2>
      <div class="meta">\${esc(i.b||'Auftraggeber unbekannt')}\${i.c?', '+esc(i.c):''}<br>
      Auftragswert <strong>\${i.v==null?'–':money.format(i.v)}</strong> &middot;
      Frist <strong>\${fmtDate(i.d)}</strong> &middot; veröffentlicht \${fmtDate(i.p)}</div>
    </div>\`).join('') : '<div class="empty">Keine Treffer.</div>';
}
q.addEventListener('input', render);
sort.addEventListener('change', render);
render();
</script>
</body></html>`;
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
  return `\uFEFF${[header.join(';'), ...lines].join('\r\n')}\r\n`;
}
