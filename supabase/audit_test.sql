-- ============================================================================
-- PRUEBA DE LA AUDITORÍA
--
-- Hace un alta, un cambio y un borrado de verdad sobre las tablas reales,
-- comprueba que quedaron registrados, y al final DESHACE TODO con un rollback.
--
-- No queda ningún dato de prueba: ni el proveedor inventado ni los asientos
-- del log. Corrélo entero de una sola vez — si lo cortás a la mitad, el
-- rollback no se ejecuta.
-- ============================================================================

begin;

-- 1. ALTA
insert into suppliers (id, name, account_currency)
values ('00000000-0000-0000-0000-000000000001', 'PRUEBA BORRAR', 'usd_divisa');

-- 2. CAMBIO (dos campos)
update suppliers
   set name = 'PRUEBA BORRAR 2', phone = '11-1111-1111'
 where id = '00000000-0000-0000-0000-000000000001';

-- 3. CAMBIO QUE NO CAMBIA NADA (no debería registrarse)
update suppliers
   set name = 'PRUEBA BORRAR 2'
 where id = '00000000-0000-0000-0000-000000000001';

-- 4. BORRADO
delete from suppliers where id = '00000000-0000-0000-0000-000000000001';

-- Qué quedó registrado. Esperado: 3 asientos (alta, cambio, baja).
-- El cambio que no cambió nada NO tiene que aparecer.
select
  action,
  table_name,
  changed,
  coalesce(actor_email, '(sin JWT: desde el SQL Editor)') as quien,
  old_row ->> 'name' as nombre_antes,
  new_row ->> 'name' as nombre_despues
from audit_log
where row_id = '00000000-0000-0000-0000-000000000001'
order by id;

rollback;

-- Control final: no tiene que quedar NADA de la prueba.
select
  (select count(*) from suppliers where id = '00000000-0000-0000-0000-000000000001') as proveedor_prueba,
  (select count(*) from audit_log where row_id = '00000000-0000-0000-0000-000000000001') as asientos_prueba;
