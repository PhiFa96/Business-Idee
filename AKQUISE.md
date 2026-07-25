# Akquise: die ersten Besucher

Die Seite ist auffindbar gebaut, aber Google braucht Monate. Bis dahin muss der Verkehr bezahlt
oder erarbeitet werden. Entschieden: **Google Ads.** Dieses Dokument enthält das fertige Material
dafür, dazu die Alternativen mit Kosten und – wichtig – die Punkte, an denen abgebrochen wird.

---

## 0. Was per E-Mail nicht geht

Vorweg, weil es die häufigste Fehlannahme ist: **Werbe-E-Mail an Firmen ohne deren vorherige
Einwilligung ist unzulässig** (§7 Abs. 2 Nr. 2 UWG). Es gibt keine B2B-Ausnahme. Konkret ebenfalls
erfasst:

- die einzeln von Hand geschriebene Nachricht – die Regel greift pro E-Mail, nicht ab einer Menge
- das Kontaktformular auf der Firmenseite – wird rechtlich wie E-Mail-Werbung behandelt
- die Adresse aus dem Impressum – eine Pflichtangabe nach §5 DDG, keine Einwilligung
- die **Anfrage nach Einwilligung** selbst – der BGH hat in der Double-opt-in-Entscheidung
  (I ZR 113/20 bzw. I ZR 164/09) festgehalten, dass eine Mail, die um Werbeerlaubnis bittet,
  bereits Werbung ist. Der Verstoß liegt in der ersten Mail, nicht erst in der zweiten.

Typische Folge: Abmahnung mit 500–1.500 € Kosten plus Unterlassungserklärung mit Vertragsstrafe.

Was legal an Firmen geht, die einen noch nicht kennen: **Telefon**, **Brief**, **bezahlte
Anzeigen**. Alles Weitere hier.

---

## 1. Google Ads

### Schritt 1: Suchvolumen prüfen, bevor Geld fließt

Kostenlos, dauert 20 Minuten, und ist das eigentliche Entscheidungskriterium. Ein Google-Ads-Konto
anlegen (ohne Kampagne zu starten), dann Tools → **Keyword-Planer** → „Suchvolumen abrufen".

> **Abbruchpunkt 1:** Liegt das summierte monatliche Suchvolumen aller Keywords eines Gewerks
> unter **100**, wird die Kampagne nicht gestartet. Dann ist bezahlte Suche für diese Nische der
> falsche Kanal – unabhängig vom Budget. Nächster Schritt wäre ein anderes Gewerk
> (neue Datei in `config/niches/`, dann `node bin/radar.js scan`).

Das ist der wahrscheinlichere Engpass als das Budget. „Ausschreibungen Gebäudereinigung" ist ein
sehr spitzer Begriff.

### Schritt 2: Kampagnenaufbau

Eine Kampagne je Gewerk, Suchnetzwerk **ohne** Displaynetzwerk-Partner (das ist die Voreinstellung,
die still das halbe Budget frisst). Standort Deutschland, Sprache Deutsch. Gebotsstrategie:
**manueller CPC**, kein „Conversions maximieren" – dafür fehlen anfangs die Daten.

- Tagesbudget **8 €**, maximaler CPC **1,50 €**
- Zielseite: `/<gewerk>/angebot.html` mit UTM-Parametern, z. B.
  `…/gebaeudereinigung/angebot.html?utm_source=google&utm_medium=cpc&utm_campaign=reinigung-de`

### Schritt 3: Keywords, exact match

Alle in eckigen Klammern, also **genau passend**. Weitgehend passende Keywords verbrennen bei
diesem Budget den Großteil des Geldes an Suchen, die nichts mit dem Angebot zu tun haben.

**Gebäudereinigung**
```
[ausschreibungen gebäudereinigung]
[öffentliche ausschreibungen reinigung]
[ausschreibung unterhaltsreinigung]
[reinigungsausschreibungen]
[vergabe gebäudereinigung]
[ausschreibungen reinigungsdienstleistungen]
```

**GaLaBau** — `[ausschreibungen galabau]`, `[ausschreibungen grünpflege]`,
`[ausschreibung baumpflege]`, `[öffentliche ausschreibungen landschaftsbau]`

**Elektro/SHK** — `[ausschreibungen elektroinstallation]`, `[ausschreibungen shk]`,
`[öffentliche ausschreibungen heizung sanitär]`

**Metallbau** — `[ausschreibungen metallbau]`, `[ausschreibungen stahlbau]`,
`[öffentliche ausschreibungen schlosser]`

### Schritt 4: Auszuschließende Keywords

Diese Liste rettet mehr Budget als jede Gebotsoptimierung. Vor dem Start eintragen, nicht danach:

```
kostenlos  gratis  job  jobs  stelle  stellenangebot  ausbildung  praktikum
muster  vorlage  definition  bedeutung  "was ist"  studium  seminar  schulung
schweiz  österreich  wikipedia  pdf  gesetz  vob  hoai
```

### Schritt 5: Anzeigentexte

Responsive Suchanzeige. Anzeigentitel maximal 30 Zeichen, Textzeilen maximal 90.

**Titel**
```
Ausschreibungen Reinigung
Täglich neu per E-Mail
Öffentliche Aufträge finden
Erster Monat für 1 €
Keine Frist mehr verpassen
Alle Vergaben Ihres Gewerks
```

**Textzeilen**
```
Werktäglich alle neuen öffentlichen Ausschreibungen für Ihr Gewerk per E-Mail.
Auftraggeber, Auftragswert und Frist auf einen Blick. 79 €/Monat, monatlich kündbar.
Archiv kostenlos einsehbar. Erster Monat 1 €. Keine Vertragsbindung.
```

Für andere Gewerke „Reinigung" jeweils ersetzen.

