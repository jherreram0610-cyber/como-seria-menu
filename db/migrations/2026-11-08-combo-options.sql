-- Opciones de combo administrables y opciones permitidas por producto.
--
-- Se aplica sola durante el despliegue (scripts/migrate.mjs).
--
-- Antes, los acompañamientos del combo (Papas, Papas Lemon Pepper, Aros de
-- Cebolla +$1.000) y "Papas Grandes +$2.000" estaban escritos a mano en el
-- código del menú, así que el panel no podía quitarlos ni cambiarles el precio.
-- Ahora viven en esta tabla. Se siembran con EXACTAMENTE los mismos valores y
-- los mismos ids que usaba el código (s1, s2, s3), para que el menú se vea
-- igual hasta que el restaurante cambie algo y los pedidos viejos sigan
-- coincidiendo.
--
-- kind:
--   'acompanamiento' → el cliente elige UNO (viene incluido en el combo).
--   'mejora'         → opcional, se puede marcar o no (ej. Papas Grandes).

create table if not exists combo_options (
  id          text primary key,
  kind        text not null check (kind in ('acompanamiento', 'mejora')),
  name        text not null,
  price       integer not null default 0,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into combo_options (id, kind, name, price, sort_order) values
  ('s1', 'acompanamiento', 'Papas', 0, 0),
  ('s2', 'acompanamiento', 'Papas Lemon Pepper', 0, 1),
  ('s3', 'acompanamiento', 'Aros de Cebolla', 1000, 2),
  ('papas-grandes', 'mejora', 'Papas Grandes', 2000, 0)
on conflict (id) do nothing;

-- Qué puede elegir el cliente en CADA producto. Se guarda lo que se QUITÓ (no
-- lo permitido): lista vacía = permite todo, igual que antes. Así, una adición,
-- bebida u opción nueva aparece sola en todos los productos sin tener que
-- marcarla uno por uno.
alter table menu_items add column if not exists excluded_adiciones jsonb not null default '[]';
alter table menu_items add column if not exists excluded_bebidas jsonb not null default '[]';
alter table menu_items add column if not exists excluded_combo_options jsonb not null default '[]';

-- Bebida que viene marcada al abrir un combo. null = la primera de la lista
-- (comportamiento de antes).
alter table menu_items add column if not exists default_bebida text;
