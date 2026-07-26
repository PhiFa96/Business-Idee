# Business-Idee

Die Analyse, die zu einem Geschäftsmodell geführt hat, und die lauffähige Anwendung dazu.

| Datei | Inhalt |
|---|---|
| [`geschaeftsmodelle.md`](geschaeftsmodelle.md) | Fünf Modelle, drei begründete Streichungen, 30-Tage-Tests |
| [`VERTRIEB.md`](VERTRIEB.md) | Freemium-Modell, Einrichtung, Kennzahlen und Schwellen |
| [`AKQUISE.md`](AKQUISE.md) | Google-Ads-Material, Telefonleitfaden, was per E-Mail nicht geht |
| [`SEO.md`](SEO.md) | Auffindbarkeit: Einrichtung, Erwartungshorizont, Abbruchkriterium |

---

## Vergabe-Radar

Holt täglich die öffentlichen Ausschreibungen aus der TED-Datenbank der EU, filtert sie auf ein
Gewerk, baut daraus eine öffentliche Website und verschickt eine Alert-Mail. Die Routinearbeit –
jeden Morgen Vergabeportale durchsehen – macht die Maschine; das Ergebnis ist das Abonnement.

**Kein Server, keine Datenbank, keine Abhängigkeiten.** Node 22 genügt. Der Zustand liegt als JSON
im Repo, der Zeitplan in GitHub Actions, die Website auf GitHub Pages. Laufende Kosten: 0 €.

> **Dieses Repository ist öffentlich.** Nur so ist GitHub Pages kostenlos — bei privaten
> Repositories verlangt GitHub dafür ein kostenpflichtiges Konto. Folge: Alles hier ist von jedem
> lesbar, auch der gesamte Verlauf. **Abonnentendaten gehören deshalb nicht ins Repo**, sondern
> ins Secret `SUBSCRIBERS_JSON` (siehe [`VERTRIEB.md`](VERTRIEB.md)). `config/subscribers.json`
> steht in `.gitignore` und wird vom täglichen Lauf nicht mehr zurückgeschrieben.

### Schnellstart

```bash
node bin/radar.js doctor                              # Konfiguration und TED-Verbindung
node bin/radar.js scan --days 90                      # trägt die Nische? (Abbruchtest)
node bin/radar.js backfill --niche <slug> --days 365  # Bestand aufbauen
node bin/radar.js build-site                          # Website erzeugen
```

### Seite ansehen

```bash
npm run demo                      # baut site/ aus Testdaten
node bin/radar.js serve --demo    # http://localhost:8080/Business-Idee/
```

Ein Vorschau-Server ist nötig, weil die Seiten absolute Links verwenden — per Doppelklick aus dem
Dateimanager (`file://`) würde die Navigation ins Leere laufen. Der Server hängt die Seite unter
denselben Basispfad wie später im Betrieb, damit die Vorschau nicht lügt.

`--demo` ersetzt fehlende Pflichtangaben aus `config/site.json` durch erkennbare Platzhalter. Im
Versandpfad wirkt das Flag nicht — dort müssen die echten Angaben stehen.

```bash
npm test   # 98 Tests, komplett offline
```

### Befehle

| Befehl | Zweck |
|---|---|
| `doctor` | Konfiguration, Erreichbarkeit und TED-Feldnamen prüfen |
| `scan [--days 90]` | Alle Gewerke vergleichen. Der Machbarkeits- und Abbruchtest. |
| `backfill --niche <slug>` | Bestand rückwirkend aufbauen, **ohne** Alerts auszulösen |
| `run --niche <slug>` | Täglicher Lauf: abrufen, filtern, entdoppeln, Website bauen |
| `build-site` | Nur die Website neu erzeugen, offline |
| `serve [--port 8080]` | Vorschau im Browser ansehen |
| `send --niche <slug>` | Täglicher Alert an Zahlende |
| `digest --niche <slug>` | Wöchentlicher Gratisüberblick an Bestätigte |
| `subscribers list\|add\|confirm\|remove\|sync` | Abonnenten mit Einwilligungsnachweis pflegen |
| `seo-report` | Qualität der erzeugten Seiten prüfen |

Flags: `--days N` `--limit N` `--max-pages N` `--fixture` `--demo` `--port N` `--dry-run` `--since N` `--email …`
`--token …` `--plan alert|digest` `--kanal web|telefon` `--notiz …`

### Was erzeugt wird

