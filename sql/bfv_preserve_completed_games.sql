-- Ein fehlender Feed-Eintrag ist nur bei noch bevorstehenden Spielen ein Klärungsfall.
-- Abgeschlossene Spiele bleiben für Wochenansicht und Statistik dauerhaft erhalten.
alter table public.bfv_games
  add column if not exists missing_from_feed boolean not null default false;
