# Vertrieb: von der Zahl zum ersten zahlenden Kunden

Die Technik ist fertig. Das hier ist der Teil, an dem es tatsächlich scheitert oder nicht.
Alles darin folgt den Randbedingungen aus [`geschaeftsmodelle.md`](geschaeftsmodelle.md):
keine Kaltakquise per E-Mail (§7 Abs. 2 Nr. 2 UWG), kein SEO, keine Reichweite, unter 200 €.

---

## Schritt 0 — Bevor du irgendetwas verkaufst

Zwei Dinge müssen erledigt sein, sonst ist der erste Verkauf ein Rechtsproblem statt eines Erfolgs:

1. **Gewerbeanmeldung** beim Gewerbeamt. Kostet je nach Kommune 15–65 €, dauert 15 Minuten,
   oft online.
2. **Impressum** auf der Verkaufsseite mit bürgerlichem Namen und ladungsfähiger Anschrift
   (§5 DDG). Eine c/o-Geschäftsadresse für 20–40 €/Monat verbirgt die Wohnanschrift — den Namen
   verbirgt sie nicht. Das war der Punkt aus der Analyse: **Anonymität ist hier nicht verfügbar.**

Dazu Kleinunternehmerregelung nach §19 UStG prüfen (unter 22.000 € Vorjahresumsatz): dann keine
Umsatzsteuer auf den Rechnungen, was die Buchhaltung im ersten Jahr erheblich vereinfacht.

---

## Schritt 1 — Die Nische kommt aus den Daten, nicht aus dem Bauchgefühl

```
node bin/radar.js doctor
node bin/radar.js scan --days 90
```

`scan` läuft über alle vier konfigurierten Gewerke und liefert eine Rangliste. **Die Entscheidung
ist damit gefallen, nicht verhandelbar:**

| Ergebnis des besten Gewerks | Konsequenz |
|---|---|
| unter 30 brauchbare Ausschreibungen in 90 Tagen | Abbruch. Kein Brief wird gedruckt. Weiter unten steht, was dann. |
| 30 bis 60 | Grenzfall. Ein Alert alle 3–4 Tage ist dünn, aber verkaufbar — Preis auf 49 € senken. |
| über 60 | Tragfähig. Weiter mit Schritt 2, Preis bei 79 €. |

Das kostet null Euro und ersetzt die 14 Tage manuelle Portalsichtung aus der Analyse.

---

## Schritt 2 — Die Verkaufsseite

Eine Seite. Kein Baukasten-Abo nötig — GitHub Pages hostet sie kostenlos neben dem Archiv.

Inhalt, in dieser Reihenfolge:

1. **Überschrift, die den Nutzen nennt, nicht das Produkt.**
   Nicht „Vergabe-Radar", sondern: *„Jeden Morgen um 6 Uhr: alle öffentlichen
   Reinigungsausschreibungen in Deutschland, gefiltert auf Ihr Gewerk."*
2. **Ein echter Screenshot der Alert-Mail von gestern.** Nicht gezeichnet, nicht beschönigt.
   Erzeugst du mit `node bin/radar.js send --niche <slug> --dry-run` — die Datei liegt in `out/`.
3. **Die Zahl aus `scan`.** *„Im letzten Quartal waren das 64 Ausschreibungen mit einem
   Auftragsvolumen von zusammen 41 Mio. €."* Das ist der einzige Beweis, den du hast — benutz ihn.
4. **Preis offen sichtbar.** 79 €/Monat, monatlich kündbar. Kein „Preis auf Anfrage" — das
   erzwingt ein Gespräch, und Gespräche hast du ausgeschlossen.
5. **Stripe Payment Link.** Im Stripe-Dashboard anlegen, kein Code, kein Webhook. Der Link führt
   direkt in die Zahlung. Erste 30 Tage für 1 € als Einstiegsangebot.
6. **Link auf das öffentliche Archiv.** Es beweist, dass der Dienst existiert und läuft.

Nach der Zahlung trägst du die E-Mail-Adresse von Hand in `config/subscribers.json` ein. Bei bis zu
20 Kunden ist das eine Minute pro Woche — jede Automatisierung davor ist verfrüht.

---

## Schritt 3 — 60 Briefe

Der einzige Kanal, der alle Ausschlusskriterien überlebt und dabei legal ist.

**Adressen.** Handwerkskammer-Verzeichnisse und Innungslisten sind öffentlich und nach Gewerk
sortiert. Für Gebäudereinigung: die Landesinnungsverbände des Gebäudereiniger-Handwerks. Ziel:
60 Betriebe mit 10–80 Mitarbeitern in **einem** Bundesland.

