#!/usr/bin/env python3
"""
Genera el SQL que compara los 29 saldos de Supabase contra el baseline sacado
de la planilla. Replica la lógica de src/lib/oilUtils.js en SQL.

    python3 supabase/verify_balances.py supabase/baseline.json | pbcopy
"""
import json, argparse

# Conversión a la moneda de cuenta. `p` es el prefijo de la tabla.
# Espeja convertToUsdDivisa() / convertPaymentAmount(): si falta una cotización
# el resultado es 0, igual que en el JS (que devuelve 0 en vez de romper).
def conv(amount, cur, div, blue, acct_expr):
    return f"""
      case when {acct_expr} = 'usd_billete' then
        case {cur}
          when 'usd_billete' then {amount}
          when 'usd_divisa'  then case when coalesce({div},0)=0 or coalesce({blue},0)=0
                                       then 0 else {amount}*({div}/{blue}) end
          when 'ars'         then case when coalesce({blue},0)=0
                                       then 0 else {amount}/{blue} end
          else {amount} end
      else
        case {cur}
          when 'usd_divisa'  then {amount}
          when 'usd_billete' then case when coalesce({div},0)=0 or coalesce({blue},0)=0
                                       then 0 else {amount}*({blue}/{div}) end
          when 'ars'         then case when coalesce({div},0)=0
                                       then 0 else {amount}/{div} end
          else {amount} end
      end"""

# Neto SIN redondear: calcNetTons() del JS tampoco redondea.
NETO = "(p.tons * (1 - p.discount_percent/100.0))"

# El precio del fasón vigente el día del movimiento (ver precio_fason.sql).
COSTO = """coalesce((
          select (c->>'cost')::numeric from jsonb_array_elements(r.cost_changes) c
          where (c->>'from')::date <= m.date
          order by (c->>'from')::date desc limit 1), r.processing_cost_per_ton)"""

