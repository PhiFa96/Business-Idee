# Fünf Geschäftsmodelle unter harten Ausschlusskriterien

Analyse vom 25.07.2026.

## Der Rahmen

**Ausgeschlossen:** Personal · Lagerhaltung · Kundentermine · Abhängigkeit von einer einzelnen
Plattform oder einem Algorithmus · „erst Reichweite aufbauen"-Vorstufen · arbeitszeitproportionaler
Umsatz.

**Ausgangslage:** nebenberuflich, 5–10 h/Woche · unter 500 € für die ersten 6 Monate · keine
Software- oder Ingenieursfachbasis · kein nutzbares Netzwerk · Wunsch nach Anonymität.

---

## Teil 0 — Zwei Blocker, die vor jeder Idee stehen

### 1. „Anonym" ist in Deutschland nicht verfügbar

Jeder gewerbliche Verkauf braucht ein Impressum mit bürgerlichem Namen und ladungsfähiger
Anschrift (§5 DDG, vormals §5 TMG), dazu eine Gewerbeanmeldung, und auf jeder Rechnung steht
deine Adresse. Es gibt darunter keine legale Konstruktion für unter 500 €: Eine UG kostet Notar,
Handelsregister und Bilanzierung — und schützt den Namen ohnehin nicht, weil der Registereintrag
öffentlich ist. Eine c/o-Geschäftsadresse (20–40 €/Monat) verbirgt die Wohnanschrift, nicht die
Person.

**Konsequenz:** Anonymität ist kein Kriterium, das sich erfüllen lässt. Es muss fallen, sonst gibt
es kein Geschäft. Das ist keine Randnotiz — es entscheidet, ob überhaupt eine der fünf Ideen
existieren darf.

### 2. Der einzige Vertriebskanal, der alle Kriterien überlebt, ist per E-Mail verboten

Die Kriterien schließen aus: Reichweitenaufbau (kein Content, kein Newsletter, kein Social),
Algorithmusabhängigkeit (**also auch kein SEO** — Google ist ein Algorithmus) und Kundentermine
(kein Vertriebsgespräch). Übrig bleiben bezahlte Anzeigen — dafür fehlt das Budget — oder
Kaltakquise. Kalt-E-Mail an Gewerbetreibende ist in Deutschland ohne vorherige Einwilligung nach
§7 Abs. 2 Nr. 2 UWG unzulässig und abmahnfähig.

Was legal und algorithmusfrei bleibt: **Briefpost.**

Beide überlebenden Ideen bauen deshalb auf Briefkampagnen. Das ist keine Stilfrage, sondern die
Restmenge nach Abzug aller Ausschlüsse.

---

## Teil 1 — Fünf konkrete Modelle

### Idee 1 — „Vergabe-Radar Metallbau"

**Was, an wen, zu welchem Preis.** Tägliche Alert-Mail (Mo–Fr) plus durchsuchbares Webarchiv mit
allen öffentlichen Ausschreibungen in Deutschland für *ein einziges* Gewerk — Metallbau, Schlosser,
Tore, Geländer —, gefiltert nach Bundesland und Auftragswert. Quellen: TED (offene EU-API,
ausdrücklich zur Weiterverwendung freigegeben), service.bund.de, Vergabemarktplätze der Länder.
Käufer: Inhaber oder Kalkulator eines Metallbaubetriebs mit 8–40 Mitarbeitern; davon gibt es in
Deutschland rund 4.000–6.000. Preis: **79 €/Monat**, 790 €/Jahr, Self-Checkout über Stripe.

**Warum die Nachfrage stabil bleibt.** Öffentliche Auftraggeber *müssen* nach GWB, VgV und UVgO
ausschreiben. Das Volumen schwankt mit der Konjunktur, verschwindet aber nie — und in schwachen
Baujahren steigt der Bedarf an Auftragsvorlauf sogar.

