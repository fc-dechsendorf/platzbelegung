(function () {
  const key = 'fcd-public-language';
  const labels = {
    de: {
      title: 'FC Dechsendorf - Platzbelegungsplan', subtitle: 'Standardtrainingsplan · öffentliche Übersicht', season: 'Saison',
      weeks: 'Wochenübersicht', calendar: 'Kalenderansicht', publicWeeks: 'Öffentliche Wochenansicht',
      weekIntro: 'Die sechs Wochen beginnen mit der aktuell laufenden Kalenderwoche.',
      week: 'Kalenderwoche', closeWeek: 'Übersicht schließen −', openWeek: 'Übersicht öffnen +',
      filterTitle: 'Termine suchen und filtern', filterScope: 'Aktuelle und nächste fünf Wochen', filterSearch: 'Suche', filterPlaceholder: 'Mannschaft oder Termin', filterHomeTeam: 'Heimmannschaft / Gruppe', filterAllTeams: 'Alle Mannschaften', filterFrom: 'Von', filterTo: 'Bis', filterKinds: 'Terminarten', filterGames: 'Spiele', filterOther: 'Sonstiges / Sperren', filterApply: 'Anwenden', filterReset: 'Zurücksetzen', filterMatches: 'passende Termine', filterDimHint: 'Andere Belegungen bleiben abgeblendet sichtbar; Plätze gelten nicht als frei.', filterNone: 'Keine passenden Termine in diesen sechs Wochen.', filterFirst: 'Die ersten 30 Treffer werden angezeigt. Bitte die Suche eingrenzen.', filterDateError: 'Das Ende muss nach dem Beginn liegen.',
      pitch: 'Platz', noLights: 'ohne Flutlicht', lights: 'Flutlicht', withLights: 'mit Flutlicht',
      latest: 'Ende bis', sunset: 'Sonnenuntergang', until: 'bis', free: 'frei',
      noBookings: 'Keine Belegung', cityMows: 'Stadt mäht', mowingEmpty: 'Mähplan: Noch keine Termine eingetragen.',
      halfPitch: '1/2 Platz', fullPitch: '1/1 Platz', forecourt: 'Vorplatz', closure: 'Sperre',
      archeryHalf: '1/2 C-Platz · Hinweis', gamePriority: 'Spielvorrang', bfvCheck: 'BFV-Abgleich nötig', conflict: 'Konflikt',
      training: 'Training', league: 'Liga', cup: 'Pokal', friendly: 'Freundschaftsspiel',
      archeryTraining: 'Bogenschützen-Training', pending: 'Beantragter Termin', special: 'Sondertermin',
      pitchClosure: 'Platzsperre', changed: 'Administrativ geänderter Termin', archers: 'Bogenschützen',
      bfvHome: 'Heimspiele am Ort', bfvUnknown: 'ohne Ortsangabe', asOf: 'Stand',
      bfvLoading: 'Gemeinsame Daten werden geladen', bfvMissing: 'BFV-Daten sind noch nicht importiert',
      detailDate: 'Datum', detailTime: 'Zeit', detailPlace: 'Platz', detailStartPlace: 'Planungsstart', detailOriginalPlace: 'Ursprünglicher Platz',
      detailCapacity: 'Platzbedarf', detailFloodlights: 'Flutlicht', detailVenue: 'Ort', detailSource: 'Quelle', detailStatus: 'Status',
      bfvPlace: 'BFV-Platzangabe', bfvPlaceInfo: 'Für unsere Platzverteilung nicht maßgeblich; der Platz wird nach Vereinsregeln festgelegt.',
      manualMove: 'manuell', automaticMove: 'automatisch', movedFrom: 'von', moved: 'verlegt', notSet: 'nicht festgelegt',
      movedTo: 'nach', noLightsReason: 'A-Platz ohne Flutlicht', moveRequested: 'Verlegung beantragt.',
      pitchCapacity: 'Platzkapazität', noSunset: 'Nein · Sonnenuntergang', yesAvailable: 'Ja verfügbar',
      archeryZone: 'Vereinbarte Sperrzone auf 1/2 C-Platz · Fußballtraining parallel möglich',
      archeryInfo: 'Saisonaler Hinweisblock; Liga-, Pokal- und Freundschaftsspiele haben Vorrang.',
      signInToEdit: 'Für Änderungen bitte anmelden.', editEvent: 'Termin bearbeiten', deleteEvent: 'Termin löschen',
      removeClosure: 'Sperre entfernen', requestMove: 'Verlegung beantragen', requestDeletion: 'Löschung beantragen', close: 'Schließen',
      bfvMismatch: 'BFV-Abgleich nötig: Datum oder Uhrzeit der manuellen Fassung weichen bei gleicher BFV-ID vom aktuellen BFV-Spiel ab. Der manuelle Termin bleibt erhalten. BFV meldet:',
      bfvNoPlace: 'Eine BFV-Platznummer wird nicht übernommen.',
      bfvGone: 'BFV-Abgleich nötig: Die ID dieses manuell geänderten Spiels fehlt im aktuellen BFV-Abruf. Der manuelle Termin bleibt erhalten.',
      regularBooking: 'Standardbelegung', approved: 'Freigegeben', requested: 'Beantragt', homeMatch: 'Heimspiel', venueUnknown: 'Ort offen',
      noCapacity: 'keine freie Kapazität', checkManualPlace: 'manuelle Platzwahl prüfen', capacityReason: 'Kapazität',
      fullClosure: 'Ganz gesperrt', halfClosure: 'Halbseitig gesperrt', partialClosure: 'Teilbereiche gesperrt',
      standardSource: 'Standardtrainingsplan', archerySource: 'Vereinbarte Bogenschützenzeiten', managerSource: 'Abteilungsleitung', groundskeeperSource: 'Platzwart',
      adminChanged: 'administrativ geändert', archeryNote: 'Sperrzone auf einer Platzhälfte. Fußballtraining darf parallel stattfinden; Liga-, Pokal- und Freundschaftsspiele haben Vorrang.',
      archeryGameNote: 'Spiel hat Vorrang. Bogenschützentraining nur nach Abstimmung möglich.',
      legend: 'Grün: Standardtraining. Blau: BFV-Spiele. Gelb: manuell übernommene Termine und Änderungen. Lila: Sonderereignisse und Platzsperren. Orange gestrichelt: beantragt. Rot: Klärung erforderlich. Grau: Bogenschützen-Hinweis auf 1/2 C-Platz.'
    },
    en: {
      title: 'FC Dechsendorf - Pitch schedule', subtitle: 'Regular training schedule · public overview', season: 'Season',
      weeks: 'Weekly view', calendar: 'Calendar view', publicWeeks: 'Public weekly view',
      weekIntro: 'The six weeks start with the current calendar week.',
      week: 'Week', closeWeek: 'Close week −', openWeek: 'Open week +',
      filterTitle: 'Search and filter bookings', filterScope: 'Current and next five weeks', filterSearch: 'Search', filterPlaceholder: 'Team or event', filterHomeTeam: 'Home team / group', filterAllTeams: 'All teams', filterFrom: 'From', filterTo: 'To', filterKinds: 'Event types', filterGames: 'Matches', filterOther: 'Other / closures', filterApply: 'Apply', filterReset: 'Reset', filterMatches: 'matching bookings', filterDimHint: 'Other bookings remain visible but faded; pitches are not free.', filterNone: 'No matching bookings in these six weeks.', filterFirst: 'Showing the first 30 results. Narrow your search.', filterDateError: 'The end date must be after the start date.',
      pitch: 'pitch', noLights: 'no floodlights', lights: 'floodlights', withLights: 'floodlights',
      latest: 'ends by', sunset: 'Sunset', until: 'until', free: 'available',
      noBookings: 'No bookings', cityMows: 'City mowing', mowingEmpty: 'Mowing schedule: No dates entered yet.',
      halfPitch: '1/2 pitch', fullPitch: '1/1 pitch', forecourt: 'Forecourt', closure: 'Closure',
      archeryHalf: '1/2 C pitch · notice', gamePriority: 'Match takes priority', bfvCheck: 'BFV check needed', conflict: 'Conflict',
      training: 'Training', league: 'League', cup: 'Cup', friendly: 'Friendly',
      archeryTraining: 'Archery training', pending: 'Requested event', special: 'Special event',
      pitchClosure: 'Pitch closure', changed: 'Administratively changed event', archers: 'Archers',
      bfvHome: 'home matches at this venue', bfvUnknown: 'without venue', asOf: 'updated',
      bfvLoading: 'Loading shared data', bfvMissing: 'BFV data has not been imported yet',
      detailDate: 'Date', detailTime: 'Time', detailPlace: 'Pitch', detailStartPlace: 'Initial planning pitch', detailOriginalPlace: 'Original pitch',
      detailCapacity: 'Pitch requirement', detailFloodlights: 'Floodlights', detailVenue: 'Venue', detailSource: 'Source', detailStatus: 'Status',
      bfvPlace: 'BFV pitch designation', bfvPlaceInfo: 'Not used for our pitch allocation; the pitch is assigned according to club rules.',
      manualMove: 'manually', automaticMove: 'automatically', movedFrom: 'from', moved: 'moved', notSet: 'not assigned',
      movedTo: 'to', noLightsReason: 'Pitch A has no floodlights', moveRequested: 'Move requested.',
      pitchCapacity: 'pitch capacity', noSunset: 'No · sunset', yesAvailable: 'Yes, available',
      archeryZone: 'Agreed safety zone on 1/2 of pitch C · football training may take place alongside',
      archeryInfo: 'Seasonal notice; league, cup and friendly matches take priority.',
      signInToEdit: 'Sign in to make changes.', editEvent: 'Edit event', deleteEvent: 'Delete event',
      removeClosure: 'Remove closure', requestMove: 'Request a move', requestDeletion: 'Request deletion', close: 'Close',
      bfvMismatch: 'BFV check needed: The manually entered date or time differs from the current BFV match with the same ID. The manual event remains in place. BFV reports:',
      bfvNoPlace: 'A BFV pitch number is not adopted.',
      bfvGone: 'BFV check needed: This manually changed match ID is missing from the latest BFV feed. The manual event remains in place.',
      regularBooking: 'Regular booking', approved: 'Approved', requested: 'Requested', homeMatch: 'Home match', venueUnknown: 'Venue unknown',
      noCapacity: 'no pitch capacity available', checkManualPlace: 'check manual pitch assignment', capacityReason: 'capacity',
      fullClosure: 'Fully closed', halfClosure: 'One half closed', partialClosure: 'Sections closed',
      standardSource: 'Regular training schedule', archerySource: 'Agreed archery schedule', managerSource: 'Department manager', groundskeeperSource: 'Groundskeeper',
      adminChanged: 'changed by administrator', archeryNote: 'Safety zone on one half of the pitch. Football training may take place alongside; league, cup and friendly matches take priority.',
      archeryGameNote: 'Match takes priority. Archery training requires coordination.',
      legend: 'Green: regular training. Blue: BFV matches. Yellow: manually confirmed events and changes. Purple: special events and pitch closures. Dashed orange: requested. Red: clarification needed. Grey: archery notice for 1/2 C pitch.'
    },
    es: {
      title: 'FC Dechsendorf - Plan de ocupación de campos', subtitle: 'Horario habitual de entrenamientos · vista pública', season: 'Temporada',
      weeks: 'Vista semanal', calendar: 'Calendario', publicWeeks: 'Vista semanal pública',
      weekIntro: 'Las seis semanas comienzan con la semana actual.',
      week: 'Semana', closeWeek: 'Cerrar semana −', openWeek: 'Abrir semana +',
      filterTitle: 'Buscar y filtrar reservas', filterScope: 'Semana actual y cinco siguientes', filterSearch: 'Buscar', filterPlaceholder: 'Equipo o evento', filterHomeTeam: 'Equipo local / grupo', filterAllTeams: 'Todos los equipos', filterFrom: 'Desde', filterTo: 'Hasta', filterKinds: 'Tipos de evento', filterGames: 'Partidos', filterOther: 'Otros / cierres', filterApply: 'Aplicar', filterReset: 'Restablecer', filterMatches: 'reservas coincidentes', filterDimHint: 'Las demás reservas siguen visibles atenuadas; los campos no están libres.', filterNone: 'No hay reservas coincidentes en estas seis semanas.', filterFirst: 'Se muestran los primeros 30 resultados. Ajusta la búsqueda.', filterDateError: 'La fecha final debe ser posterior a la inicial.',
      pitch: 'campo', noLights: 'sin iluminación', lights: 'con iluminación', withLights: 'con iluminación',
      latest: 'fin antes de', sunset: 'Puesta de sol', until: 'hasta', free: 'disponible',
      noBookings: 'Sin reservas', cityMows: 'Corte de césped municipal', mowingEmpty: 'Calendario de corte: aún no hay fechas.',
      halfPitch: '1/2 campo', fullPitch: '1/1 campo', forecourt: 'Zona anexa', closure: 'Cierre',
      archeryHalf: '1/2 campo C · aviso', gamePriority: 'Prioridad del partido', bfvCheck: 'Revisar con BFV', conflict: 'Conflicto',
      training: 'Entrenamiento', league: 'Liga', cup: 'Copa', friendly: 'Amistoso',
      archeryTraining: 'Entrenamiento de tiro con arco', pending: 'Evento solicitado', special: 'Evento especial',
      pitchClosure: 'Cierre del campo', changed: 'Evento modificado administrativamente', archers: 'Tiro con arco',
      bfvHome: 'partidos en casa en esta sede', bfvUnknown: 'sin lugar indicado', asOf: 'actualizado',
      bfvLoading: 'Cargando datos compartidos', bfvMissing: 'Los datos de BFV aún no se han importado',
      detailDate: 'Fecha', detailTime: 'Hora', detailPlace: 'Campo', detailStartPlace: 'Campo previsto inicialmente', detailOriginalPlace: 'Campo original',
      detailCapacity: 'Espacio necesario', detailFloodlights: 'Iluminación', detailVenue: 'Lugar', detailSource: 'Fuente', detailStatus: 'Estado',
      bfvPlace: 'Campo indicado por BFV', bfvPlaceInfo: 'No determina nuestra asignación; el campo se asigna según las normas del club.',
      manualMove: 'manualmente', automaticMove: 'automáticamente', movedFrom: 'desde', moved: 'trasladado', notSet: 'sin asignar',
      movedTo: 'a', noLightsReason: 'El campo A no tiene iluminación', moveRequested: 'Traslado solicitado.',
      pitchCapacity: 'capacidad del campo', noSunset: 'No · puesta de sol', yesAvailable: 'Sí, disponible',
      archeryZone: 'Zona de seguridad acordada en 1/2 campo C · el entrenamiento de fútbol puede realizarse a la vez',
      archeryInfo: 'Aviso estacional; los partidos de liga, copa y amistosos tienen prioridad.',
      signInToEdit: 'Inicia sesión para hacer cambios.', editEvent: 'Editar evento', deleteEvent: 'Eliminar evento',
      removeClosure: 'Quitar cierre', requestMove: 'Solicitar traslado', requestDeletion: 'Solicitar eliminación', close: 'Cerrar',
      bfvMismatch: 'Revisar con BFV: la fecha o la hora introducidas manualmente difieren del partido actual con la misma ID. El evento manual se conserva. BFV indica:',
      bfvNoPlace: 'No se adopta el número de campo de BFV.',
      bfvGone: 'Revisar con BFV: la ID de este partido modificado manualmente no aparece en los datos actuales. El evento manual se conserva.',
      regularBooking: 'Ocupación habitual', approved: 'Aprobado', requested: 'Solicitado', homeMatch: 'Partido en casa', venueUnknown: 'Lugar sin confirmar',
      noCapacity: 'no hay capacidad libre', checkManualPlace: 'revisar la asignación manual', capacityReason: 'capacidad',
      fullClosure: 'Cerrado por completo', halfClosure: 'Medio campo cerrado', partialClosure: 'Zonas cerradas',
      standardSource: 'Horario habitual de entrenamientos', archerySource: 'Horario acordado de tiro con arco', managerSource: 'Responsable de sección', groundskeeperSource: 'Encargado del campo',
      adminChanged: 'modificado por el administrador', archeryNote: 'Zona de seguridad en medio campo. Puede entrenarse fútbol a la vez; los partidos de liga, copa y amistosos tienen prioridad.',
      archeryGameNote: 'El partido tiene prioridad. El entrenamiento de tiro con arco requiere coordinación.',
      legend: 'Verde: entrenamiento habitual. Azul: partidos BFV. Amarillo: eventos y cambios confirmados manualmente. Morado: eventos especiales y cierres. Naranja discontinuo: solicitado. Rojo: requiere aclaración. Gris: aviso de tiro con arco en 1/2 campo C.'
    }
  };
  const weekdays = {
    de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  };
  const categories = {
    Training: 'training', Liga: 'league', Pokal: 'cup', Freundschaftsspiel: 'friendly',
    'Bogenschützen-Training': 'archeryTraining', 'Beantragter Termin': 'pending',
    Sondertermin: 'special', Platzsperre: 'pitchClosure',
    'Administrativ geänderter Termin': 'changed'
  };
  let language = 'de';
  try { const stored = localStorage.getItem(key); if (labels[stored]) language = stored; } catch { /* Storage may be unavailable. */ }
  const current = () => language;
  function set(value) {
    if (!labels[value]) return;
    language = value;
    document.documentElement.lang = value;
    try { localStorage.setItem(key, value); } catch { /* Session choice still works. */ }
  }
  function t(name) { return labels[language][name] || labels.de[name] || name; }
  function category(name) { return categories[name] ? t(categories[name]) : name; }
  function weekday(index) { return weekdays[language][index]; }
  function place(name) { return language === 'en' ? `Pitch ${name}` : language === 'es' ? `Campo ${name}` : `${name}-Platz`; }
  function moveDescription(origin, manual) {
    if (language === 'en') return `moved ${manual ? 'manually' : 'automatically'} from ${origin}`;
    if (language === 'es') return `trasladado ${manual ? 'manualmente' : 'automáticamente'} desde ${origin}`;
    return `${manual ? 'manuell' : 'automatisch'} von ${origin} verlegt`;
  }
  document.documentElement.lang = language;
  window.PublicLanguage = { current, set, t, category, weekday, place, moveDescription };
})();

