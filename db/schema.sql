-- Como Seria — esquema de base de datos (Postgres / Supabase)
-- Se ejecuta una sola vez (o cada vez que se corre scripts/seed-menu.mjs, es idempotente).

create table if not exists menu_items (
  id                   text primary key,
  category             text not null check (category in ('hamburguesas', 'tenders', 'combos', 'adiciones', 'bebidas')),
  name                 text not null,
  price                integer not null,
  description          text,
  ingredients          jsonb not null default '[]',
  burger               text,
  combo_extra          integer,
  allow_customization  boolean not null default true,
  is_new               boolean not null default false,
  popular              boolean not null default false,
  special              boolean not null default false,
  is_burger_master     boolean not null default false,
  burger_img           text,
  sort_order           integer not null default 0,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  customer_name     text not null,
  items             jsonb not null,
  subtotal          integer not null,
  delivery_fee      integer not null default 0,
  total             integer not null,
  delivery_type     text not null,
  delivery_location text,
  delivery_address  text,
  payment_method    text,
  created_at        timestamptz not null default now()
);

create table if not exists delivery_locations (
  id          text primary key,
  name        text not null,
  price       integer not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Una sola fila (id fijo 'singleton'): la contraseña del panel de admin,
-- hasheada con scrypt. Se siembra desde ADMIN_PASSWORD la primera vez
-- (ver scripts/seed-menu.mjs) y después se puede cambiar desde el panel.
create table if not exists admin_settings (
  id            text primary key default 'singleton',
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists menu_items_category_idx on menu_items (category, sort_order);

-- Migraciones idempotentes para bases de datos creadas antes de estas columnas.
-- Nunca se borran pedidos de verdad (DELETE FROM): "eliminar" un pedido desde el
-- panel solo marca is_deleted = true, así el registro se conserva siempre.
alter table orders add column if not exists is_deleted boolean not null default false;
alter table admin_settings add column if not exists delete_pin_hash text;

-- Categorías del menú, editables/reordenables desde el panel (antes fijas en
-- código). Las 5 originales se siembran aquí mismo (no en scripts/seed-menu.mjs)
-- porque deben existir ANTES de poder agregar la foreign key de menu_items.category
-- más abajo, incluso en una base de datos que ya tenga productos cargados.
create table if not exists categories (
  id          text primary key,
  label       text not null,
  icon        text not null default '🍽️',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into categories (id, label, icon, sort_order) values
  ('hamburguesas', 'Hamburguesas', '🍔', 0),
  ('tenders', 'Chicken Tenders', '🍗', 1),
  ('combos', 'Combos', '🔥', 2),
  ('adiciones', 'Adiciones', '➕', 3),
  ('bebidas', 'Bebidas', '🥤', 4)
on conflict (id) do nothing;

alter table menu_items drop constraint if exists menu_items_category_check;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'menu_items_category_fkey'
  ) then
    alter table menu_items add constraint menu_items_category_fkey
      foreign key (category) references categories(id);
  end if;
end $$;

-- "Eliminar" un producto o categoría desde el panel tampoco borra el registro
-- de verdad: solo lo marca como is_deleted = true y desaparece de todas las
-- vistas (a diferencia de is_active, que solo lo oculta del menú del cliente
-- pero se puede reactivar).
alter table menu_items add column if not exists is_deleted boolean not null default false;
alter table categories add column if not exists is_deleted boolean not null default false;

-- Suscripciones de Web Push (una por dispositivo/navegador que le dio
-- "Permitir" a las notificaciones desde el panel de admin). El endpoint ya es
-- único por sí mismo (lo asigna el navegador), así que sirve como llave.
create table if not exists push_subscriptions (
  endpoint    text primary key,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

-- Posición de encuadre de la foto del producto (valor CSS object-position,
-- ej. "50% 50%"): permite reposicionar sin recortar el archivo, para que se
-- vea la parte deseada de la foto dentro del recuadro fijo del menú.
alter table menu_items add column if not exists burger_img_position text not null default '50% 50%';

-- Métodos de pago (antes fijos en código), editables desde el panel.
-- "accounts" es la lista de datos para copiar que ve el cliente (ej. número
-- de Nequi, llave Bre-B, cuenta de ahorros) — puede tener 0, 1 o varias.
create table if not exists payment_methods (
  id          text primary key,
  label       text not null,
  accounts    jsonb not null default '[]',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Se siembran los 3 métodos que ya existían fijos en el código, con los
-- mismos datos, para que nada cambie hasta que el admin edite algo.
insert into payment_methods (id, label, accounts, sort_order) values
  ('qr-bold', 'QR de Bold', '[]', 0),
  ('nequi', 'Nequi', '[{"label":"Nequi","value":"3243517902"}]', 1),
  ('transferencia', 'Transferencia', '[{"label":"Llave Bre-B","value":"3243517902"},{"label":"Ahorros Bancolombia","value":"74567092902"}]', 2)
on conflict (id) do nothing;

alter table payment_methods add column if not exists is_deleted boolean not null default false;
