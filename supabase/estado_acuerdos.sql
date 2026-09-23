-- ============================================================================
-- EL ESTADO DE UN ACUERDO LO CALCULA LA BASE
--
-- `status` no es un dato que se carga: es una consecuencia de cuántas entregas
-- se hicieron sobre cuántas se pactaron. Hasta ahora lo escribía el frontend
-- en dos lugares —al sumar y al restar una entrega— pero NO al editar el
-- acuerdo. Por eso, al bajar de 2 entregas a 1 con una ya entregada, quedaba
-- 1 de 1 y seguía figurando como vigente.
--
-- Con un trigger deja de haber tres lugares donde calcular lo mismo, y
-- tampoco se puede desincronizar editando desde el SQL Editor.
-- ============================================================================

begin;

create or replace function acuerdo_estado() returns trigger
language plpgsql
as $$
begin
  NEW.status := case
    when NEW.delivered_count >= NEW.total_deliveries then 'closed'
    else 'open'
  end;
  return NEW;
end $$;

create trigger purchase_agreements_estado
  before insert or update on purchase_agreements
  for each row execute function acuerdo_estado();

-- Corregir los que ya quedaron mal. El UPDATE dispara el trigger, que
-- recalcula; los que ya estaban bien no cambian y no ensucian la auditoría.
update purchase_agreements set status = status;

commit;

-- Control: ninguno puede quedar entregado por completo y seguir vigente.
select
  count(*) filter (where status = 'open')   as vigentes,
  count(*) filter (where status = 'closed') as cerrados,
  count(*) filter (where status = 'open' and delivered_count >= total_deliveries)
    as mal_vigentes
from purchase_agreements;
