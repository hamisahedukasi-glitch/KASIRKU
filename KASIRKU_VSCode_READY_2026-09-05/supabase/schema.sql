-- KASIRKU production starting schema (draft)
-- This file is intentionally a foundation, not a destructive migration.

create extension if not exists pgcrypto;

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  full_name text,
  role text not null default 'cashier' check (role in ('owner','admin','cashier')),
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  code text,
  barcode text,
  sku text,
  name text not null,
  category text,
  unit text,
  hpp numeric(18,2) not null default 0,
  selling_price numeric(18,2) not null default 0,
  min_stock numeric(18,3) not null default 0,
  photo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  trx_no text not null,
  operator_id uuid,
  customer_id uuid,
  subtotal numeric(18,2) not null default 0,
  discount numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  payment_method text not null,
  payment_status text not null default 'LUNAS',
  receivable numeric(18,2) not null default 0,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (business_id, idempotency_key),
  unique (business_id, trx_no)
);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric(18,3) not null,
  price numeric(18,2) not null,
  hpp numeric(18,2) not null default 0,
  discount numeric(18,2) not null default 0,
  subtotal numeric(18,2) not null default 0
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id),
  movement_type text not null check (movement_type in ('IN','OUT','ADJUSTMENT','RETURN_IN','RETURN_OUT')),
  qty numeric(18,3) not null,
  reference_type text,
  reference_id uuid,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create table if not exists sync_queue_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  device_id text not null,
  entity_type text not null,
  entity_id text not null,
  operation text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

-- RLS policies must be added after business membership rules are finalized.
-- Do not enable broad public access in production.