**Verteidigbarer Vorteil: schwach.** Die Daten sind öffentlich, und ibau, DTAD, subreport sowie das
Deutsche Ausschreibungsblatt gibt es seit Jahrzehnten. Der einzige Vorteil ist Preisarbitrage: Die
Etablierten verkaufen breite Pakete für 250–600 €/Monat und können kein 79-€-Ein-Gewerk-Produkt
anbieten, ohne ihr eigenes Preisgefüge zu beschädigen. Das ist ein Zeitfenster, kein Burggraben.
Nach 24 Monaten bleiben nur die Kundenliste und die Trägheit im Abo.

**Kapital und Zeit bis zum ersten Euro.** 0–120 € (Domain, Server; Stripe rein transaktionsbasiert).
Erster Euro nach 8–12 Wochen.

**Laufender Aufwand nach 12 Monaten.** 3–6 h/Woche, überwiegend Reparatur: Vergabeportale ändern
ihre Struktur, und jede Änderung bricht die Datenpipeline.

**Größtes Risiko.** Betriebsrisiko, nicht Marktrisiko. Ein Produkt, dessen einziger Wert Aktualität
ist, verzeiht keinen Ausfall — und es gibt keine Vertretung. Zweitrisiko: Nutzungsbedingungen und
Datenbankschutz (§87b UrhG) der Länderportale. TED ist frei nutzbar, die Landesportale sind es
nicht durchgehend.

---

### Idee 2 — „Betriebsanweisungs-Generator nach GefStoffV §14"

**Was, an wen, zu welchem Preis.** Web-Tool: Sicherheitsdatenblatt als PDF hochladen, heraus kommt
die betriebsspezifische Betriebsanweisung im vorgeschriebenen Vier-Block-Format inklusive
Piktogrammen und H-/P-Sätzen, dazu eine jährliche Aktualisierungsprüfung. Käufer: Verantwortliche
in Betrieben mit 10–100 Mitarbeitern, die Gefahrstoffe lagern — Lackierereien, Galvanik,
Gebäudereinigung, Kfz-Werkstätten, Labore. Konkret: die Person, die vor der nächsten
BG-Begehung Angst hat. Preis: **39 €/Monat** für bis zu 50 Stoffe.

**Warum die Nachfrage stabil bleibt.** §14 GefStoffV schreibt Betriebsanweisungen zwingend vor,
Berufsgenossenschaften prüfen, Verstöße sind bußgeldbewehrt. Jede CLP-Anpassung erzwingt neue
Sicherheitsdatenblätter und damit neue Betriebsanweisungen — wiederkehrender Bedarf, kein
Einmalkauf.

**Verteidigbarer Vorteil: keiner.** Umwelt-online, Quentic, diverse Gefahrstoffmanager und sogar
kostenlose BG-Vorlagen decken das ab. Eine bessere Upload-Automatik ist in einem Quartal kopiert.

**Kapital und Zeit bis zum ersten Euro.** 100–300 €. Erster Euro nach 10–14 Wochen.

**Laufender Aufwand nach 12 Monaten.** 4–8 h/Woche, überwiegend fachliche Pflege.

**Größtes Risiko.** Haftung. Ein fehlerhaft generiertes Dokument in einem Arbeitsunfallverfahren.

---

### Idee 3 — „Rückruf- & Kennzeichnungs-Monitor Lebensmittel"

**Was, an wen, zu welchem Preis.** Wochenreport plus Sofort-Alert zu Änderungen an der LMIV
1169/2011, den Zusatzstoff- und Kontaminanten-Verordnungen, RASFF-Meldungen und
lebensmittelwarnung.de — gefiltert auf die Produktkategorie des Kunden. Käufer:
QM-Verantwortliche in Lebensmittelherstellern mit 5–50 Mitarbeitern: Filialbäckereien, Saucen- und
Getränkemanufakturen, Hersteller von Nahrungsergänzungsmitteln. Preis: **49 €/Monat**.

**Warum die Nachfrage stabil bleibt.** EU-Lebensmittelrecht ändert sich permanent, und ein Rückruf
ist für einen kleinen Hersteller existenzbedrohend.

**Verteidigbarer Vorteil: schwach bis keiner.** Behr's Verlag, der Lebensmittelverband und diverse
Kanzlei-Newsletter decken das ab, teils kostenlos. Der eigentliche Wert liegt in der fachlichen
Vorfilterung.

