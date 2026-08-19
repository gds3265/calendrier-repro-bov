-- Repro Bovine v1.7.8 — patch consolidé Bilan Repro complet
-- À exécuter une seule fois dans Supabase SQL Editor.
-- Il inclut les ajouts v1.7.6 + v1.7.7 + v1.7.8 : IVV, historique vêlages, veaux, mortalité et IA probable.

alter table public.app_settings
  add column if not exists ivv_watch_days integer not null default 400,
  add column if not exists ivv_poor_days integer not null default 420,
  add column if not exists registry_male_ids jsonb not null default '[]'::jsonb;

alter table public.cows
  add column if not exists calving_history jsonb not null default '[]'::jsonb,
  add column if not exists calf_records jsonb not null default '[]'::jsonb;