SQL = f"""
-- ============================================================================
-- Verificación de saldos: Supabase contra el baseline de la planilla.
-- `resultado` tiene que decir OK en las 29 filas.
-- ============================================================================

with

-- ---- PROVEEDORES: compras al debe, pagos al haber -------------------------
prov as (
  select s.id, s.name, s.account_currency::text as acct,
    coalesce((
      select sum(
        case when s.account_currency = 'usd_billete' then
          case p.price_currency
            when 'usd_blue'   then {NETO} * p.price_per_ton
            else case when coalesce(p.usd_divisa_rate,0)=0 or coalesce(p.usd_blue_rate,0)=0
                      then 0 else {NETO} * p.price_per_ton
                                * (p.usd_divisa_rate/p.usd_blue_rate) end end
        else
          case p.price_currency
            when 'usd_divisa' then {NETO} * p.price_per_ton
            else case when coalesce(p.usd_divisa_rate,0)=0 or coalesce(p.usd_blue_rate,0)=0
                      then 0 else {NETO} * p.price_per_ton
                                * (p.usd_blue_rate/p.usd_divisa_rate) end end
        end)
      from truck_purchases p where p.supplier_id = s.id), 0) as compras
  from suppliers s
),
prov_pagos as (
  select pr.id,
    coalesce(sum(case when q.kind='initial_balance' and q.amount > 0
                      then q.amount else 0 end), 0) as debe_extra,
    coalesce(sum(case when q.kind='initial_balance'
                      then case when q.amount < 0 then -q.amount else 0 end
                      else {conv('q.amount','q.currency','q.usd_divisa_rate','q.usd_blue_rate','pr.acct')}
                 end), 0) as haber
  from prov pr left join supplier_payments q on q.supplier_id = pr.id
  group by pr.id
),

-- ---- REFINERÍAS: costo de proceso al debe ---------------------------------
refi as (
  select r.id, r.name,
    case r.pricing_type
      when 'ingress_per_ton' then coalesce((
        select sum(coalesce(m.gross_tons, m.tons) * {COSTO})
        from refinery_movements m
        where m.refinery_id = r.id and m.movement_type = 'crude_in'), 0)
      when 'egress_per_ton' then coalesce((
        select sum(m.tons * {COSTO})
        from refinery_movements m
        where m.refinery_id = r.id and m.movement_type = 'refined_out'
          and not m.is_initial_balance), 0)
      else 0
    end as cargos
  from refineries r
),
refi_pagos as (
  select rf.id,
    coalesce(sum(case when q.kind='initial_balance' and q.amount > 0
                      then q.amount else 0 end), 0) as debe_extra,
    coalesce(sum(case when q.kind='initial_balance'
                      then case when q.amount < 0 then -q.amount else 0 end
                      else {conv('q.amount','q.currency','q.usd_divisa_rate','q.usd_blue_rate',"'usd_divisa'")}
                 end), 0) as haber
  from refi rf left join refinery_payments q on q.refinery_id = rf.id
  group by rf.id
),

-- ---- COMPRADORES: refinado retirado + compras directas + ventas directas --
comp as (
  select b.id, b.name,
    -- refinado retirado de una refinería
    coalesce((
      select sum(
        m.tons * coalesce(nullif(m.sale_price_per_ton,0), a.price_per_ton, 0)
        * case when coalesce(m.sale_price_currency, a.price_currency, 'usd_divisa') = 'usd_blue'
                    and coalesce(m.usd_divisa_rate,0) <> 0 and coalesce(m.usd_blue_rate,0) <> 0
               then (m.usd_blue_rate/m.usd_divisa_rate) else 1 end)
      from refinery_movements m
      left join purchase_agreements a on a.id = m.purchase_agreement_id
      where m.buyer_id = b.id and m.movement_type = 'refined_out'
        and not m.is_initial_balance), 0)
    + -- camiones vendidos directo, sin pasar por refinería
    coalesce((
      select sum({NETO} * coalesce(p.sale_price_per_ton,0))
      from truck_purchases p where p.buyer_id = b.id), 0)
    + -- ventas directas
    coalesce((
      select sum(d.tons * d.price_per_ton
        * case when d.price_currency = 'usd_blue'
                    and coalesce(d.usd_divisa_rate,0) <> 0 and coalesce(d.usd_blue_rate,0) <> 0
               then (d.usd_divisa_rate/d.usd_blue_rate) else 1 end)
      from direct_sales d where d.buyer_id = b.id), 0) as ventas
  from buyers b
),
comp_pagos as (
  select c.id,
    coalesce(sum(case when q.kind='initial_balance' and q.amount > 0
                      then q.amount else 0 end), 0) as debe_extra,
    coalesce(sum(case when q.kind='initial_balance'
                      then case when q.amount < 0 then -q.amount else 0 end
                      else {conv('q.amount','q.currency','q.usd_divisa_rate','q.usd_blue_rate',"'usd_divisa'")}
                 end), 0) as haber
  from comp c left join buyer_payments q on q.buyer_id = c.id
  group by c.id
),

-- ---- todo junto -----------------------------------------------------------
actual as (
  select 'proveedor::'||pr.name as cuenta,
         round((pr.compras + pp.debe_extra - pp.haber)::numeric, 2) as valor
  from prov pr join prov_pagos pp on pp.id = pr.id
  union all
  select 'refineria::'||rf.name,
         round((rf.cargos + rp.debe_extra - rp.haber)::numeric, 2)
  from refi rf join refi_pagos rp on rp.id = rf.id
  union all
  select 'comprador::'||c.name,
         round((c.ventas + cp.debe_extra - cp.haber)::numeric, 2)
  from comp c join comp_pagos cp on cp.id = c.id
  union all
  select 'stock::'||r.name, round(coalesce(sum(
           case m.movement_type when 'crude_in' then m.tons
                                when 'refined_out' then -m.tons
                                else m.tons end), 0)::numeric, 3)
  from refineries r left join refinery_movements m on m.refinery_id = r.id
  group by r.name
),
esperado(cuenta, valor) as (values
{{VALUES}}
)
select e.cuenta,
       e.valor as baseline,
       a.valor as supabase,
       coalesce(a.valor,0) - e.valor as dif,
       case when a.valor is null then '*** FALTA ***'
            when abs(a.valor - e.valor) < 0.011 then 'OK'
            else '*** DIFERENCIA ***' end as resultado
from esperado e left join actual a using (cuenta)
order by resultado, cuenta;
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("baseline", nargs="?", default="supabase/baseline.json")
    a = ap.parse_args()
    base = json.load(open(a.baseline))
    vals = ",\n".join(f"  ('{k.replace(chr(39), chr(39)*2)}', {v}::numeric)"
                      for k, v in sorted(base.items()))
    print(SQL.replace("{VALUES}", vals))

if __name__ == "__main__":
    main()
