# Auffindbarkeit: Einrichtung, Erwartung, Abbruchkriterium

Die Seite ist so gebaut, dass sie ranken **kann**. Das ist etwas anderes, als dass sie rankt.
Dieses Dokument sagt, was einzurichten ist, was realistisch zu erwarten ist und woran erkennbar
wird, dass es nicht funktioniert.

---

## Was bereits gebaut ist

- **Inhalt als echtes HTML.** Die Listen stehen im Dokument, JavaScript filtert nur noch. Ohne
  Skript bleibt die Seite vollständig lesbar — der CI-Lauf prüft das bei jedem Push.
- **Rund 900 indexierbare Seiten** statt einer: je Ausschreibung eine Detailseite, dazu
  Auftraggeber-Profile, Bundesland-Seiten und ein paginiertes Archiv.
- **Abgeleiteter Inhalt.** Auf den Detail- und Auftraggeberseiten steht, was aus dem eigenen
  Bestand berechnet wurde: Vergabehistorie, Rhythmus, Preiseinordnung. Das ist der Grund, warum
  die Seiten überhaupt eine Chance haben (siehe unten).
- Titel und Beschreibung je Seite, `canonical`, OpenGraph, `BreadcrumbList` als strukturierte
  Daten, `sitemap.xml`, `robots.txt`, interne Verlinkung.

## Einrichtung, einmalig

1. **Eigene Domain.** `phifa96.github.io` ist als Basis schwach und wirkt für ein B2B-Produkt
   unseriös. Eine `.de`-Domain kostet 10–15 € im Jahr.
   - Domain kaufen, `CNAME`-Eintrag auf `phifa96.github.io` setzen
   - Datei `site/CNAME` mit dem Domainnamen anlegen (der Seitenbau lässt sie stehen)
   - GitHub → Settings → Pages → Custom domain eintragen, „Enforce HTTPS" aktivieren
2. **`config/site.json` füllen.** `baseUrl` und `impressum` sind Pflicht. Ohne `baseUrl` entsteht
   keine Sitemap, ohne `impressum` verweigert der Mailversand den Dienst.
3. **Bestand aufbauen.** Eine leere Seite wird nicht indexiert:
   ```
   node bin/radar.js backfill --niche <slug> --days 365
   node bin/radar.js build-site
   ```
4. **Google Search Console.** Domain hinzufügen, per DNS-TXT-Eintrag bestätigen,
   `https://<domain>/sitemap.xml` einreichen. Ohne Search Console gibt es keinen Einblick, ob
   überhaupt etwas indexiert wird — und damit auch keine Grundlage für die Abbruchentscheidung.
5. **Bing Webmaster Tools.** Fünf Minuten, importiert die Search-Console-Daten. Bing ist klein,
   aber die Konkurrenz dort ist es auch.

## Prüfen

```
node bin/radar.js seo-report
```

Zeigt Seitenzahl, Anteil mit Anreicherung, dünne Seiten, fehlende Beschreibungen und die
durchschnittliche interne Verlinkung.

---

## Was realistisch zu erwarten ist

**6 bis 18 Monate.** Die Konkurrenz um „Ausschreibungen Gebäudereinigung" heißt ibau, DTAD,
subreport und Deutsches Ausschreibungsblatt — Domains mit zwanzig Jahren Historie und tausenden
Verweisen. Dagegen gewinnt man nicht in einem Quartal und mit fünf Stunden pro Woche.

**Der eigentliche Hebel ist nicht die Technik.** Technisch ist die Seite jetzt in Ordnung; das ist
die Eintrittskarte, nicht der Vorsprung. Was zählt:

1. **Abgeleiteter statt kopierter Inhalt.** Ein 1:1-Spiegel von TED wird von Google als
   Doppelinhalt behandelt und rankt nicht — es gibt bereits Dutzende davon. Was hier entsteht,
   steht in keinem Rohdatensatz: „Die Stadt Bochum hat seit 2023 sieben Reinigungsaufträge über
   zusammen 12,4 Mio. € vergeben, im Schnitt alle acht Monate." Das ist der Unterschied zwischen
   einer Seite, die indexiert wird, und einer, die es nicht wird.
2. **Bestand.** Ein Jahr Rückblick über `backfill` erzeugt sofort Substanz. Je länger die Historie,
   desto belastbarer die Profile.
3. **Verweise von außen.** Der schwächste Punkt, und der einzige, den kein Code löst. Realistisch
   erreichbar: Eintrag in Verzeichnisse von Handwerkskammern und Innungen, Erwähnung in einem
   Fachforum, Verlinkung aus einem Branchen-Newsletter.

## Der lange Weg vorher

Zwischen dem ersten Seitenbau und dem ersten Besucher aus einer Suche liegen Monate, in denen die
Seite existiert, aber niemand kommt. Deshalb steht in `AKQUISE.md` der bezahlte Kanal — SEO ist
das Fundament, nicht der Start.

---

## Abbruchkriterium

> Sind **90 Tage** nach dem Einreichen der Sitemap laut Search Console weniger als **20 %** der
> eingereichten Seiten indexiert, wird diese Seite nicht ranken. Dann ist der Kanal tot,
> unabhängig davon, wie viel weiter investiert wird.

Wo nachzusehen ist: Search Console → Indexierung → Seiten. Dort steht „indexiert" gegen „nicht
indexiert" mit Begründung. Die häufigste Begründung bei einem Projekt dieser Art lautet
*„Gecrawlt – zurzeit nicht indexiert"*. Übersetzt: Google hat sich die Seiten angesehen und für zu
wenig eigenständig befunden.

Tritt das ein, gibt es genau zwei sinnvolle Reaktionen — und Weitermachen wie bisher ist keine
davon:

1. **Anreicherung vertiefen.** Mehr Bestand über `backfill`, mehr abgeleitete Aussagen je Seite.
2. **Kanal wechseln.** Bezahlte Suche und Telefon aus `AKQUISE.md` funktionieren unabhängig davon,
   ob Google die Seite mag.
