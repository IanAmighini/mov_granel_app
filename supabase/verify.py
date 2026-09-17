#!/usr/bin/env python3
"""
Calcula el saldo de TODAS las cuentas, replicando exactamente la lógica de
src/lib/oilUtils.js.

    python3 supabase/verify.py "Aceite a Granel.xlsx"              # baseline
    python3 supabase/verify.py "Aceite a Granel.xlsx" -o base.json # guardar
    python3 supabase/verify.py "Aceite a Granel.xlsx" -c base.json # comparar

El día del corte: se guarda el baseline desde la planilla, se importa a
Supabase, se vuelve a correr contra la base nueva y se comparan. Si algún
saldo se mueve, no se corta.
"""
import sys, json, argparse, datetime

try:
    import openpyxl
except ImportError:
    sys.exit("Falta openpyxl:  pip3 install openpyxl")

TOL = 0.01   # un centavo

def num(v):
    try:
        return float(v) if v not in (None, "") else 0.0
    except (TypeError, ValueError):
        return 0.0

def truthy(v):
    return str(v).strip().lower() in ("true", "1")

# ---------------------------------------------------- lógica de oilUtils.js

def to_divisa(amount, cur, div, blue):
    """convertToUsdDivisa()"""
    if not amount:
        return 0.0
    if cur == "usd_divisa":
        return amount
    if cur == "usd_billete":
        return amount * (blue / div) if (div and blue) else 0.0
    if cur == "ars":
        return amount / div if div else 0.0
    return amount

def convert_payment(amount, cur, div, blue, acct="usd_divisa"):
    """convertPaymentAmount()"""
    if not amount:
        return 0.0
    if acct != "usd_billete":
        return to_divisa(amount, cur, div, blue)
    if cur == "usd_billete":
        return amount
    if cur == "usd_divisa":
        return amount * (div / blue) if (div and blue) else 0.0
    if cur == "ars":
        return amount / blue if blue else 0.0
    return amount

def net_tons(p):
    return num(p["tons"]) * (1 - num(p["discount_percent"]) / 100)

def purchase_amount(p, acct="usd_divisa"):
    """calcTruckPurchaseAmount()"""
    total = net_tons(p) * num(p["price_per_ton"])
    div, blue, cur = num(p["usd_divisa_rate"]), num(p["usd_blue_rate"]), p["price_currency"]
    if acct == "usd_billete":
        if cur == "usd_blue":
            return total
        if cur == "usd_divisa":
            return total * (div / blue) if (div and blue) else 0.0
    else:
        if cur == "usd_divisa":
            return total
        if cur == "usd_blue":
            return total * (blue / div) if (div and blue) else 0.0
    return total

def refined_sale(m, agreements):
    """calcRefinedSaleUsdDivisa()"""
    ag = agreements.get(m["purchase_agreement_id"]) or {}
    price = num(m["sale_price_per_ton"]) or num(ag.get("price_per_ton"))
    cur = m["sale_price_currency"] or ag.get("price_currency") or "usd_divisa"
    total = num(m["tons"]) * price
    if cur == "usd_blue":
        div, blue = num(m["usd_divisa_rate"]), num(m["usd_blue_rate"])
        return total * (blue / div) if (div and blue) else total
    return total

def direct_sale(s):
    """calcDirectSaleUsdDivisa() — se replica TAL CUAL está hoy, incluida la
    conversión invertida respecto del resto del archivo (ver nota al final)."""
    total = num(s["tons"]) * num(s["price_per_ton"])
    if s["price_currency"] == "usd_blue":
        div, blue = num(s["usd_divisa_rate"]), num(s["usd_blue_rate"])
        return total * (div / blue) if (div and blue) else total
    return total

def apply_payments(rows, charges, credits, acct="usd_divisa"):
    for p in rows:
        a = num(p["amount"])
        if truthy(p["is_initial_balance"]):
            if a > 0:
                charges += a
            else:
                credits += abs(a)
        else:
            credits += convert_payment(a, p["currency"], num(p["usd_divisa_rate"]),
                                       num(p["usd_blue_rate"]), acct)
    return charges, credits

