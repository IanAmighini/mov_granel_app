-- ============================================================================
-- CUPO DE RETIRO: POR MES O POR SEMANA, EN TONELADAS O EN RETIROS
--
-- Sigue a cupo_retiro.sql. El Triunfo deja retirar 150 tn por mes; Oligra,
-- 3 retiros por semana. Son la misma idea con otra unidad y otro período, así
-- que el cupo pasa a tener las dos cosas en vez de una columna por caso.
--
-- La semana va de lunes a domingo.
-- ============================================================================

begin;

create type quota_period as enum ('month', 'week');
create type quota_unit   as enum ('tons', 'trucks');

alter table refineries rename column monthly_free_tons to withdrawal_quota;
alter table refineries
  add column withdrawal_quota_period quota_period,
  add column withdrawal_quota_unit   quota_unit;

-- El que ya estaba cargado era mensual y en toneladas.
update refineries
   set withdrawal_quota_period = 'month', withdrawal_quota_unit = 'tons'
 where withdrawal_quota is not null;

-- Los tres van juntos: un cupo sin período o sin unidad no se puede calcular.
alter table refineries add constraint refinery_quota_complete check (
  (withdrawal_quota is null and withdrawal_quota_period is null and withdrawal_quota_unit is null) or
  (withdrawal_quota is not null and withdrawal_quota_period is not null and withdrawal_quota_unit is not null)
);

update refineries
   set withdrawal_quota = 3, withdrawal_quota_period = 'week', withdrawal_quota_unit = 'trucks'
 where id = '065b897d-fb87-4c7b-b75b-af979c8aa20d';   -- Oligra - Fason

commit;

-- Control: El Triunfo 150 / month / tons y Oligra 3 / week / trucks.
select name, withdrawal_quota, withdrawal_quota_period, withdrawal_quota_unit
  from refineries where withdrawal_quota is not null order by name;
