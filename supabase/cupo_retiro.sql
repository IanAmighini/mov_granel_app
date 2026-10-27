-- ============================================================================
-- CUPO MENSUAL DE RETIRO
--
-- Algunas refinerías dejan retirar gratis una cantidad fija de toneladas por
-- mes (El Triunfo: 150 tn, unos 5 camiones). La idea es llegar siempre al
-- cupo, así que la app muestra cuánto se retiró en el mes y cuánto falta.
--
-- Es un dato de la refinería, no un acuerdo: no tiene precio, ni contraparte,
-- ni se "cierra"; se renueva solo cada mes. Vacío = la refinería no tiene cupo.
-- ============================================================================

begin;

alter table refineries
  add column monthly_free_tons numeric(10,3)
  constraint refinery_quota_positive check (monthly_free_tons is null or monthly_free_tons > 0);

update refineries set monthly_free_tons = 150
 where id = '69fde374-f765-4e99-afa5-e2f0938327fc';   -- El Triunfo

commit;

-- Control: tiene que aparecer El Triunfo con 150.
select name, monthly_free_tons from refineries where monthly_free_tons is not null;
