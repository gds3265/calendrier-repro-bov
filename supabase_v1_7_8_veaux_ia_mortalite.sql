-- Repro Bovine v1.7.8 — données veaux pour bilan reproduction
-- À exécuter une seule fois dans Supabase SQL Editor.
-- Conserve, par mère, les veaux du registre complet (naissance, père, sortie) pour mortalité <6 mois et IA probable.

alter table public.cows
  add column if not exists calf_records jsonb not null default '[]'::jsonb;

alter table public.app_settings
  add column if not exists registry_male_ids jsonb not null default '[]'::jsonb;
