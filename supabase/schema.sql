-- ============================================================================
-- mov_granel_app — esquema Supabase / Postgres
-- Los id (UUID) de la planilla se conservan tal cual, así que las
-- relaciones entre tablas se preservan sin ninguna tabla de mapeo.
--
-- Unidad de cuenta de todo el sistema: USD Divisa.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type oil_type       as enum ('soja', 'girasol', 'girasol_ao');
create type price_currency as enum ('usd_divisa', 'usd_blue');
create type pay_currency   as enum ('usd_divisa', 'usd_billete', 'ars');
create type account_curr   as enum ('usd_divisa', 'usd_billete');
create type pricing_type   as enum ('none', 'ingress_per_ton', 'egress_per_ton', 'buyer');
create type movement_type  as enum ('crude_in', 'refined_out', 'adjustment');
create type agreement_type as enum ('purchase_crude', 'sale_crude', 'sale_refined');
create type party_type     as enum ('supplier', 'buyer');
create type agreement_status as enum ('open', 'closed');
create type user_role      as enum ('admin', 'user');   -- valores reales de la hoja User

-- Distingue un pago real de un saldo inicial y de un ajuste de importe.
-- Reemplaza al viejo booleano `is_initial_balance`.
create type entry_kind as enum ('payment', 'initial_balance', 'adjustment');

-- ---------------------------------------------------------------------------
-- Usuarios (tabla propia; el login lo valida una Edge Function)
-- ---------------------------------------------------------------------------
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,          -- bcrypt. NUNCA texto plano.
  name          text,
  role          user_role not null default 'user',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Partes
-- ---------------------------------------------------------------------------
create table suppliers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  phone            text,
  account_currency account_curr not null default 'usd_divisa',
  notes            text,
  created_at       timestamptz not null default now()
);

create table refineries (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  -- código corto para la columna Destino de la cuenta corriente.
  -- 'Oligra - Fason' -> 'OLI - FAS';  'Reasa - Fason' -> 'REA - FAS'
  code                    text,
  location                text,
  pricing_type            pricing_type not null default 'none',
  processing_cost_per_ton numeric(14,4),
  notes                   text,
  created_at              timestamptz not null default now()
);

