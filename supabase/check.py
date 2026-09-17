#!/usr/bin/env python3
"""
Genera el control de integridad de la importación: compara, tabla por tabla,
la cantidad de filas y la suma de cada columna numérica entre la planilla y
Supabase.

    python3 supabase/check.py "Aceite a Granel.xlsx" | pbcopy

Usa Decimal, no float. En la primera versión de este control usé float y dio
una falsa alarma de un centavo: la suma de toneladas da 1995.595, y el medio
centavo final se redondea distinto en float (redondeo bancario, y 0.005 no es
representable en binario) que en el `numeric` exacto de Postgres. La planilla
está llena de valores con 3 decimales, así que el caso se repite solo.
"""
import sys, argparse
from decimal import Decimal, ROUND_HALF_UP

try:
    import openpyxl
except ImportError:
    sys.exit("Falta openpyxl:  pip3 install openpyxl")

# (hoja, tabla, columnas numéricas)
SPEC = [
    ("Supplier",          "suppliers",           []),
    ("Refinery",          "refineries",          ["processing_cost_per_ton"]),
    ("Buyer",             "buyers",              ["default_price_per_ton"]),
    ("PurchaseAgreement", "purchase_agreements", ["price_per_ton", "total_deliveries",
                                                  "delivered_count"]),
    ("TruckPurchase",     "truck_purchases",     ["tons", "discount_percent",
                                                  "price_per_ton", "sale_price_per_ton"]),
    ("RefineryMovement",  "refinery_movements",  ["tons", "gross_tons", "sale_price_per_ton"]),
    ("DirectSale",        "direct_sales",        ["tons", "price_per_ton"]),
    ("SupplierPayment",   "supplier_payments",   ["amount"]),
    ("RefineryPayment",   "refinery_payments",   ["amount"]),
    ("BuyerPayment",      "buyer_payments",      ["amount"]),
]

def dec(v):
    return Decimal(0) if v in (None, "") else Decimal(str(v))

def q2(d):
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def is_ghost(row):
    return not any(v not in (None, "") for k, v in row.items()
                   if k not in ("id", "created_date"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    a = ap.parse_args()

    wb = openpyxl.load_workbook(a.xlsx, data_only=True)
    parts = []
    for sheet, table, cols in SPEC:
        ws = wb[sheet]
        hdr = [c.value for c in ws[1]]
        rs = [dict(zip(hdr, r)) for r in ws.iter_rows(min_row=2, values_only=True) if any(r)]
        rs = [r for r in rs if not is_ghost(r)]

        sel = [f"'{table}' as tabla", "count(*)::int as filas", f"{len(rs)} as filas_esp"]
        if cols:
            # Una sola suma de todas las columnas, redondeada al final: es
            # exactamente lo que hace el SQL del otro lado.
            total = sum((dec(r[c]) for r in rs for c in cols), Decimal(0))
            real = " + ".join(f"coalesce(sum({c}),0)" for c in cols)
            sel += [f"round(({real})::numeric,2) as suma", f"{q2(total)}::numeric as suma_esp"]
        else:
            sel += ["0::numeric as suma", "0::numeric as suma_esp"]
        parts.append(f"select {', '.join(sel)} from {table}")

    print("-- Control de importación. `resultado` tiene que decir OK en las 10 filas.")
    print("select tabla, filas, filas_esp, suma, suma_esp,")
    print("       case when filas = filas_esp and abs(suma - suma_esp) < 0.01")
    print("            then 'OK' else '*** DIFERENCIA ***' end as resultado")
    print("from (\n  " + "\n  union all ".join(parts) + "\n) c order by resultado, tabla;")

if __name__ == "__main__":
    main()