> **Achtung, das ist gleichzeitig ein Abbruchkriterium.** Brauchst du für 60 saubere Adressen mehr
> als 3 Stunden, dann sind 1.000 Adressen 50 Stunden — und das Modell wäre arbeitszeitproportional,
> also durch dein eigenes Kriterium ausgeschlossen. Miss die Zeit mit.

**Der Brief.** Eine Seite, DIN lang, adressiert an den Inhaber persönlich. Beigelegt: ein
**ausgedruckter echter Alert** der letzten Woche.

> Sehr geehrte Frau /  Herr [Name],
>
> in den letzten 90 Tagen wurden in [Bundesland] **[Zahl aus scan]** öffentliche Ausschreibungen
> für Gebäudereinigung veröffentlicht — zusammen rund [Summe] € Auftragsvolumen. Der Ausdruck
> in der Anlage zeigt, wie die Liste in der vergangenen Woche aussah.
>
> Wer diese Ausschreibungen sehen will, muss bisher entweder täglich mehrere Vergabeportale
> durchsuchen oder ein Branchenabo für 250 bis 600 € im Monat abschließen.
>
> Ich schicke Ihnen dieselbe Liste jeden Werktag um 6 Uhr per E-Mail, gefiltert ausschließlich
> auf Ihr Gewerk. 79 € im Monat, monatlich kündbar. Der erste Monat kostet 1 €.
>
> [URL] — dort können Sie das Archiv der letzten Wochen ansehen, bevor Sie irgendetwas bezahlen.
>
> [Name, Anschrift, Telefonnummer]

**Kosten.** 60 × (Druck ~0,25 € + Porto 0,95 €) = **72 €**, plus Domain ~15 €. Zusammen unter 90 €.

**Warum ein Brief und keine E-Mail:** Kalt-E-Mail an Gewerbetreibende ohne Einwilligung ist nach
§7 Abs. 2 Nr. 2 UWG unzulässig und abmahnfähig. Ein Brief ist es nicht. Nebeneffekt: In einem
Postfach voller Werbung ist ein Brief mit einem ausgedruckten, konkret relevanten Datenauszug ein
Fremdkörper — und genau deshalb wird er gelesen.

---

## Schritt 4 — Auswerten und entscheiden

Nach 30 Tagen. Die Schwelle stand vor dem Test fest und wird nicht nachträglich weichgerechnet:

| Signal | Bedeutung |
|---|---|
| **2 oder mehr Abos, die den 1-€-Monat überleben** | Weitermachen. Zweite Briefwelle, 200 Stück, anderes Bundesland. |
| 1 Abo | Grenzfall. Genau eine Nachjustierung erlaubt (Preis oder Brieftext), dann eine zweite Welle mit 60 Briefen. Danach ist Schluss. |
| **0 Abos, aber Rückfragen kamen** | Das Angebot ist falsch, nicht der Kanal. Frag die Rückfrager direkt, was gefehlt hat. |
| **0 Abos, 0 Rückfragen** | Abbruch. Der Kanal erreicht die Person nicht, und einen zweiten legalen Kanal gibt es in diesem Rahmen nicht. |

Ein Abo, das nach dem 1-€-Monat kündigt, zählt als Fehlschlag — nicht als halber Erfolg.

---

## Wenn `scan` unter der Schwelle bleibt

Das ist ein wahrscheinlicher Ausgang, kein Betriebsunfall. Drei Optionen, in dieser Reihenfolge:

1. **Anderes Gewerk.** Eine neue Datei in `config/niches/`, CPV-Codes eintragen, `scan` erneut.
   Kostet 20 Minuten und keinen Cent. Kandidaten: Sicherheitsdienste (CPV 79710000),
   Catering und Verpflegung (55500000), Winterdienst (90620000), Aufzugswartung (50750000).
2. **Zuschlagsbekanntmachungen statt Auftragsbekanntmachungen.** Aus `geschaeftsmodelle.md`: wer
   hat gewonnen, zu welchem Preis, gegen wie viele Bieter. Verkauft Kalkulationswissen statt
   Auftragsvorlauf, ist nicht tagesaktuell und verzeiht daher Ausfälle. Schwächeres Kaufargument,
   robusteres Produkt.
3. **Aufhören.** Das ist der Sinn eines Abbruchkriteriums. Die 90 € sind dann der Preis für eine
   Antwort, die du sonst nach sechs Monaten und mit deutlich mehr Aufwand bekommen hättest.

---

## Was hier bewusst fehlt

Kein CRM, keine Abonnentendatenbank, kein Stripe-Webhook, keine doppelte Buchführung im Code.
Jedes dieser Teile ist erst dann sinnvoll, wenn es zahlende Kunden gibt — und wenn es sie gibt,
ist der Umbau ein Nachmittag. Vorher ist es Beschäftigung, die sich wie Fortschritt anfühlt.
