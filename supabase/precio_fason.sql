-- ============================================================================
-- CAMBIOS DE PRECIO DEL FASÓN, CON FECHA DESDE
--
-- Hasta ahora el costo por tonelada era un solo número, y cambiarlo recalculaba
-- toda la cuenta corriente para atrás. Reasa pasa de 150 a 140 para lo nuevo,
-- y lo viejo tiene que quedar como estaba.
--
-- `processing_cost_per_ton` sigue siendo el precio desde el principio, y
-- `cost_changes` guarda los cambios: [{"from": "2026-10-29", "cost": 140}].
-- Cada movimiento se cobra al precio vigente el día que ocurrió.
--
-- Los cambios se cargan desde la ficha de la refinería ("Cambiar precio").
-- ============================================================================

begin;

-- Una lista de {from: fecha, cost: número > 0}. Si algo no tiene esa forma, la
-- cuenta se calcularía con basura sin avisar: mejor que la base lo rechace.
create or replace function cost_changes_validos(j jsonb) returns boolean
language plpgsql immutable as $$
declare
  e jsonb;
begin
  if jsonb_typeof(j) <> 'array' then return false; end if;
  for e in select * from jsonb_array_elements(j) loop
    if jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e->'from') is distinct from 'string'
       or jsonb_typeof(e->'cost') is distinct from 'number'
       or (e->>'cost')::numeric <= 0
       or to_char((e->>'from')::date, 'YYYY-MM-DD') <> e->>'from' then
      return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;   -- una fecha que no es fecha
end;
$$;

alter table refineries
  add column cost_changes jsonb not null default '[]'::jsonb,
  add constraint refinery_cost_changes_validos check (cost_changes_validos(cost_changes));

commit;

-- Control: todas las refinerías con su precio de siempre y sin cambios todavía.
select name, processing_cost_per_ton, cost_changes from refineries order by name;
