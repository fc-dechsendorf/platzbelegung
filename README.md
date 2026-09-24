# FC Dechsendorf – Platzbelegungsplan

Öffentlicher Testbetrieb der Platzbelegung. Die Kalenderansicht ist ohne Anmeldung lesbar. Änderungen werden über Supabase Auth und Datenbankregeln geschützt.

## Testbetrieb

- Die nächsten sechs Kalenderwochen beginnen mit der laufenden Woche.
- Training ist grün, BFV-Spiele sind blau, Sperren und Sondertermine gelb. Anträge sind orange gestrichelt; Konflikte sind rot hervorgehoben.
- Abteilungsleitungen können Termine und Änderungen beantragen. Administratoren können freigeben, bearbeiten, Sperren und Mähtermine eintragen sowie BFV-Quellen verwalten.
- BFV-iCal wird montags neu abgerufen. Die öffentlichen Daten können sich dadurch nach Spielverlegungen ändern.
- Eine Platzsperre verbietet Spiele auf dem betroffenen Platz. Bei vollständiger Überbelegung wird ein Konflikt angezeigt.

Dies ist bewusst ein Sandbox-Test. Bitte vor der regulären Vereinsnutzung Einladungen, Freigaben und die mobile Ansicht mit den vorgesehenen Testpersonen praktisch prüfen.

## Entwicklung

`index.html` lädt die statischen Styles, Kalenderlogik und `scripts/cloud.js`. Der Cloud-Baustein wird aus `src/cloud-entry.js` erzeugt:

```text
pnpm install
pnpm build
pnpm test
```

Im Repository liegt nur der öffentliche Supabase-Publishable-Key. Geheimschlüssel und Zugangspasswörter gehören weder in den Quellcode noch in GitHub. Datenbank-Migrationen und Edge Functions stehen unter `supabase/`.