**Kapital und Zeit bis zum ersten Euro.** Unter 100 €. Erster Euro nach 10–14 Wochen.

**Laufender Aufwand nach 12 Monaten.** 5–8 h/Woche, überwiegend redaktionell.

**Größtes Risiko.** Das Produkt ist redaktionell und damit arbeitszeitproportional — es verletzt
das eigene Ausschlusskriterium bereits im Normalbetrieb.

---

### Idee 4 — „Bestehendes Micro-SaaS kaufen statt bauen"

**Was, an wen, zu welchem Preis.** Kauf eines laufenden Micro-SaaS mit 400–700 € MRR über
Acquire.com, Tiny Acquisitions oder Flippa; üblicher Multiple 2,5–4× Jahresgewinn. Der Käufer
bist du; die zahlenden Kunden existieren bereits. Kaufpreis **12.000–25.000 €**, Umsatz ab Tag 1.

**Warum die Nachfrage stabil bleibt.** Weil sie als einzige in dieser Liste keine Hypothese ist.
Die Zahlungsbereitschaft ist bereits bewiesen und im Kaufpreis eingepreist.

**Verteidigbarer Vorteil.** Gekauft statt gebaut — völlig legitim und strukturell der sauberste Weg
zu nicht arbeitszeitproportionalem Umsatz ohne Reichweite.

**Kapital und Zeit bis zum ersten Euro.** 12.000–25.000 €. Erster Euro nach etwa 30 Tagen (Closing).

**Laufender Aufwand nach 12 Monaten.** 3–5 h/Woche bei sauberer Technik, unbegrenzt bei unsauberer.

**Größtes Risiko.** Ohne Entwicklerfähigkeit ist die technische Due Diligence blind. Was auf diesen
Marktplätzen verkauft wird, ist überproportional oft ein Produkt mit sinkendem Umsatz aus einem
sterbenden Kanal.

---

### Idee 5 — „DSGVO-Ordner für eingetragene Vereine"

**Was, an wen, zu welchem Preis.** Digitales Paket als PDF und bearbeitbares DOCX: ein fertig
ausgefülltes Verzeichnis von Verarbeitungstätigkeiten für die neun typischen Vereinsprozesse
(Mitgliederverwaltung, Beitragseinzug, Website, Fotos, Newsletter, Übungsbetrieb, Ehrungen,
Sponsoren, Buchhaltung), TOM-Dokumentation, Muster-AV-Verträge, Einwilligungs- und
Fotoformulare, Informationspflichten nach Art. 13 DSGVO, Löschkonzept. Käufer: Vorstand oder
Schriftführer eines e.V. mit 100–1.500 Mitgliedern — Sport, Musik, Schützen. In Deutschland
existieren rund 600.000 eingetragene Vereine. Preis: **129 € einmalig, 39 €/Jahr Update-Abo**.

**Warum die Nachfrage stabil bleibt.** Die DSGVO bleibt. Vorstände wechseln alle ein bis drei
Jahre, und jeder neue Vorstand entdeckt das Thema neu. Der Bedarf erneuert sich also durch
Personalfluktuation, nicht durch Marktwachstum — das ist die verlässlichere der beiden Mechaniken.
Landesdatenschutzbeauftragte prüfen Vereine zunehmend.

**Verteidigbarer Vorteil: schwach.** Die Inhalte sind kopierbar, und einzelne Landessportbünde
geben kostenlose Muster heraus. Der einzige echte Vorteil liegt im Vertriebsweg: Vereinsadressen
sind über Vereinsregister und Landesverbände öffentlich, Briefpost ist legal, und niemand
bearbeitet diesen Kanal — weil er unsexy ist.

**Kapital und Zeit bis zum ersten Euro.** Unter 150 €. Erster Euro nach 4–6 Wochen.

**Laufender Aufwand nach 12 Monaten.** 2–4 h/Woche: Versandwellen, Support, Jahresupdate.

