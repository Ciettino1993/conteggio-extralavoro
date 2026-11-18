-- SpesaSmart - schema iniziale per Supabase (PostgreSQL + PostGIS)
-- Basato sull'Appendice A della specifica tecnica, con RLS e vincoli aggiuntivi.
-- STATO: pronto per il collegamento a Supabase, NON ancora eseguito su un database reale.
-- Gli id sono UUID: l'app li genera già sul dispositivo, così la sincronizzazione non crea duplicati.

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------- Profili e preferenze ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'utente' check (role in ('utente', 'moderatore', 'catalogo', 'amministratore')),
  created_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_radius_km numeric(5,1) not null default 5 check (store_radius_km between 1 and 30),
  fuel_radius_km numeric(5,1) not null default 10 check (fuel_radius_km between 1 and 50),
  fuel_type text not null default 'benzina' check (fuel_type in ('benzina', 'gasolio')),
  km_per_litre numeric(5,2) not null default 15 check (km_per_litre between 2 and 60),
  time_value_per_hour numeric(6,2) not null default 0 check (time_value_per_hour >= 0),
  max_stores smallint not null default 2 check (max_stores between 1 and 3),
  min_saving_extra_stop numeric(6,2) not null default 2 check (min_saving_extra_stop >= 0),
  excluded_brands text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Ruolo dell'utente corrente (usato nelle policy; i controlli dei ruoli sono lato server).
create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'utente')
$$;

-- ---------- Catalogo, negozi, prezzi ----------
create table public.retailers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  website text,
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid references public.retailers(id),
  osm_ref text unique, -- es. "node/123": collega i negozi OpenStreetMap e Open Prices
  name text not null,
  address text,
  city text,
  postal_code text,
  location geography(point, 4326) not null,
  last_verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index stores_location_idx on public.stores using gist (location);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category text,
  quantity_value numeric(12,3) check (quantity_value > 0),
  quantity_unit text check (quantity_unit in ('kg', 'l', 'pz')),
  status text not null default 'pubblicato' check (status in ('pubblicato', 'da_verificare', 'rifiutato')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index products_name_idx on public.products using gin (to_tsvector('italian', name || ' ' || coalesce(brand, '')));

create table public.product_barcodes (
  barcode text primary key check (barcode ~ '^[0-9]{8,14}$'),
  product_id uuid not null references public.products(id) on delete cascade
);

create table public.product_equivalences (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  equivalent_product_id uuid not null references public.products(id) on delete cascade,
  equivalence_type text not null,
  confidence numeric check (confidence between 0 and 1),
  check (product_id <> equivalent_product_id),
  unique (product_id, equivalent_product_id)
);

create table public.price_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_type text not null check (source_type in ('retailer', 'commerciale', 'open_data', 'community', 'utente')),
  terms_url text,
  license text,
  attribution text,
  created_at timestamptz not null default now()
);

insert into public.price_sources (name, source_type, terms_url, license, attribution) values
  ('Open Prices', 'community', 'https://prices.openfoodfacts.org', 'ODbL', 'Open Prices - Open Food Facts'),
  ('Segnalazioni utenti', 'utente', null, null, null);

-- Prezzi approvati (scritti solo dal backend o da moderatori).
create table public.price_observations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  store_id uuid not null references public.stores(id),
  source_id uuid references public.price_sources(id),
  external_id text unique, -- es. "op:305615" per Open Prices
  price numeric(12,2) not null check (price >= 0),
  currency char(3) not null default 'EUR',
  unit_price numeric(12,4),
  unit text check (unit in ('kg', 'l', 'pz')),
  price_type text not null default 'regular' check (price_type in ('regular', 'promo')),
  conditions text, -- tessera, coupon, 3x2, minimo d'acquisto...
  verification_status text not null default 'segnalato' check (verification_status in ('verificato', 'segnalato', 'rifiutato')),
  observed_at timestamptz not null default now(),
  valid_from timestamptz,
  valid_to timestamptz,
  source_url text,
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create index price_obs_product_store_idx on public.price_observations (product_id, store_id, observed_at desc);

