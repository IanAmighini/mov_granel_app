-- ============================================================================
-- LAS COTIZACIONES SE PIDEN SÓLO SI HAY ALGO QUE CONVERTIR
--
-- El check `purchase_blue_needs_rates` exigía las dos cotizaciones en TODA
-- compra pactada en blue. Pero "USD Blue" (moneda del precio) y "USD Billete"
-- (moneda de cuenta) son la misma plata con dos nombres: si el precio se pactó
-- en blue y la cuenta del proveedor se lleva en billete, el importe pasa tal
-- cual y no hay nada que convertir. La app rechazaba esas compras y obligaba a
-- inventar un 1 y 1 de relleno.
--
-- Y al revés dejaba pasar el caso peligroso: precio en divisa sobre una cuenta
-- en billete SÍ necesita las dos, y sin ellas calcTruckPurchaseAmount() daba
-- importe 0 sin avisar. Nadie lo frenaba.
--
-- La regla de verdad es una sola: hacen falta cuando la moneda del precio no
-- es la moneda de la cuenta. Eso depende de `suppliers.account_currency`, otra
-- tabla, y un CHECK no puede mirar otra tabla. Por eso va como trigger.
-- ============================================================================

begin;

alter table truck_purchases drop constraint purchase_blue_needs_rates;

create or replace function compra_cotizaciones() returns trigger
language plpgsql
as $$
declare
  cuenta account_curr;
begin
  select account_currency into cuenta from suppliers where id = NEW.supplier_id;

  -- El precio ya está en la moneda de la cuenta: no hay conversión.
  if (cuenta = 'usd_billete' and NEW.price_currency = 'usd_blue')
     or (cuenta = 'usd_divisa' and NEW.price_currency = 'usd_divisa') then
    return NEW;
  end if;

  if NEW.usd_divisa_rate is null or NEW.usd_blue_rate is null then
    raise exception
      'Faltan las cotizaciones: el precio se pactó en % y la cuenta del proveedor se lleva en %, así que hay que convertir.',
      NEW.price_currency, cuenta;
  end if;

  return NEW;
end $$;

create trigger truck_purchases_cotizaciones
  before insert or update on truck_purchases
  for each row execute function compra_cotizaciones();

-- Sacar el relleno: las compras guardadas con 1 y 1 sólo para que el check
-- viejo las dejara pasar. En esas filas no hay conversión, así que el importe
-- no se mueve ni un centavo; lo que se evita es que ese 1 y 1 se lea más tarde
-- como si fuera una cotización de verdad.
update truck_purchases tp
   set usd_divisa_rate = null, usd_blue_rate = null
  from suppliers s
 where s.id = tp.supplier_id
   and tp.usd_divisa_rate = 1
   and tp.usd_blue_rate = 1
   and ((s.account_currency = 'usd_billete' and tp.price_currency = 'usd_blue')
     or (s.account_currency = 'usd_divisa'  and tp.price_currency = 'usd_divisa'));

commit;

-- Control: ninguna compra puede quedar sin las cotizaciones que necesita.
-- Tiene que dar 0. Si da más, son filas viejas que el check anterior dejó
-- pasar y hoy se están calculando en 0: hay que cargarles las cotizaciones.
select count(*) as compras_sin_cotizacion
from truck_purchases tp
join suppliers s on s.id = tp.supplier_id
where (tp.usd_divisa_rate is null or tp.usd_blue_rate is null)
  and not ((s.account_currency = 'usd_billete' and tp.price_currency = 'usd_blue')
        or (s.account_currency = 'usd_divisa'  and tp.price_currency = 'usd_divisa'));
