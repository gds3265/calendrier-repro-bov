-- Repro Bovine v1.7.7 — historique de vêlages pour le bilan reproduction
-- À exécuter une seule fois dans Supabase SQL Editor.
-- Permet de synchroniser entre appareils les dates historiques de vêlage reconstruites lors de l'import CSV.

alter table public.cows
  add column if not exists calving_history jsonb not null default '[]'::jsonb;