### Schritt 6: Messen ohne Cookie-Banner

**Bewusst kein Google-Conversion-Tag.** Es würde eine Einwilligung nach §25 TTDSG erzwingen, also
einen Cookie-Banner – der auf einer Landingpage messbar Umsatz kostet. Stattdessen:

1. UTM-Parameter in der Anzeigen-URL. Die Seite reicht sie automatisch an den Stripe-Link weiter
   (`data-utm` im erzeugten HTML, siehe `src/html.js`).
2. Je Kampagne eine **eigene Stripe-Zahlungsverknüpfung**. Dann steht in Stripe direkt, welche
   Kampagne den Kauf gebracht hat – ohne ein einziges Skript im Browser.

Wöchentlich gegenüberstellen: ausgegebene Euro in Google Ads gegen neue Abos in Stripe.

### Schritt 7: Rechnen und abbrechen

165 Klicks für 250 € (bei 1,50 € CPC). Bei einer für kaltes B2B realistischen Abschlussquote von
0,5–1,5 % sind das **1 bis 2 zahlende Abos**. Das ist knapp, aber messbar.

> **Abbruchpunkt 2:** 250 € ausgegeben und **kein einziges zahlendes Abo** → Stopp, nicht nachlegen.
>
> **Abbruchpunkt 3 (der übersehene):** Ein Abo für 150 € Akquisitionskosten rechnet sich nur, wenn
> es bleibt. Kündigt der erste Kunde nach dem 1-€-Monat, ist das kein Teilerfolg, sondern das
> Signal, dass das Produkt nicht trägt. Erst ein Kunde, der den **dritten** Monat bezahlt, zählt.

---

## 2. Telefon — 0 €, der einzige kostenlose Weg zu einer legalen E-Mail-Adresse

B2B-Telefonwerbung ist bei sachlich passendem Angebot nach §7 Abs. 2 Nr. 1 UWG über die mutmaßliche
Einwilligung zulässig. Graubereich, aber gängige Praxis – und im Gegensatz zur Kalt-E-Mail nicht
per se unzulässig.

**Leitfaden, 30 Sekunden, kein Termin, kein Verkaufsgespräch:**

> „Guten Tag, mein Name ist [Name]. Ich rufe an, weil ich die öffentlichen Ausschreibungen für
> [Gewerk] zusammenstelle. In [Bundesland] waren das in den letzten drei Monaten [Zahl aus `scan`]
> Stück. Ich kann Ihnen die Liste zeigen – die Adresse ist [Domain]. Soll ich Ihnen den Link kurz
> per E-Mail schicken?"

Sagt der Betrieb ja, ist das die Einwilligung. **Sofort dokumentieren:**

```
node bin/radar.js subscribers add --niche gebaeudereinigung --email info@betrieb.de --plan digest
node bin/radar.js subscribers confirm --niche gebaeudereinigung --email info@betrieb.de \
  --kanal telefon --notiz "Zustimmung am Telefon, Herr Meier, 25.07.2026 10:14 Uhr"
```

Ohne Notiz verweigert das Werkzeug die Bestätigung – der Nachweis ist der einzige Schutz im
Streitfall.

**Die drei Reaktionen, die tatsächlich kommen:**

| Sie sagen | Sie antworten |
|---|---|
| „Kein Interesse." | „Verstehe. Die Liste steht offen unter [Domain], falls Sie später mal schauen wollen. Danke, auf Wiederhören." — Nicht nachfassen. |
| „Schicken Sie mal was." | „Gern. Auf welche Adresse?" — Das ist die Einwilligung. Notieren. |
| „Wer sind Sie überhaupt?" | „[Name], ich betreibe [Domain]. Die Daten kommen aus der EU-Ausschreibungsdatenbank TED, ich sortiere sie nach Gewerk." |

**Anrufliste:** Adressen aus den Verzeichnissen der Handwerkskammern und Innungen. Als CSV mit den
Spalten `betrieb;telefon;ort;ergebnis;wiedervorlage;notiz` führen.

> **Abbruchpunkt:** Brauchst du für 60 brauchbare Nummern mehr als 3 Stunden, sind 1.000 Nummern
> 50 Stunden – dann ist auch dieser Kanal arbeitszeitproportional.

---

## 3. Die übrigen Kanäle, mit Kosten

| Kanal | Kosten | Anmerkung |
|---|---|---|
| Brief | ~1,20 €/Stück, 60 Stück ≈ 90 € | Legal, individuell, der billigste bezahlte Weg. Rücklauf realistisch 0,5–2 %. |
| Fachpresse / Innungsrundschreiben | 200–800 € einmalig | Sehr zielgenau, kein Algorithmus. Frisst das Budget auf einen Schlag. |
| Branchenverzeichnisse | 0–150 €/Jahr | Wenig Verkehr, aber Verweise, die der Auffindbarkeit helfen. |
| SEO | 0 € Geld, 6–18 Monate Zeit | Bereits gebaut. Siehe `SEO.md`. |

---

## 4. Reihenfolge

1. `node bin/radar.js scan --days 90` – trägt die Nische überhaupt?
2. Keyword-Planer – gibt es Suchvolumen? (Abbruchpunkt 1)
3. `config/site.json` füllen, Domain verbinden, Stripe-Link anlegen
4. Kampagne mit 8 €/Tag starten, 30 Tage laufen lassen
5. Parallel und kostenlos: 60 Anrufe
6. Nach 30 Tagen gegen Abbruchpunkt 2 und 3 prüfen

Punkt 5 ist kein Beiwerk. Er kostet nichts und liefert etwas, das Anzeigen nicht liefern: die
Sätze, mit denen Betriebe das Problem selbst beschreiben. Die gehören dann in die Anzeigentexte.