# ---------------------------------------------------- cálculo

def balances(sheets):
    def S(n):
        return sheets.get(n, [])
    agreements = {a["id"]: a for a in S("PurchaseAgreement")}
    out = {}

    for s in S("Supplier"):
        acct = s["account_currency"] or "usd_divisa"
        pur = [p for p in S("TruckPurchase") if p["supplier_id"] == s["id"]]
        pay = [p for p in S("SupplierPayment") if p["supplier_id"] == s["id"]]
        d = sum(purchase_amount(p, acct) for p in pur)
        d, c = apply_payments(pay, d, 0.0, acct)
        out[f"proveedor::{s['name']}"] = round(d - c, 2)

    for r in S("Refinery"):
        mov = [m for m in S("RefineryMovement") if m["refinery_id"] == r["id"]]
        pay = [p for p in S("RefineryPayment") if p["refinery_id"] == r["id"]]
        cost = num(r["processing_cost_per_ton"])
        if r["pricing_type"] == "ingress_per_ton":
            ch = sum((num(m["gross_tons"]) or num(m["tons"])) * cost
                     for m in mov if m["movement_type"] == "crude_in")
        elif r["pricing_type"] == "egress_per_ton":
            ch = sum(num(m["tons"]) * cost for m in mov
                     if m["movement_type"] == "refined_out" and not truthy(m["is_initial_balance"]))
        else:
            ch = 0.0
        ch, cr = apply_payments(pay, ch, 0.0)
        out[f"refineria::{r['name']}"] = round(ch - cr, 2)

        stock = 0.0
        for m in mov:
            t = num(m["tons"])
            if m["movement_type"] == "crude_in":      stock += t
            elif m["movement_type"] == "refined_out": stock -= t
            elif m["movement_type"] == "adjustment":  stock += t
        out[f"stock::{r['name']}"] = round(stock, 3)

    for b in S("Buyer"):
        ch = 0.0
        for m in S("RefineryMovement"):
            if (m["destination"] == b["id"] and m["movement_type"] == "refined_out"
                    and not truthy(m["is_initial_balance"])):
                ch += refined_sale(m, agreements)
        for p in S("TruckPurchase"):
            if p["buyer_id"] == b["id"]:
                ch += net_tons(p) * num(p["sale_price_per_ton"])
        for s in S("DirectSale"):
            if s["buyer_id"] == b["id"]:
                ch += direct_sale(s)
        pay = [p for p in S("BuyerPayment") if p["buyer_id"] == b["id"]]
        ch, cr = apply_payments(pay, ch, 0.0)
        out[f"comprador::{b['name']}"] = round(ch - cr, 2)

    return out

def read_xlsx(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    out = {}
    for ws in wb.worksheets:
        hdr = [c.value for c in ws[1]]
        out[ws.title] = [dict(zip(hdr, r))
                         for r in ws.iter_rows(min_row=2, values_only=True) if any(r)]
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("-o", "--out")
    ap.add_argument("-c", "--compare")
    a = ap.parse_args()

    res = balances(read_xlsx(a.xlsx))

    if a.compare:
        base = json.load(open(a.compare))
        bad = 0
        for k in sorted(set(base) | set(res)):
            x, y = base.get(k), res.get(k)
            if x is None or y is None or abs(x - y) > TOL:
                print(f"  ✗ {k}: baseline={x}  actual={y}")
                bad += 1
        print(f"\n{'TODO COINCIDE' if not bad else f'{bad} DIFERENCIAS — NO CORTAR'}")
        sys.exit(1 if bad else 0)

    grupo = None
    for k in sorted(res):
        g, name = k.split("::", 1)
        if g != grupo:
            grupo = g
            print(f"\n--- {g.upper()}")
        unidad = "Tn" if g == "stock" else "USD"
        print(f"  {name:<32}{res[k]:>14,.2f} {unidad}")

    if a.out:
        json.dump(res, open(a.out, "w"), indent=1, sort_keys=True)
        print(f"\nBaseline guardado en {a.out}  ({len(res)} cuentas)")

if __name__ == "__main__":
    main()
