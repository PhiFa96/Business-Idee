// Gemeinsame Bausteine fuer alle erzeugten Seiten.
//
// Liegt bewusst unterhalb von render.js und site.js, damit beide daraus
// schoepfen koennen, ohne sich gegenseitig zu importieren.
//
// Grundsatz fuer jede Seite hier: Der Inhalt steht als echtes HTML im Dokument.
// JavaScript darf filtern und sortieren, aber nichts erzeugen. Ohne JS muss die
// Seite vollstaendig lesbar bleiben - fuer Suchmaschinen ebenso wie fuer den
// Kalkulator, der sie im Firmennetz mit abgeschaltetem Skript oeffnet.

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

export function deadlineLabel(notice, now = new Date()) {
  if (!notice.deadline) return 'ohne Frist';
  const days = Math.floor((new Date(notice.deadline).getTime() - now.getTime()) / 86400000);
  if (Number.isNaN(days)) return 'ohne Frist';
  if (days < 0) return `abgelaufen (${formatDate(notice.deadline)})`;
  if (days === 0) return 'Frist heute';
  return `noch ${days} Tag${days === 1 ? '' : 'e'} (${formatDate(notice.deadline)})`;
}

/** Kuerzt fuer die Meta-Description, ohne mitten im Wort abzuschneiden. */
export function truncate(text, max = 155) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, clean.lastIndexOf(' ', max - 1)).trim()}…`;
}

export const PAGE_CSS = `
:root{color-scheme:light dark;--bg:#f4f4f2;--card:#fff;--fg:#1a1a1a;--muted:#666;--line:#e0e0dc;--accent:#1a4b8c;--accent-fg:#fff;--note:#f0f4fa}
@media (prefers-color-scheme:dark){:root{--bg:#16171a;--card:#1e2024;--fg:#ececec;--muted:#9a9a9a;--line:#32353b;--accent:#7fb0ee;--accent-fg:#10131a;--note:#1b2330}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}
.wrap{max-width:900px;margin:0 auto;padding:24px 16px 64px}
nav.crumbs{font-size:13px;color:var(--muted);margin-bottom:16px}
nav.crumbs a{color:var(--muted)}
h1{font-size:25px;margin:0 0 6px;line-height:1.25}
h2{font-size:18px;margin:28px 0 10px}
.sub{color:var(--muted);font-size:14px;margin-bottom:20px}
.controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
input,select,button{font:inherit;padding:9px 11px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);font-size:14px}
input[type=search],input[type=email]{flex:1;min-width:200px}
.item{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:10px}
.item h3{font-size:16px;margin:0 0 6px;line-height:1.35;font-weight:600}
.meta{color:var(--muted);font-size:13px}
.meta strong{color:var(--fg);font-weight:600}
.count{color:var(--muted);font-size:13px;margin-bottom:12px}
.note{background:var(--note);border:1px solid var(--line);border-radius:8px;padding:16px 18px;margin:20px 0}
.note p{margin:0 0 8px}.note p:last-child{margin:0}
.cta{display:inline-block;background:var(--accent);color:var(--accent-fg);padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:600}
.cta.secondary{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.kpi{display:flex;gap:22px;flex-wrap:wrap;margin:14px 0 4px}
.kpi div{font-size:13px;color:var(--muted)}
.kpi b{display:block;font-size:19px;color:var(--fg)}
.pager{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}
.pager a,.pager span{padding:7px 12px;border:1px solid var(--line);border-radius:6px;text-decoration:none;font-size:14px}
.pager span[aria-current]{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.expired{opacity:.62}
footer{margin-top:36px;color:var(--muted);font-size:12px;line-height:1.6;border-top:1px solid var(--line);padding-top:16px}
footer a{color:var(--muted)}
.empty{padding:28px;text-align:center;color:var(--muted)}
`.trim();

/**
 * Filtert und sortiert vorhandene DOM-Knoten. Erzeugt nichts - faellt das
 * Skript aus, bleibt die vollstaendige Liste stehen.
 */
export const LIST_SCRIPT = `
(function(){
  var list=document.getElementById('list'); if(!list) return;
  var items=[].slice.call(list.querySelectorAll('.item'));
  var q=document.getElementById('q'), sort=document.getElementById('sort'), count=document.getElementById('count');
  var total=items.length;
  function apply(){
    var term=(q&&q.value||'').trim().toLowerCase();
    var shown=0;
    items.forEach(function(el){
      var hit=!term||(el.getAttribute('data-search')||'').indexOf(term)>-1;
      el.hidden=!hit; if(hit) shown++;
    });
    if(sort){
      var key=sort.value;
      items.slice().sort(function(a,b){
        if(key==='v') return (+b.getAttribute('data-value')||-1)-(+a.getAttribute('data-value')||-1);
        if(key==='d') return (a.getAttribute('data-deadline')||'9999').localeCompare(b.getAttribute('data-deadline')||'9999');
        return (b.getAttribute('data-published')||'').localeCompare(a.getAttribute('data-published')||'');
      }).forEach(function(el){ list.appendChild(el); });
    }
    if(count) count.textContent=shown+' von '+total+' Ausschreibungen';
  }
  if(q) q.addEventListener('input',apply);
  if(sort) sort.addEventListener('change',apply);
})();
`.trim();

/** Reicht utm_*-Parameter an Kauf- und Anmeldelinks weiter - ohne Cookie, ohne Tracker. */
export const UTM_SCRIPT = `
(function(){
  var p=new URLSearchParams(location.search), keep=['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
  var pairs=keep.filter(function(k){return p.get(k);}).map(function(k){return k+'='+encodeURIComponent(p.get(k));});
  if(!pairs.length) return;
  [].slice.call(document.querySelectorAll('a[data-utm]')).forEach(function(a){
    a.href += (a.href.indexOf('?')>-1?'&':'?')+pairs.join('&');
  });
})();
`.trim();

function crumbHtml(breadcrumbs) {
  if (!breadcrumbs?.length) return '';
  const parts = breadcrumbs.map((crumb, index) =>
    index === breadcrumbs.length - 1 || !crumb.href
      ? escapeHtml(crumb.name)
      : `<a href="${escapeHtml(crumb.href)}">${escapeHtml(crumb.name)}</a>`,
  );
  return `<nav class="crumbs">${parts.join(' &rsaquo; ')}</nav>`;
}

function breadcrumbJsonLd(breadcrumbs, baseUrl) {
  if (!breadcrumbs?.length || !baseUrl) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      ...(crumb.href ? { item: new URL(crumb.href, baseUrl).href } : {}),
    })),
  };
}

/**
 * Seitenhuelle. title und description sind Pflicht - eine Seite ohne beides
 * ist fuer die Suche wertlos, und der seo-report meldet sie als Fehler.
 */
export function layout({
  title,
  description,
  body,
  canonical = null,
  baseUrl = null,
  breadcrumbs = [],
  jsonLd = [],
  scripts = [],
  noindex = false,
  impressum = null,
}) {
  if (!title) throw new Error('layout() braucht einen title.');
  if (!description) throw new Error(`layout() braucht eine description (Seite: ${title}).`);

  const canonicalUrl = canonical && baseUrl ? new URL(canonical, baseUrl).href : null;
  const structured = [breadcrumbJsonLd(breadcrumbs, baseUrl), ...jsonLd].filter(Boolean);

  return `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(truncate(description))}">
${noindex ? '<meta name="robots" content="noindex,follow">' : ''}
${canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(truncate(description))}">
${canonicalUrl ? `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">` : ''}
<meta property="og:locale" content="de_DE">
<style>${PAGE_CSS}</style>
${structured.map((entry) => `<script type="application/ld+json">${JSON.stringify(entry).replaceAll('<', '\\u003c')}</script>`).join('\n')}
</head>
<body><div class="wrap">
${crumbHtml(breadcrumbs)}
${body}
<footer>
  Quelle: Tenders Electronic Daily (TED) der Europäischen Union, weiterverwendet nach Beschluss
  2011/833/EU. TED enthält Vergaben oberhalb der EU-Schwellenwerte. Angaben ohne Gewähr &ndash;
  verbindlich sind allein die Vergabeunterlagen des Auftraggebers.
  ${impressum ? `<br>${escapeHtml(impressum)}` : ''}
</footer>
</div>
${scripts.map((script) => `<script>${script}</script>`).join('\n')}
</body></html>`;
}

/** Eine Ausschreibung als echtes HTML, mit Sortier- und Suchdaten am Element. */
export function noticeCard(notice, { href = null, now = new Date(), showDeadline = true } = {}) {
  const search = [notice.title, notice.buyer, notice.buyerCity].filter(Boolean).join(' ').toLowerCase();
  const expired = notice.deadline && new Date(notice.deadline).getTime() < now.getTime();
  const target = href ?? notice.url;
  const heading = target
    ? `<a href="${escapeHtml(target)}"${href ? '' : ' rel="noopener"'}>${escapeHtml(notice.title)}</a>`
    : escapeHtml(notice.title);

  return `<article class="item${expired ? ' expired' : ''}"
  data-search="${escapeHtml(search)}"
  data-value="${notice.valueEur ?? ''}"
  data-deadline="${escapeHtml(notice.deadline ?? '')}"
  data-published="${escapeHtml(notice.publishedAt ?? '')}">
  <h3>${heading}</h3>
  <p class="meta">${escapeHtml(notice.buyer ?? 'Auftraggeber unbekannt')}${notice.buyerCity ? `, ${escapeHtml(notice.buyerCity)}` : ''}<br>
  Auftragswert <strong>${formatMoney(notice.valueEur)}</strong>${showDeadline ? ` &middot; Frist <strong>${escapeHtml(deadlineLabel(notice, now))}</strong>` : ''} &middot; veröffentlicht ${formatDate(notice.publishedAt)}</p>
</article>`;
}

/**
 * Anmeldeblock. Ohne konfigurierten Endpunkt faellt er auf mailto zurueck -
 * dann ist die Antwortmail des Interessenten selbst der Einwilligungsnachweis.
 */
export function subscribeBlock(niche, { endpoint = null, mailto = null, quelle = null } = {}) {
  const wortlaut = 'Ich möchte den wöchentlichen Überblick über neue Ausschreibungen per E-Mail erhalten.';

  if (!endpoint && !mailto) return '';

  if (!endpoint) {
    const subject = encodeURIComponent(`Anmeldung Überblick ${niche.name}`);
    const bodyText = encodeURIComponent(`${wortlaut}\n\nGewerk: ${niche.name}\n\n(Bitte diese Mail einfach absenden.)`);
    return `<section class="note">
  <p><strong>Wöchentlicher Überblick, kostenlos.</strong> Jeden Montag die neuen Ausschreibungen
  Ihres Gewerks per E-Mail. Abmeldung jederzeit mit einem Klick.</p>
  <p><a class="cta" data-utm href="mailto:${escapeHtml(mailto)}?subject=${subject}&body=${bodyText}">Per E-Mail anmelden</a></p>
  <p class="meta">Mit dem Absenden erklären Sie: „${escapeHtml(wortlaut)}“</p>
</section>`;
  }

  return `<section class="note">
  <p><strong>Wöchentlicher Überblick, kostenlos.</strong> Jeden Montag die neuen Ausschreibungen
  Ihres Gewerks per E-Mail. Abmeldung jederzeit mit einem Klick.</p>
  <form class="controls" method="post" action="${escapeHtml(endpoint)}">
    <input type="hidden" name="niche" value="${escapeHtml(niche.slug)}">
    <input type="hidden" name="quelle" value="${escapeHtml(quelle ?? '')}">
    <input type="email" name="email" required placeholder="ihre@firma.de" autocomplete="email">
    <button type="submit" class="cta">Anmelden</button>
  </form>
  <p class="meta">Mit der Anmeldung erklären Sie: „${escapeHtml(wortlaut)}“ Sie erhalten zuerst eine
  Bestätigungsmail; erst nach Ihrem Klick darin verschicken wir etwas.</p>
</section>`;
}