**Größtes Risiko.** Die RDG-Grenze. Der BGH hat mit dem smartlaw-Urteil (I ZR 113/20, 09.09.2021)
Rechtsdokumentengeneratoren für zulässig erklärt, aber individuelle Rechtsberatung bleibt
untersagt — jede Support-Mail nach dem Muster „passt das bei uns so?" ist eine Grenzüberschreitung.
Zweitrisiko: Die realistische Rücklaufquote auf Kaltbriefe liegt bei 0,5–2 %.

---

## Teil 2 — Drei Streichungen

### Idee 2 gestrichen: Verkauf von Haftungsübernahme ohne Fachkunde

Der Käufer kauft kein PDF. Er kauft die Aussage „das hält der BG-Begehung stand". Diese Aussage
lässt sich ohne Fachkunde nicht abgeben. Ob eine automatisch übernommene H-/P-Satz-Kombination im
konkreten Betrieb ausreicht, ist nicht beurteilbar — und ein Fehler fällt nicht auf, weil das
fachliche Korrektiv fehlt. Der laufende Aufwand besteht zu rund 80 % aus fachlicher Pflege: genau
die Stunden, die weder zeitlich noch fachlich vorhanden sind. Dazu kommt der mit „keiner" bewertete
Vorteil. Ein Produkt ohne Vorteil, in einem Markt mit etablierten Anbietern, mit Haftungsrisiko,
ist nicht riskant — es ist erledigt.

### Idee 3 gestrichen: Verletzt das Kernkriterium schon im Normalbetrieb

Diese Idee war im ersten Durchgang zu freundlich bewertet. Ihr Wert liegt vollständig in der
wöchentlichen redaktionellen Auswahl. Automatisiert liefert sie RASFF-Rohmeldungen, die der Kunde
gratis abonnieren kann. Nicht automatisiert ist jeder Umsatzeuro an eine Arbeitsstunde gekoppelt —
also exakt das Modell, das ausgeschlossen wurde. Eine dritte Variante gibt es nicht. Hinzu kommt:
Der Käufer erwirbt Rechtssicherheit von einem Anbieter ohne Referenzen und ohne fachlichen Namen.
Das ist der Produkttyp, bei dem fehlende Reputation am teuersten ist.

### Idee 4 gestrichen: Das Kapital ist um den Faktor 25 zu klein

12.000–25.000 € stehen gegen unter 500 €. Eine seriöse Abkürzung existiert nicht:
Verkäuferfinanzierung verlangt Anzahlung und Bonität, ein Kredit verlangt Sicherheiten, und die
Assets unter 2.000 € auf Flippa sind Kurse und Shopify-Shops ohne echten Umsatz — also entweder
Lagerhaltung oder Plattformabhängigkeit, beides ausgeschlossen.

Die Idee bleibt trotzdem in der Liste, weil sie das eigentliche Nadelöhr sichtbar macht: **nicht die
Ideenqualität, sondern das Kapital.** Wären in zwölf Monaten 15.000 € verfügbar, wäre dies mit
Abstand der beste Weg zum Zielbild. Jede Stunde, die stattdessen in Idee 1 oder 5 fließt, sollte
diese Option finanzieren — nicht ersetzen.

### Eine unbequeme Anmerkung zu den Überlebenden

Beide haben einen als „schwach" bewerteten Vorteil. Das ist kein Versehen und keine Nachlässigkeit
in der Ideenfindung. Unter diesen Kriterien ist kein Modell mit echtem Burggraben erreichbar, weil
jeder Burggraben aus Fachwissen, Kapital, Netzwerk oder aufgebauter Reichweite besteht — und alle
vier sind entweder ausgeschlossen oder nicht vorhanden. Was übrig bleibt, sind
Zeitfenster-Geschäfte: profitabel, kopierbar, mit begrenzter Halbwertszeit. Wer etwas anderes
verspricht, rechnet das Kapital oder das Fachwissen schön.

---

## Teil 3 — Der kleinstmögliche Test: 30 Tage, unter 200 €

### Idee 5 — Verkauf vor Produktion

Nichts erstellen außer einem Inhaltsverzeichnis und drei echten Musterseiten.

