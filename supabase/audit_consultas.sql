-- ============================================================================
-- CÓMO LEER LA AUDITORÍA
--
-- Recetas para usar cuando haga falta. No se corre entero: se elige la que
-- sirve y se ejecuta sola.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Qué pasó últimamente
-- ---------------------------------------------------------------------------
select
  to_char(at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') as cuando,
  coalesce(actor_email, '(SQL Editor)') as quien,
  action as que,
  table_name as donde,
  array_to_string(changed, ', ') as campos,
  coalesce(new_row ->> 'name', old_row ->> 'name',
           new_row ->> 'notes', old_row ->> 'notes', '') as detalle
from audit_log
order by at desc
limit 50;

-- ---------------------------------------------------------------------------
-- 2. Toda la historia de una fila
--    Pegar el id del registro que interesa.
-- ---------------------------------------------------------------------------
select
  to_char(at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') as cuando,
  coalesce(actor_email, '(SQL Editor)') as quien,
  action, changed, old_row, new_row
from audit_log
where row_id = '00000000-0000-0000-0000-000000000000'   -- <-- el id acá
order by at;

-- ---------------------------------------------------------------------------
-- 3. Qué se borró en los últimos 30 días
--    La columna `id` de este resultado es la que se le pasa a audit_restore().
-- ---------------------------------------------------------------------------
select
  id,
  to_char(at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') as cuando,
  coalesce(actor_email, '(SQL Editor)') as quien,
  table_name as tabla,
  old_row ->> 'date'   as fecha_del_registro,
  old_row ->> 'amount' as monto,
  old_row ->> 'name'   as nombre,
  old_row ->> 'notes'  as notas
from audit_log
where action = 'delete'
  and at > now() - interval '30 days'
order by at desc;

-- ---------------------------------------------------------------------------
-- 4. Restaurar algo borrado
--    Primero mirarlo con la consulta 3, después pasarle ese `id`.
--    La restauración queda registrada como un alta nueva en el log.
-- ---------------------------------------------------------------------------
-- select audit_restore(123);

-- ---------------------------------------------------------------------------
-- 5. Quién tocó la plata: cambios y borrados sobre pagos y compras
-- ---------------------------------------------------------------------------
select
  to_char(at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') as cuando,
  coalesce(actor_email, '(SQL Editor)') as quien,
  action, table_name,
  old_row ->> 'amount' as monto_antes,
  new_row ->> 'amount' as monto_despues,
  array_to_string(changed, ', ') as campos
from audit_log
where table_name in ('supplier_payments', 'refinery_payments', 'buyer_payments',
                     'truck_purchases')
  and action in ('update', 'delete')
order by at desc
limit 50;

-- ---------------------------------------------------------------------------
-- 6. Cambios de rol o de contraseña de un usuario
--    (el hash nunca se guarda en el log, sólo queda que hubo un cambio)
-- ---------------------------------------------------------------------------
select
  to_char(at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') as cuando,
  coalesce(actor_email, '(SQL Editor)') as quien,
  action,
  old_row ->> 'email' as usuario,
  old_row ->> 'role'  as rol_antes,
  new_row ->> 'role'  as rol_despues,
  array_to_string(changed, ', ') as campos
from audit_log
where table_name = 'users'
order by at desc;