```
site/index.html                        Startseite über alle Gewerke
site/<gewerk>/index.html               laufende Ausschreibungen
site/<gewerk>/angebot.html             Landingpage für Anzeigen
site/<gewerk>/archiv.html              paginiertes Archiv
site/<gewerk>/a/<id>.html              Detailseite je Ausschreibung
site/<gewerk>/auftraggeber/<name>.html Auftraggeber-Profil mit Vergabehistorie
site/<gewerk>/region/<nuts>.html       Bundesland
site/sitemap.xml  site/robots.txt  site/404.html
```

Der Inhalt steht als **echtes HTML** im Dokument; JavaScript filtert und sortiert nur. Ohne Skript
bleibt jede Seite vollständig lesbar – der CI-Lauf prüft das.

### Ein neues Gewerk aufnehmen

Eine Datei in `config/niches/` anlegen – **kein Code**:

```json
{
  "name": "Sicherheitsdienste",
  "slug": "sicherheitsdienste",
  "country": "DEU",
  "cpv": ["79710000", "79713000"],
  "cpvPrefixes": ["7971"],
  "minValueEur": 100000,
  "excludeKeywords": ["Geldtransport"],
  "minDaysToDeadline": 10,
  "minScore": 50,
  "publicDelayHours": 48,
  "archiveKeepDays": 1100
}
```

Danach `node bin/radar.js scan` – die neue Nische ist automatisch im Vergleich.

### Aufbau

```
bin/radar.js        CLI
src/ted.js          TED-API: Query, Paging, Backoff, Fehlerklassen
src/normalize.js    Rohdaten -> internes Modell (wirft nie)
src/filter.js       Hartfilter + Relevanz-Score
src/insights.js     Auswertungen über dem Archiv: Profile, Preisband, Ähnlichkeit
src/html.js         Seitenhülle, CSS, Karten, Anmeldeblock
src/site.js         alle Seitentypen, Sitemap, robots.txt
src/render.js       Alert-Mail, Wochenüberblick, Archivseite, CSV
src/store.js        Zustand als JSON im Repo (Entdopplung ohne Datenbank)
src/subscribers.js  Abonnenten mit Einwilligungsnachweis
src/mail.js         Versand: "file" (Default) oder Resend
worker/subscribe.js Cloudflare Worker für Double-Opt-in (optional)
config/niches/      ein Gewerk = eine Datei
config/site.json    Domain, Impressum, Zahlungslinks
```

### Einrichtung für den Echtbetrieb

1. **GitHub Pages aktivieren:** Settings → Pages → Source „GitHub Actions". Ohne diesen Schritt
   schlägt der Deploy-Job fehl und die Seite bleibt unerreichbar.
2. **Workflow auslösen:** Actions → „Vergabe-Radar taeglich" → „Run workflow". Das ist zugleich
   der erste echte TED-Abruf — und der Moment, in dem sich zeigt, ob die API-Feldnamen stimmen.
3. **`config/site.json` füllen.** `baseUrl` ist auf die GitHub-Pages-Adresse vorbelegt und
   bestimmt zugleich den Pfadpräfix aller internen Links; bei eigener Domain hier die Domain
   eintragen, dann wird der Präfix automatisch leer. `impressum` muss vor dem ersten Versand
   stehen — sonst verweigert `renderMail` den Dienst.
4. **Versand** (erst wenn es Kunden gibt): Secret `RESEND_API_KEY`, Variable `MAIL_FROM`.
5. Details in [`VERTRIEB.md`](VERTRIEB.md) und [`SEO.md`](SEO.md).

Danach steht die Seite unter `https://phifa96.github.io/Business-Idee/`.

### Wenn `doctor` über Feldnamen klagt

Die exakten Feldnamen der TED-API konnten beim Bau nicht gegen die Live-API geprüft werden (der
Build-Rechner hatte keinen Netzzugang zu `ted.europa.eu`). `doctor` vergleicht die konfigurierten
Felder mit dem, was zurückkommt, und nennt die Abweichung. Korrigieren lässt sie sich in
`config/ted-schema.json`, ohne Code anzufassen:

```json
{
  "fields": { "deadline": "deadline-receipt-tender-date-lot" },
  "query":  { "country": "place-of-performance-country" }
}
```

Dasselbe gilt für die CPV-Codes in den Nischen-Dateien: vorbelegt nach bestem Wissen, einmal gegen
die [offizielle CPV-Liste](https://simap.ted.europa.eu/de/web/simap/cpv) zu prüfen.

---

Daten aus Tenders Electronic Daily (TED) der Europäischen Union, weiterverwendet nach Beschluss
2011/833/EU.
