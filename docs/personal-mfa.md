# Persönliche MFA und Recovery-Codes

Stand 14. Oktober 2026. Ausschließlich Website-Konto christian.adami@fcd-er.de, gebunden an die bestehende Benutzer-ID. Andere Konten bleiben unverändert.

## Einrichtung
Nach der Anmeldung öffnet „Meine Kontosicherheit“ die Einrichtung. TOTP-App scannen, sechsstelligen Code bestätigen, zehn Recovery-Codes unabhängig sichern und die Sicherung bestätigen. Erst der letzte Schritt setzt die zusätzliche serverseitige MFA-Pflicht. Keine Faktoren oder Codes wurden durch die Bereitstellung stellvertretend für den Benutzer erzeugt.

Bei weiterer Anmeldung bestätigt die App die Sitzung. Geschützte Datenbankoperationen und manuelle Serverfunktionen prüfen die aktuelle Sitzung plus MFA. Öffentliche Kalenderprojektionen bleiben verfügbar. BFV-Automatisierung behält ihre bestehende eigene Authentifizierung.

## Verlorene App
Nach Passwortanmeldung im MFA-Dialog „App verloren“ wählen. Erneute Passwortprüfung und ein unbenutzter Recovery-Code sind erforderlich. Der Code wird unter einer Datenbanksperre einmalig verbraucht; die alte App wird entfernt. Es wird keine privilegierte Ersatzsitzung ausgegeben. Geschützte Zugriffe bleiben gesperrt, bis in derselben Wiederherstellungssitzung eine neue App bestätigt und ein neuer Satz Codes gesichert ist. Ein weiterer gültiger Code kann eine unterbrochene Wiederherstellung neu beginnen; die neue Sitzung ersetzt dann die alte Berechtigung zur Fertigstellung.

Zehn Codes mit je 128 zufälligen Bits; serverseitig nur kontogebundene SHA-256-Prüfsummen. Antworten ohne Browsercache. Fünf Versuche pro 15 Minuten, kontobezogen und serverseitig begrenzt. Kein Klartext in Datenbank, Logs, Repository oder Browser-Speicher. Codes stehen nur im angezeigten Dialog und müssen vom Benutzer sicher verwahrt werden. Neuer Codesatz ersetzt alle bisherigen Codes.

## Technischer Notfall
Wenn App UND Codes fehlen oder eine administrative Faktorentfernung während der Wiederherstellung fehlschlägt, wird gesicherter Supabase-Eigentümerzugang benötigt. Kein anderer Website-Administrator kann den Hauptadministrator über die vorhandene Benutzerverwaltung zurücksetzen. Nach eindeutiger Identitätsprüfung kann ein technischer Eigentümer die Faktoren über Supabase Auth Admin entfernen und den persönlichen MFA-Datensatz kontrolliert zurücksetzen. Keine öffentliche Rücksetzfunktion und keine Umgehung per E-Mail-Link. Vor verpflichtender Nutzung unabhängigen Plattformzugang verfügbar halten.

## Nachweise und Grenzen
57 automatisierte Tests bestehen. SQL-Prüfmatrix vor Aktivierung vollständig zurückgerollt und danach gegen die aktivierten Regeln erneut vollständig zurückgerollt: unveränderte Rechte vor Opt-in, AAL1 verweigert nach Opt-in, AAL2 mit aktueller bestätigter Faktorzuordnung erlaubt, entfernte Faktoren verweigert, private Hashes/RPC nicht für Browserrollen erreichbar, einmalige Codes, Rate Limit, an Wiederherstellungssitzung gebundener Abschluss. Bestehende Rollen-/Sitzungsregression zusätzlich prüfen. Persönliche App-Einrichtung, neue Anmeldung und tatsächliche Appverlust-Wiederherstellung benötigen den Benutzer und sind durch simulierte SQL-/Funktionsprüfungen nicht ersetzt.

Die Recovery-Ergänzung ist eigener Anwendungscode; die verwendete Supabase-Schnittstelle stellt keine fertigen Recovery-Codes bereit. Native TOTP-Verifikation: https://supabase.com/docs/guides/auth/auth-mfa/totp. Serverseitige MFA-Prüfung: https://supabase.com/docs/guides/auth/auth-mfa.

Migration sql/owner_mfa.sql; persönliche Funktion owner-mfa. Gateway verify_jwt=false wegen eigener Auth.getUser-Bearerprüfung und aktueller Datenbanksitzungsprüfung; bestehende manage-users/refresh-bfv behalten diese Gatewaykonfiguration und prüfen manuelle Aufrufe zusätzlich mit protected_session_role. Geheimschlüssel ausschließlich in der Serverumgebung.
