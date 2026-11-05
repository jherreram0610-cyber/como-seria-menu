-- Horario de atención, pausa de pedidos y aviso de pago.
--
-- Se aplica sola durante el despliegue (scripts/migrate.mjs). No hace falta
-- correr nada a mano en Supabase.
--
-- Solo CREA una tabla nueva de una fila (id fijo 'singleton') y la siembra con
-- el horario que ya estaba escrito a mano en el encabezado del menú:
--   "mar-jue 5:30pm - 9:30pm | vie-dom y festivos 5:30pm - 10:00pm"
-- Ningún dato existente se modifica.
--
-- OJO, cambio de comportamiento al desplegar: desde ese momento el menú deja de
-- aceptar pedidos fuera de ese horario (lunes cerrado). Si el horario real es
-- otro, ajustarlo en Admin → Horario.
--
-- weekly_hours: 7 entradas, índice 0 = domingo (igual que Date.getDay()).
-- holiday_hours: horario de los festivos de Colombia; null = siguen su día.
-- special_days: fechas puntuales que mandan sobre todo lo demás.

create table if not exists store_settings (
  id              text primary key default 'singleton',
  weekly_hours    jsonb not null,
  holiday_hours   jsonb,
  special_days    jsonb not null default '[]',
  orders_paused   boolean not null default false,
  pause_message   text,
  pause_until     timestamptz,
  payment_notice  text,
  updated_at      timestamptz not null default now()
);

insert into store_settings (id, weekly_hours, holiday_hours) values (
  'singleton',
  '[
    {"isOpen": true,  "from": "17:30", "to": "22:00"},
    {"isOpen": false, "from": "17:30", "to": "21:30"},
    {"isOpen": true,  "from": "17:30", "to": "21:30"},
    {"isOpen": true,  "from": "17:30", "to": "21:30"},
    {"isOpen": true,  "from": "17:30", "to": "21:30"},
    {"isOpen": true,  "from": "17:30", "to": "22:00"},
    {"isOpen": true,  "from": "17:30", "to": "22:00"}
  ]',
  '{"isOpen": true, "from": "17:30", "to": "22:00"}'
)
on conflict (id) do nothing;
