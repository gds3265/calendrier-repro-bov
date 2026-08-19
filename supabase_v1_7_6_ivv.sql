-- Repro Bovine v1.7.6 — seuils IVV synchronisés
-- À exécuter une seule fois dans Supabase SQL Editor avant d'utiliser la synchro des nouveaux réglages IVV.

alter table public.app_settings
  add column if not exists ivv_watch_days integer not null default 400,
  add column if not exists ivv_poor_days integer not null default 420;
