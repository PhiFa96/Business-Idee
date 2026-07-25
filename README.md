# Business-Idee

Zwei Dinge liegen hier: die Analyse, die zu einem Geschäftsmodell geführt hat, und die
lauffähige Anwendung dazu.

- **[`geschaeftsmodelle.md`](geschaeftsmodelle.md)** — fünf konkrete Modelle, drei begründete
  Streichungen, für die zwei Überlebenden je ein 30-Tage-Test unter 200 €.
- **[`VERTRIEB.md`](VERTRIEB.md)** — der Weg vom ersten Befehl zum ersten zahlenden Kunden:
  Briefvorlage, Adressquellen, Preis, Abbruchkriterien.
- **Vergabe-Radar** — die Anwendung, siehe unten.

---

## Vergabe-Radar

Holt täglich die öffentlichen Ausschreibungen aus der TED-Datenbank der EU, filtert sie auf ein
einzelnes Gewerk und verschickt daraus eine Alert-Mail. Die Routinearbeit — jeden Morgen
Vergabeportale durchsehen — macht die Maschine; das Ergebnis ist das Abonnement.

**Kein Server, keine Datenbank, keine Abhängigkeiten.** Node 22 genügt. Der Zustand liegt als
JSON im Repo, der Zeitplan in GitHub Actions, das Archiv auf GitHub Pages — alles im kostenlosen
Kontingent. Laufende Kosten: 0 €.

### Schnellstart

```bash
node bin/radar.js doctor          # Konfiguration und Verbindung zu TED prüfen
node bin/radar.js scan --days 90  # alle vier Gewerke vergleichen
node bin/radar.js run --niche gebaeudereinigung
```

Ohne Internetzugang zu TED lässt sich alles gegen Testdaten ansehen:

```bash
npm run demo   # scan + render aus fixtures/, erzeugt site/ und out/
npm test       # 61 Tests, komplett offline
```

### Befehle

| Befehl | Zweck |
|---|---|
| `doctor` | Prüft Konfiguration, Erreichbarkeit und ob die TED-Feldnamen stimmen. Nennt fehlerhafte Felder im Klartext. |
| `scan [--days 90]` | Läuft über **alle** Gewerke und gibt eine Rangliste aus. Der Machbarkeits- und Abbruchtest. |
| `run --niche <slug>` | Abrufen, filtern, entdoppeln, Zustand speichern, Archiv und Mail erzeugen. |
| `render --niche <slug>` | Nur neu rendern, ohne Netz. |
| `send --niche <slug>` | Alert an die Abonnenten. Ohne `RESEND_API_KEY` automatisch Dry-Run nach `out/`. |

Flags: `--days N` · `--limit N` · `--max-pages N` · `--fixture` · `--dry-run` · `--since N` ·
`--archive-url URL`

### Ein neues Gewerk aufnehmen

Eine Datei in `config/niches/` anlegen — **kein Code**:

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
  "minScore": 50
}
```

Danach `node bin/radar.js scan` — die neue Nische ist automatisch im Vergleich.

### Aufbau

```
bin/radar.js     CLI
src/ted.js       TED-API: Query, Paging, Backoff, Fehlerklassen
src/normalize.js Rohdaten -> internes Modell (wirft nie)
src/filter.js    Hartfilter + Relevanz-Score
src/render.js    Alert-Mail, Archivseite, CSV/JSON
src/store.js     Zustand als JSON im Repo (Entdopplung ohne Datenbank)
src/mail.js      Versand: "file" (Default) oder Resend
config/niches/   ein Gewerk = eine Datei
fixtures/        Testdaten mit relativen Datumsangaben
```

### Einrichtung für den Echtbetrieb

1. **GitHub Pages** aktivieren: Settings → Pages → Source „GitHub Actions".
2. **Versand** (optional, erst wenn es Kunden gibt): Konto bei Resend, Domain verifizieren, dann
   Repository-Secret `RESEND_API_KEY` und Repository-Variable `MAIL_FROM` setzen. Ohne diese
   beiden schreibt der Workflow die Mail nur nach `out/` und verschickt nichts.
3. **Abonnenten** in `config/subscribers.json` eintragen.
4. `TED_API_KEY` ist optional — die TED-Suche ist öffentlich.

### Wenn `doctor` über Feldnamen klagt

Die exakten Feldnamen der TED-API konnten beim Bau nicht gegen die Live-API geprüft werden (der
Build-Rechner hatte keinen Netzzugang zu `ted.europa.eu`). `doctor` vergleicht die konfigurierten
Felder mit dem, was tatsächlich zurückkommt, und nennt die Abweichung. Korrigieren lässt sie sich
in `config/ted-schema.json` — diese Datei überschreibt die Vorgaben aus `src/ted.js`, ohne dass
Code angefasst werden muss:

```json
{
  "fields": { "deadline": "deadline-receipt-tender-date-lot" },
  "query":  { "country": "place-of-performance-country" }
}
```

Dasselbe gilt für die CPV-Codes in den Nischen-Dateien: vorbelegt nach bestem Wissen, einmal
gegen die [offizielle CPV-Liste](https://simap.ted.europa.eu/de/web/simap/cpv) zu prüfen.