| Woche | Schritt | Kosten |
|---|---|---|
| 1 | Einseitige Verkaufsseite, scharfer Stripe-Checkout zu 129 €, Lieferzusage „Versand innerhalb von 14 Tagen", Impressum mit echtem Namen | Domain ~15 € |
| 1–2 | 150 Adressen von Sportvereinen (200–1.500 Mitglieder) aus **einem** Bundesland, über Landessportbund-Verzeichnis und Vereinsregister | 0 € |
| 2 | 150 personalisierte Briefe mit vereinsindividuellem Gutscheincode (Druck ~0,25 € + Porto 0,95 €) | ~165 € |
| 3–4 | Rücklauf messen | 0 € |

**Gesamt ≈ 180 €.**

**Erfolgsschwelle:** 3 bezahlte Bestellungen aus 150 Briefen (2 %) = 387 € Umsatz bei 60 €
Akquisitionskosten pro Kunde.

**Abbruch:** 0 oder 1 Zahlung **und** unter 8 Seitenaufrufe. Die beiden Signale müssen getrennt
gelesen werden. Viele Aufrufe ohne Zahlung heißt: Preis oder Angebot ist falsch — eine
Nachjustierung ist erlaubt. Wenige Aufrufe heißt: Der Kanal erreicht die Person nicht — und dann
ist die Idee tot, weil es in diesem Rahmen keinen zweiten legalen Kanal gibt.

**Zweites, härteres Abbruchsignal:** Wenn 150 saubere Adressen mehr als 6 Stunden kosten, sind
3.000 Vereine 120 Stunden. Dann ist das Modell arbeitszeitproportional und scheitert am eigenen
Kriterium — unabhängig davon, wie gut der Rücklauf war.

### Idee 1 — Erst Datenlage prüfen, dann verkaufen, nichts bauen

| Woche | Schritt | Kosten |
|---|---|---|
| 1–2 | 14 Tage lang täglich manuell die Portale sichten und die Alert-Mail an sich selbst schreiben | 0 € |
| 3 | 60 Briefe an Metallbaubetriebe (Handwerkskammer-Verzeichnis), echter Beispiel-Alert als Ausdruck beigelegt: „So sah die Liste letzte Woche aus. 79 €/Monat, erster Monat 1 €." | ~72 € + Domain |
| 4 | Rücklauf; die ersten Abos vier Wochen **komplett von Hand** beliefern — kein Code | 0 € |

**Gesamt ≈ 90 €.**

Woche 1–2 ist die eigentliche Machbarkeitsprüfung. **Erscheinen in 14 Tagen weniger als 10
relevante Ausschreibungen für Metallbau in einem Bundesland, ist das Produkt wertlos — unabhängig
vom Vertrieb.** Das ist der erste und billigste Abbruchpunkt und kostet nichts.

**Erfolgsschwelle:** 2 zahlende Abos aus 60 Briefen (3,3 %), die nach dem 1-€-Monat bleiben. Ein
Abo, das nach dem Testmonat kündigt, ist ein Fehlschlag, kein halber Erfolg.

**Abbruch:** zu dünne Datenlage nach 14 Tagen; oder 0 Abschlüsse aus 60 Briefen ohne eine einzige
Rückfrage; oder — das entscheidende Signal — wenn nach 14 Tagen manueller Sichtung nicht
beurteilbar ist, welche Ausschreibung für den Betrieb relevant wäre. Ohne Gewerkeverständnis
entsteht Rauschen, und Rauschen kündigt sich nach sechs Wochen von selbst.

**De-Risking-Variante, falls die Datenlage dünn ist:** auf **Zuschlagsbekanntmachungen** umstellen —
wer hat gewonnen, zu welchem Auftragswert, gegen wie viele Bieter. Diese Daten liegen vollständig
in TED (offene API, freie Weiterverwendung), sind nicht tagesaktuell und verzeihen daher Ausfälle.
Verkauft wird dann Kalkulationswissen statt Auftragsvorlauf, zu 59 €/Monat. Das schwächere
Kaufargument, aber technisch und rechtlich deutlich robuster.

---

*Keine Rechts- oder Steuerberatung. Die genannten Normen und das zitierte Urteil sind
Ausgangspunkte für eine eigene Prüfung, kein Ersatz dafür.*
