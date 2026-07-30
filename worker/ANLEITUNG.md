# Anmeldeformular in Betrieb nehmen

Der Worker ist fertig und getestet (`test/worker.test.js`). Was fehlt, sind Konten.
Bis dahin läuft die Anmeldung per E-Mail — das ist kein Provisorium, sondern ein
vollwertiger Weg (siehe unten).

## Die Reihenfolge ist nicht beliebig

Der häufigste Fehlschlag: erst deployen, dann feststellen, dass Resend nichts
verschickt. Ohne Absenderdomain nimmt Resend keine Mail an, und ohne Mail kann
niemand bestätigen — der Worker läuft dann, nimmt Anmeldungen entgegen und
bestätigt keine einzige.

### 1. Absenderdomain klären

Nötig ist eine Domain, deren DNS du kontrollierst. `gmail.com` geht nicht.

Falls du DNS-Zugriff auf `postomnia.com` hast, reicht das — dann etwa
`radar@postomnia.com` als Absender. Sonst eine Domain kaufen (10–15 €/Jahr).

Eine eigene Domain hätte einen zweiten Nutzen: Sie ersetzt
`phifa96.github.io/Business-Idee/` und entfernt damit das Pfadsegment
`/Business-Idee/` aus allen 33 895 Adressen. Dafür in `config/site.json` die
`baseUrl` ändern — der Präfix aller internen Links passt sich selbst an
(`linker()` in `src/site.js`).

### 2. Resend einrichten

1. Konto auf resend.com anlegen.
2. Domain hinzufügen, die genannten DNS-Einträge setzen (SPF, DKIM), verifizieren
   lassen. Das dauert je nach Anbieter Minuten bis Stunden.
3. API-Schlüssel erzeugen.

**Erst weitermachen, wenn die Domain in Resend als verifiziert angezeigt wird.**

### 3. Worker deployen

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create SUBS      # gibt eine ID aus
```

Die ID in `wrangler.toml` bei `[[kv_namespaces]] id = …` eintragen, außerdem in
`[vars]`:

- `MAIL_FROM` — die verifizierte Absenderadresse aus Schritt 2
- `SITE_URL` — `https://phifa96.github.io/Business-Idee/` (nur der Rückweg im
  Mailfuß; der Bestätigungslink wird **nicht** hieraus gebaut)
- `IMPRESSUM` — dieselbe Angabe wie in `config/site.json`

Dann die Geheimnisse:

```bash
npx wrangler secret put RESEND_API_KEY     # aus Schritt 2
npx wrangler secret put EXPORT_KEY         # lange Zufallszeichenkette, selbst ausdenken
npx wrangler deploy
```

Wrangler nennt am Ende die Adresse, etwa
`https://vergabe-radar-anmeldung.<konto>.workers.dev`.

### 4. Formular auf der Website scharfschalten

In `config/site.json`:

```json
"subscribeEndpoint": "https://vergabe-radar-anmeldung.<konto>.workers.dev"
```

Ab dem nächsten Lauf ersetzt das Formular den mailto-Knopf auf allen Seiten.
Codeänderung ist keine nötig — `subscribeBlock()` entscheidet danach.

### 5. Anmeldungen in den Workflow holen

Im GitHub-Repository unter *Settings → Secrets and variables → Actions*:

- Variable `SUBSCRIBE_EXPORT_URL` = `<Worker-Adresse>/api/export`
- Secret `EXPORT_KEY` = derselbe Wert wie in Schritt 3

Der tägliche Lauf holt die Anmeldungen dann selbst ab (`subscribers sync`) und
legt den Einwilligungsnachweis versioniert ab.

**`config/subscribers.json` gehört nicht ins Repository** — die Datei ist in
`.gitignore` und der Workflow committet sie ausdrücklich nicht. Im Betrieb kommt
die Liste aus dem Secret `SUBSCRIBERS_JSON`.

## Prüfen, ob es wirklich funktioniert

Selbst anmelden und den ganzen Weg durchgehen:

1. Auf einer Detailseite die eigene Adresse eintragen.
2. Die Bestätigungsmail muss ankommen. Der Link darin muss auf die
   **Worker-Adresse** zeigen, nicht auf `github.io`.
3. Klicken → „Anmeldung bestätigt".
4. `node bin/radar.js subscribers list --niche <gewerk>` zeigt den Eintrag als
   `aktiv` mit Zeitstempel.
5. Den Abmeldelink aus einer Alert-Mail anklicken → sofort abgemeldet, ohne
   Rückfrage.

Bleibt Schritt 2 aus, liegt es fast immer an der Domainverifizierung, nicht am
Worker.

## Solange kein Worker läuft: der Weg per E-Mail

`kontaktEmail` in `config/site.json` genügt, damit auf jeder Seite ein
Anmeldeknopf steht. Der Interessent verschickt aus seinem eigenen Postfach eine
Mail, die den Einwilligungswortlaut enthält.

**Das ist der stärkere Nachweis, nicht der schwächere.** Beim Formular klickt
jemand einen Link; hier liegt eine selbst verfasste Willenserklärung mit
Absender und Zeitstempel vor.

Bei jeder eingehenden Anmeldung:

1. Die Mail archivieren — sie ist der Nachweis.
2. Eintragen:

```bash
node bin/radar.js subscribers add --email chef@firma.de --niche galabau \
  --plan digest --quelle "Anmeldemail vom 30.07.2026"

node bin/radar.js subscribers confirm --email chef@firma.de --niche galabau \
  --kanal web --notiz "Anmeldemail vom 30.07.2026, im Postfach archiviert"
```

`--plan digest` ist der kostenlose Wochenüberblick; ohne die Angabe wird der
kostenpflichtige Alert eingetragen. `--quelle` gehört zu `add`, `--kanal` und
`--notiz` zu `confirm` — dort landen sie im Nachweis.

`confirm` ist hier berechtigt, weil die eingegangene Mail die Bestätigung
bereits ist — anders als bei einem Formular, wo der Klick noch aussteht.

3. Den Inhalt von `config/subscribers.json` in das GitHub-Secret
   `SUBSCRIBERS_JSON` übertragen, sonst kennt der tägliche Lauf den Eintrag
   nicht.

Schritt 3 ist Handarbeit und der Grund, warum sich der Worker ab etwa einem
Dutzend Anmeldungen lohnt.
