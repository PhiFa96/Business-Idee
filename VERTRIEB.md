# Vertrieb: Freemium

Das Erlösmodell in einem Satz: **Das Archiv ist offen und kostenlos, der tägliche Alert kostet.**
Das Offene bringt Besucher über die Suche, das Bezahlte bringt Geld.

---

## Die Grenze ist Zeit, nicht Umfang

Konfiguriert über `publicDelayHours` (Voreinstellung 48) je Nische.

| | öffentliches Archiv | Wochenüberblick (gratis) | Alert (79 €/Monat) |
|---|---|---|---|
| Umfang | alles | alles | alles |
| Verzögerung | 48 Stunden | 48 Stunden | keine |
| Frequenz | laufend | montags | werktäglich 6 Uhr |
| Voraussetzung | nichts | Double-Opt-in | Zahlung |

Warum die Zeit die richtige Grenze ist: Bei Ausschreibungen läuft eine Frist. Wer zwei Tage später
mit der Kalkulation beginnt, hat zwei Tage weniger — das ist ein spürbarer Nachteil, ohne dass das
Gratisangebot wertlos wird. Und der Bestand für die Suchmaschinen bleibt vollständig; es fehlt nur
das Allerneueste. Eine Begrenzung des Umfangs hätte beides kaputt gemacht.

---

## Der Weg vom Besucher zum Kunden

```
Anzeige oder Suche
      ↓
/<gewerk>/angebot.html         ← Landingpage: Beleg, Preis, zwei Wege
      ↓                    ↘
Stripe (79 €/Monat)        Double-Opt-in (gratis)
                                 ↓
                           Wochenüberblick, jede Mail mit Hinweis auf den Alert
                                 ↓
                           Stripe
```

Der zweite Weg ist der wichtigere. Wer beim ersten Besuch nicht kauft, ist sonst verloren. Mit der
Anmeldung bleibt der Kontakt bestehen — und zwar rechtmäßig, weil die Person selbst zugestimmt hat.

---

## Einrichtung

1. **Gewerbeanmeldung** beim Gewerbeamt, 15–65 €, meist online.
2. **`config/site.json`** füllen: `baseUrl`, `impressum` (bürgerlicher Name und ladungsfähige
   Anschrift, §5 DDG), `kontaktEmail`.
3. **Stripe-Zahlungsverknüpfung** je Gewerk anlegen — kein Code, kein Webhook. Abo 79 €/Monat,
   erster Monat 1 €. Link in `config/site.json` unter `stripeLinks` eintragen.
   Für jede Anzeigenkampagne eine eigene Verknüpfung, dann ist ohne Tracking-Skript erkennbar,
   welche Kampagne zahlt.
4. **Anmeldeweg** wählen:
   - *Ohne Infrastruktur:* nichts weiter tun. Die Seite zeigt einen `mailto:`-Knopf, die
     Antwortmail des Interessenten ist der Einwilligungsnachweis. Eintragen von Hand über
     `subscribers add` und `subscribers confirm`.
   - *Automatisiert:* `worker/subscribe.js` auf Cloudflare deployen (kostenloses Kontingent),
     Endpunkt in `config/site.json` als `subscribeEndpoint` eintragen. Der tägliche Workflow holt
     die Anmeldungen mit `subscribers sync` ins Repo.
5. **Versand** aktivieren: Konto bei Resend, Domain verifizieren, dann Repository-Secret
   `RESEND_API_KEY` und Variable `MAIL_FROM` setzen. Ohne beides schreibt der Workflow die Mail
   nur nach `out/` und verschickt nichts.

### Wo die Abonnentendaten liegen — und warum nicht im Repo

Das Repository ist öffentlich (nur so ist GitHub Pages kostenlos). E-Mail-Adressen und
Einwilligungsnachweise dürfen dort nicht liegen — das wäre ein Datenschutzverstoß, kein
Schönheitsfehler. Deshalb:

- `config/subscribers.json` steht in `.gitignore` und existiert nur auf deinem Rechner.
- Im Betrieb liest der Workflow die Liste aus dem **Repository-Secret `SUBSCRIBERS_JSON`**.
  Secrets sind auch in öffentlichen Repositories privat.
- Nach jeder Änderung an der lokalen Datei den Inhalt in das Secret übertragen:
  Settings → Secrets and variables → Actions → `SUBSCRIBERS_JSON`. Das Werkzeug erinnert dich
  daran, wenn du aus dem Secret gelesen und lokal geschrieben hast.

Bei einer Handvoll Kunden ist das Kopieren einmal pro Woche zumutbar. Wird es lästig, ist der
Cloudflare Worker aus `worker/subscribe.js` der nächste Schritt — dann liegt die Liste dort und
`subscribers sync` holt sie.

Nach einer Zahlung den Kunden eintragen:

```
node bin/radar.js subscribers add     --niche <slug> --email kunde@firma.de --plan alert
node bin/radar.js subscribers confirm --niche <slug> --email kunde@firma.de \
  --kanal kauf --notiz "Stripe-Zahlung vom 01.08.2026, Beleg pi_3Q..."
```

Bei bis zu 20 Kunden ist das eine Minute pro Woche. Wird es unübersichtlich, ist das ein gutes
Problem — dann lohnt der Umbau auf einen Stripe-Webhook.

---

## Rechtliche Pflichten, die eingebaut sind

Nichts davon ist optional, deshalb erzwingt der Code es:

- **Abmeldelink in jeder Mail**, je Empfänger ein eigener Token. Deshalb wird einzeln versendet
  statt per Blindkopie — ein Klick darf nicht alle anderen mit abmelden.
- **Absenderangabe in jeder Mail.** Fehlt `impressum` in `config/site.json`, wirft `renderMail`
  einen Fehler, statt eine unvollständige Mail zu erzeugen. Ein roter Workflow ist billiger als
  eine Abmahnung.
- **Einwilligungsnachweis** je Adresse: Zeitpunkt, Quelle, Wortlaut, Bestätigungszeitpunkt und
  Kanal in `config/subscribers.json`, versioniert im Git.
- **Kein Versand an Unbestätigte.** `activeOf()` liefert nur Adressen mit Bestätigung; Altbestände
  ohne Nachweis stehen auf „wartet_auf_bestaetigung" und bekommen nichts.

Zur Frage, was per E-Mail an Firmen ohne Einwilligung erlaubt ist: nichts. Ausführlich in
`AKQUISE.md`, Abschnitt 0.

---

## Woran der Erfolg gemessen wird

| Kennzahl | Woher | Schwelle |
|---|---|---|
| Suchvolumen der Keywords | Google Keyword Planner | ≥ 100/Monat, sonst kein Kampagnenstart |
| brauchbare Ausschreibungen | `node bin/radar.js scan --days 90` | ≥ 30, sonst Nische wechseln |
| Anmeldungen zum Gratisüberblick | `subscribers list` | ≥ 10 in 30 Tagen |
| zahlende Abos | Stripe | ≥ 1 nach 250 € Anzeigenbudget |
| **Verbleib** | Stripe | mindestens ein Kunde zahlt den **dritten** Monat |

Die letzte Zeile ist die entscheidende und wird am häufigsten übersehen. Ein Abo für 150 €
Akquisitionskosten rechnet sich erst, wenn es bleibt. Wer nach dem 1-€-Monat kündigt, ist kein
halber Erfolg, sondern das Signal, dass das Produkt nicht trägt.

---

## Was verworfen wurde

**Briefkampagne.** Stand in der ersten Fassung dieses Dokuments und war mit 90 € für 60 Stück der
billigste legale Weg. Wurde zugunsten der bezahlten Suche gestrichen. Das Material dazu steht in
`AKQUISE.md`, Abschnitt 3 — falls die Anzeigen am Suchvolumen scheitern, ist es der naheliegende
Rückfallweg.