create table buyers (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  code                  text,   -- 'Oligra - Proveedores' -> 'OLI - PROV'
  location              text,
  default_price_currency price_currency,
  default_price_per_ton  numeric(14,4),
  notes                 text,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Acuerdos (se pactan por cantidad de entregas, no por toneladas)
-- ---------------------------------------------------------------------------
create table purchase_agreements (
  id               uuid primary key default gen_random_uuid(),
  date             date not null,
  agreement_type   agreement_type not null,
  party_type       party_type not null,
  supplier_id      uuid references suppliers(id) on delete restrict,
  buyer_id         uuid references buyers(id)    on delete restrict,
  oil_type         oil_type not null,
  price_per_ton    numeric(14,4) not null,
  price_currency   price_currency not null,
  total_deliveries integer not null check (total_deliveries > 0),
  delivered_count  integer not null default 0 check (delivered_count >= 0),
  status           agreement_status not null default 'open',
  notes            text,
  created_at       timestamptz not null default now(),

  -- La contraparte es un proveedor o un comprador, nunca las dos ni ninguna.
  constraint agreement_one_party check (
    (party_type = 'supplier' and supplier_id is not null and buyer_id is null) or
    (party_type = 'buyer'    and buyer_id    is not null and supplier_id is null)
  )
);

create index on purchase_agreements (status, agreement_type, oil_type);

-- ---------------------------------------------------------------------------
-- Compras de camiones
-- ---------------------------------------------------------------------------
create table truck_purchases (
  id                  uuid primary key default gen_random_uuid(),
  date                date not null,
  supplier_id         uuid not null references suppliers(id) on delete restrict,
  oil_type            oil_type not null,

  tons                numeric(14,3) not null,   -- bruto
  discount_percent    numeric(6,3) not null default 0,
  -- neto calculado por la base: nunca más recalcularlo a mano en el frontend
  net_tons            numeric(14,3) generated always as
                        (round(tons * (1 - discount_percent / 100.0), 3)) stored,

  price_per_ton       numeric(14,4) not null,
  price_currency      price_currency not null,
  usd_divisa_rate     numeric(14,4),
  usd_blue_rate       numeric(14,4),

  -- Destino: o entra al stock de una refinería, o se vende directo a un comprador.
  refinery_id         uuid references refineries(id) on delete restrict,
  buyer_id            uuid references buyers(id)     on delete restrict,
  sale_price_per_ton  numeric(14,4),

  driver              text,   -- opcional: a veces no lo lleva un chofer nuestro
  ticket_number       text,
  notes               text,

  purchase_agreement_id uuid references purchase_agreements(id) on delete set null,
  sale_agreement_id     uuid references purchase_agreements(id) on delete set null,
  created_at            timestamptz not null default now(),

  constraint purchase_has_destination check (
    (refinery_id is not null and buyer_id is null) or
    (buyer_id is not null and refinery_id is null)
  )
  -- Las cotizaciones se exigen en `cotizaciones.sql`, con un trigger: la regla
  -- depende de la moneda de cuenta del proveedor y un CHECK no puede mirar
  -- otra tabla.
);

create index on truck_purchases (supplier_id, date desc);
create index on truck_purchases (refinery_id, date desc);
create index on truck_purchases (buyer_id, date desc);

-- ---------------------------------------------------------------------------
-- Movimientos de refinería (stock)
-- ---------------------------------------------------------------------------
create table refinery_movements (
  id                 uuid primary key default gen_random_uuid(),
  date               date not null,
  refinery_id        uuid not null references refineries(id) on delete restrict,
  movement_type      movement_type not null,
  oil_type           oil_type not null,

  tons               numeric(14,3) not null,   -- en 'adjustment' puede ser negativo
  gross_tons         numeric(14,3),

  buyer_id           uuid references buyers(id) on delete restrict,  -- ex `destination`
  truck_purchase_id  uuid references truck_purchases(id) on delete cascade,

  sale_price_per_ton  numeric(14,4),
  sale_price_currency price_currency,
  usd_divisa_rate     numeric(14,4),
  usd_blue_rate       numeric(14,4),

  is_initial_balance boolean not null default false,
  driver             text,   -- opcional, igual que en las compras
  ticket_number      text,
  notes              text,
  purchase_agreement_id uuid references purchase_agreements(id) on delete set null,
  created_at         timestamptz not null default now(),

  -- Sólo un ajuste puede llevar toneladas negativas.
  constraint movement_tons_sign check (movement_type = 'adjustment' or tons >= 0)
);

create index on refinery_movements (refinery_id, date desc);
create index on refinery_movements (buyer_id, date desc);
create index on refinery_movements (truck_purchase_id);

-- ---------------------------------------------------------------------------
-- Ventas directas (no pasan por el stock de una refinería)
-- ---------------------------------------------------------------------------
create table direct_sales (
  id                 uuid primary key default gen_random_uuid(),
  date               date not null,
  origin_refinery_id uuid not null references refineries(id) on delete restrict,
  buyer_id           uuid not null references buyers(id)     on delete restrict,
  oil_type           oil_type not null,
  tons               numeric(14,3) not null,
  price_per_ton      numeric(14,4) not null,
  price_currency     price_currency not null,
  usd_divisa_rate    numeric(14,4),
  usd_blue_rate      numeric(14,4),
  ticket_number      text,
  notes              text,
  created_at         timestamptz not null default now()
);

create index on direct_sales (buyer_id, date desc);

-- ---------------------------------------------------------------------------
-- Pagos / saldos iniciales / ajustes de importe
-- Las tres tablas comparten forma. `kind` reemplaza al viejo is_initial_balance
-- y agrega el caso 'adjustment' (la línea "Ajuste" de la planilla).
-- ---------------------------------------------------------------------------
create table supplier_payments (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  supplier_id     uuid not null references suppliers(id) on delete restrict,
  kind            entry_kind not null default 'payment',
  amount          numeric(16,2) not null,
  currency        pay_currency,
  usd_divisa_rate numeric(14,4),
  usd_blue_rate   numeric(14,4),
  notes           text,
  created_at      timestamptz not null default now(),
  -- Un pago real necesita moneda; un saldo inicial o ajuste se expresa
  -- directamente en la moneda de cuenta del proveedor.
  constraint supplier_payment_currency check (kind <> 'payment' or currency is not null)
);

create table refinery_payments (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  refinery_id     uuid not null references refineries(id) on delete restrict,
  kind            entry_kind not null default 'payment',
  amount          numeric(16,2) not null,
  currency        pay_currency,
  usd_divisa_rate numeric(14,4),
  usd_blue_rate   numeric(14,4),
  notes           text,
  created_at      timestamptz not null default now(),
  constraint refinery_payment_currency check (kind <> 'payment' or currency is not null)
);

create table buyer_payments (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  buyer_id        uuid not null references buyers(id) on delete restrict,
  kind            entry_kind not null default 'payment',
  amount          numeric(16,2) not null,
  currency        pay_currency,
  usd_divisa_rate numeric(14,4),
  usd_blue_rate   numeric(14,4),
  notes           text,
  created_at      timestamptz not null default now(),
  constraint buyer_payment_currency check (kind <> 'payment' or currency is not null)
);

create index on supplier_payments (supplier_id, date desc);
create index on refinery_payments (refinery_id, date desc);
create index on buyer_payments    (buyer_id, date desc);

-- ============================================================================
-- RLS
--
-- La `anon key` es pública: viaja en el bundle del navegador. TODA la
-- seguridad vive acá abajo. El rol viaja en el claim `app_role` del JWT que
-- firma la Edge Function de login; el navegador no lo puede falsificar porque
-- no tiene el secreto de firma.
-- ============================================================================

create or replace function app_role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'app_role',
    'anon'
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'suppliers','refineries','buyers','purchase_agreements','truck_purchases',
    'refinery_movements','direct_sales','supplier_payments','refinery_payments',
    'buyer_payments'
  ] loop
    execute format('alter table %I enable row level security', t);

    -- Leer: cualquier usuario logueado (admin o lectura).
    execute format($f$
      create policy %I on %I for select
      using (app_role() in ('admin','user'))
    $f$, t || '_select', t);

    -- Escribir: sólo admin. Esto es lo que hoy vive en el navegador y se
    -- puede saltear armando la URL a mano.
    execute format($f$
      create policy %I on %I for all
      using (app_role() = 'admin') with check (app_role() = 'admin')
    $f$, t || '_write', t);
  end loop;
