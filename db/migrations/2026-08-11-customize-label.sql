-- Título de personalización por categoría.
--
-- Se aplica sola durante el despliegue (scripts/migrate.mjs). No hace falta
-- correr nada a mano en Supabase.
--
-- Solo AGREGA una columna: ninguna fila existente se modifica. Todas las
-- categorías quedan con customize_label = NULL, que significa "mostrar el texto
-- genérico Ingredientes".
--
-- El valor de cada categoría se llena desde el panel:
--   Admin → Categorías → editar → "Título al personalizar"
--
-- Nota: hasta ahora todos los combos mostraban "Personalizar hamburguesa"
-- porque estaba fijo en el código. Al desplegar pasarán a mostrar
-- "Ingredientes" hasta que se llene el campo de la categoría Hamburguesas.
-- Se deja a propósito para no escribir sobre datos de producción.

alter table categories add column if not exists customize_label text;