-- ---------- Dati privati dell'utente ----------
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  product_id uuid references public.products(id),
  alternative_product_ids uuid[] not null default '{}',
  description text,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text,
  notes text,
  is_purchased boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.shopping_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_id uuid references public.shopping_lists(id) on delete set null,
  store_id uuid references public.stores(id),
  store_name text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  paid_total numeric(12,2) check (paid_total >= 0)
);

create table public.shopping_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.shopping_sessions(id) on delete cascade,
  product_id uuid references public.products(id),
  barcode text,
  name text,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  expected_price numeric(12,2),
  shelf_price numeric(12,2),
  paid_price numeric(12,2),
  scanned_at timestamptz not null default now()
);

-- Segnalazioni: separate dai prezzi approvati, in coda di moderazione.
create table public.price_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  product_id uuid references public.products(id),
  store_id uuid references public.stores(id),
  reported_price numeric(12,2) not null check (reported_price >= 0 and reported_price < 10000),
  currency char(3) not null default 'EUR',
  observed_at timestamptz not null default now(),
  report_type text not null check (report_type in ('scaffale', 'scontrino')),
  evidence_path text, -- foto in storage privato
  status text not null default 'pending' check (status in ('pending', 'approvato', 'rifiutato')),
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.retailers enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.product_equivalences enable row level security;
alter table public.price_sources enable row level security;
alter table public.price_observations enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.shopping_sessions enable row level security;
alter table public.shopping_session_items enable row level security;
alter table public.price_reports enable row level security;

-- Dati pubblici in sola lettura (le scritture passano da funzioni backend con service_role).
create policy "lettura pubblica" on public.retailers for select using (true);
create policy "lettura pubblica" on public.stores for select using (true);
create policy "lettura pubblica" on public.products for select using (status = 'pubblicato' or created_by = auth.uid());
create policy "lettura pubblica" on public.product_barcodes for select using (true);
create policy "lettura pubblica" on public.product_equivalences for select using (true);
create policy "lettura pubblica" on public.price_sources for select using (true);
create policy "lettura pubblica" on public.price_observations for select using (verification_status <> 'rifiutato');

-- Nuovi prodotti proposti dagli utenti: entrano come "da_verificare".
create policy "proposta prodotto" on public.products for insert to authenticated
  with check (status = 'da_verificare' and created_by = auth.uid());

-- Profilo e preferenze: solo il proprietario.
create policy "proprio profilo" on public.profiles for select using (id = auth.uid());
create policy "proprio profilo modifica" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role_name()); -- l'utente non può cambiarsi il ruolo
create policy "proprie preferenze" on public.user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Liste e sessioni: solo il proprietario.
create policy "proprie liste" on public.shopping_lists for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "righe delle proprie liste" on public.shopping_list_items for all
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "proprie sessioni" on public.shopping_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "righe delle proprie sessioni" on public.shopping_session_items for all
  using (exists (select 1 from public.shopping_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.shopping_sessions s where s.id = session_id and s.user_id = auth.uid()));

-- Segnalazioni: l'utente crea e vede le proprie; i moderatori vedono e aggiornano tutte.
create policy "nuova segnalazione" on public.price_reports for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy "proprie segnalazioni" on public.price_reports for select
  using (user_id = auth.uid() or public.current_role_name() in ('moderatore', 'amministratore'));
create policy "moderazione" on public.price_reports for update
  using (public.current_role_name() in ('moderatore', 'amministratore'));

-- ---------- Funzioni ----------
-- Negozi entro un raggio (metri), ordinati per distanza.
create or replace function public.stores_nearby(user_lat double precision, user_lon double precision, radius_m integer)
returns table (id uuid, name text, address text, distance_m double precision)
language sql stable as $$
  select s.id, s.name, s.address,
         st_distance(s.location, st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography) as distance_m
  from public.stores s
  where st_dwithin(s.location, st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography, least(radius_m, 50000))
  order by distance_m
$$;

-- Profilo creato automaticamente alla registrazione.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