end $$;

-- La tabla de usuarios no se expone al navegador en absoluto: sólo la toca la
-- Edge Function de login, que usa la service-role key y saltea RLS.
alter table users enable row level security;


-- ============================================================================
-- PERMISOS DE LA DATA API
--
-- El proyecto se creó con "Automatically expose new tables" DESTILDADO, así que
-- ninguna tabla es visible desde el navegador hasta que se la habilita acá.
-- Es a propósito: es lo que mantiene a `users` fuera del alcance de la API.
--
-- Dos capas, y hacen falta las dos:
--   1. GRANT  decide si la tabla existe para la API.
--   2. RLS    decide qué filas puede ver o tocar cada rol.
--
-- A `anon` (pedido sin login) no se le da nada: sin sesión no hay datos.
-- ============================================================================

grant usage on schema public to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'suppliers','refineries','buyers','purchase_agreements','truck_purchases',
    'refinery_movements','direct_sales','supplier_payments','refinery_payments',
    'buyer_payments'
  ] loop
    execute format(
      'grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- `users` queda deliberadamente SIN grants: no se expone a la Data API ni a
-- `anon` ni a `authenticated`. La única que la lee es la Edge Function de
-- login, que usa la service_role key y no pasa por estos permisos.
--
-- Esto es lo que impide repetir el agujero del Apps Script, donde "User"
-- estaba entre las entidades listables y cualquier usuario podía bajarse
-- todos los password_hash.
