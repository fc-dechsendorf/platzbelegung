# Stillgelegte Ersteinrichtung

Die produktive Ersteinrichtung ist abgeschlossen. Dieser Endpunkt antwortet ausschließlich mit HTTP 410 und führt keine Auth- oder Datenbankoperationen aus. Die produktiv bereitgestellte Version 2 verlangt zusätzlich die Gateway-JWT-Prüfung (`verify_jwt=true`). Diese Prüfung bei jeder erneuten Bereitstellung eingeschaltet lassen.

Normale Einladungen und Wiederherstellungslinks laufen weiterhin über `manage-users`; sie benötigen diesen Endpunkt nicht. Die historische Tabelle `admin_bootstrap` bleibt geschützt erhalten.
