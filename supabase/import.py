#!/usr/bin/env python3
"""
Genera el SQL de importación desde la planilla de Google a Supabase.

    python3 supabase/import.py "Aceite a Granel.xlsx" -o supabase/import.sql

No toca la base: sólo escribe un .sql que después se pega en el SQL Editor
de Supabase (o se corre con psql). Los id de la planilla ya son UUID válidos,
así que se reusan tal cual y las relaciones se preservan solas.

Transformaciones que hace, y por qué:
  - created_date            -> created_at
  - is_initial_balance      -> kind ('payment' | 'initial_balance' | 'adjustment')
  - destination             -> buyer_id  (en refinery_movements)
  - party_id + party_type   -> supplier_id | buyer_id  (en purchase_agreements)
  - '' y None               -> NULL
  - filas fantasma (sólo id y created_date) se saltean
  - claves foráneas rotas se importan como NULL
"""
import sys, re, argparse, datetime, unicodedata
from collections import defaultdict

try:
    import openpyxl
except ImportError:
    sys.exit("Falta openpyxl:  pip3 install openpyxl")

UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')

# Códigos cortos para la columna ORIGEN-DESTINO de la planilla.
CODES = {
    "Oligra - Fason":       "OLI - FAS",
    "Reasa - Fason":        "REA - FAS",
    "Oligra - Proveedores": "OLI - PROV",
    "El Triunfo":           "TRI",
}

# ---------------------------------------------------------------- utilidades

def lit(v):
    """Convierte un valor de la planilla en un literal SQL."""
    if v is None or v == "":
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (datetime.datetime, datetime.date)):
        return "'" + v.isoformat() + "'"
    return "'" + str(v).replace("'", "''") + "'"

def as_date(v):
    """La planilla mezcla datetime con texto 'YYYY-MM-DD'."""
    if v is None or v == "":
        return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    return str(v)[:10]

def as_bool(v):
    return str(v).strip().lower() in ("true", "1", "sí", "si", "verdadero")

def as_ticket(v):
    """
    El numero de ticket.

    La planilla los guarda como numeros de Excel, asi que openpyxl devuelve
    6070.0 y escribirlo tal cual en una columna de texto deja "6070.0". Son
    enteros: se guardan sin decimales. Los que no son numericos ("?",
    "Sin Numero de TK") pasan intactos, y por eso la columna es texto.
    """
    if v is None or v == "":
        return None
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, int):
        return str(v)
    return str(v).strip()

def as_num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

def is_ghost(row):
    """Fila creada por un POST vacío: sólo trae id y created_date."""
    return not any(v not in (None, "") for k, v in row.items()
                   if k not in ("id", "created_date"))

def code_for(name):
    return CODES.get(name) or unicodedata.normalize("NFKD", str(name or ""))[:4].upper()

# ---------------------------------------------------------------- lectura

def read_sheets(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    out = {}
    for ws in wb.worksheets:
        hdr = [c.value for c in ws[1]]
        out[ws.title] = [dict(zip(hdr, r))
                         for r in ws.iter_rows(min_row=2, values_only=True) if any(r)]
    return out

# ---------------------------------------------------------------- generación

class Importer:
    def __init__(self, sheets):
        self.s = sheets
        self.notes = []            # avisos para revisar a mano
        self.candidates = []       # posibles ajustes cargados como pagos
        self.sql = []
        self.ids = {n: {r["id"] for r in sheets.get(n, []) if not is_ghost(r)}
                    for n in ("Supplier", "Refinery", "Buyer",
                              "PurchaseAgreement", "TruckPurchase")}

    def warn(self, msg):
        self.notes.append(msg)

    def fk(self, value, target, origen):
        """Devuelve la FK si el destino existe; si no, NULL y deja aviso."""
        if value in (None, ""):
            return None
        if value not in self.ids[target]:
            self.warn(f"{origen}: apuntaba a {target} {value} que ya no existe -> se importa NULL")
            return None
        return value

    def emit(self, table, cols, rows):
        if not rows:
            self.sql.append(f"-- {table}: sin filas\n")
            return
        self.sql.append(f"-- {table}: {len(rows)} filas")
        self.sql.append(f"insert into {table} ({', '.join(cols)}) values")
        body = [",\n".join("  (" + ", ".join(lit(r.get(c)) for c in cols) + ")" for r in rows)]
        self.sql.append(body[0] + ";\n")

    # ---- partes -----------------------------------------------------------
    def parties(self):
        sup = [{"id": r["id"], "name": r["name"], "phone": r["phone"],
                "account_currency": r["account_currency"] or "usd_divisa",
                "notes": r["notes"], "created_at": r["created_date"]}
               for r in self.s["Supplier"] if not is_ghost(r)]
        self.emit("suppliers",
                  ["id", "name", "phone", "account_currency", "notes", "created_at"], sup)

        ref = [{"id": r["id"], "name": r["name"], "code": code_for(r["name"]),
                "location": r["location"], "pricing_type": r["pricing_type"] or "none",
                "processing_cost_per_ton": as_num(r["processing_cost_per_ton"]),
                "notes": r["notes"], "created_at": r["created_date"]}
               for r in self.s["Refinery"] if not is_ghost(r)]
        self.emit("refineries",
                  ["id", "name", "code", "location", "pricing_type",
                   "processing_cost_per_ton", "notes", "created_at"], ref)

        buy = [{"id": r["id"], "name": r["name"], "code": code_for(r["name"]),
                "location": r["location"],
                "default_price_currency": r["default_price_currency"],
                "default_price_per_ton": as_num(r["default_price_per_ton"]),
                "notes": r["notes"], "created_at": r["created_date"]}
               for r in self.s["Buyer"] if not is_ghost(r)]
        self.emit("buyers",
                  ["id", "name", "code", "location", "default_price_currency",
                   "default_price_per_ton", "notes", "created_at"], buy)

    # ---- acuerdos ---------------------------------------------------------
    def agreements(self):
        out = []
        for r in self.s["PurchaseAgreement"]:
            if is_ghost(r):
                self.warn(f"PurchaseAgreement {r['id']}: fila vacía -> se saltea")
                continue
            ptype = r["party_type"] or "supplier"
            party = r["party_id"] or r["supplier_id"]
            out.append({
                "id": r["id"], "date": as_date(r["date"]),
                "agreement_type": r["agreement_type"] or "purchase_crude",
                "party_type": ptype,
                "supplier_id": party if ptype == "supplier" else None,
                "buyer_id":    party if ptype == "buyer"    else None,
                "oil_type": r["oil_type"],
                "price_per_ton": as_num(r["price_per_ton"]),
                "price_currency": r["price_currency"],
                "total_deliveries": int(as_num(r["total_deliveries"]) or 0),
                "delivered_count": int(as_num(r["delivered_count"]) or 0),
                "status": r["status"] or "open", "notes": r["notes"],
                "created_at": r["created_date"]})
        self.emit("purchase_agreements",
                  ["id", "date", "agreement_type", "party_type", "supplier_id", "buyer_id",
                   "oil_type", "price_per_ton", "price_currency", "total_deliveries",
                   "delivered_count", "status", "notes", "created_at"], out)

    # ---- compras ----------------------------------------------------------
    def purchases(self):
        out = []
        for r in self.s["TruckPurchase"]:
            if is_ghost(r):
                self.warn(f"TruckPurchase {r['id']}: fila vacía -> se saltea")
                continue
            out.append({
                "id": r["id"], "date": as_date(r["date"]), "supplier_id": r["supplier_id"],
                "oil_type": r["oil_type"],
                "tons": as_num(r["tons"]),
                "discount_percent": as_num(r["discount_percent"]) or 0,
                "price_per_ton": as_num(r["price_per_ton"]),
                "price_currency": r["price_currency"],
                "usd_divisa_rate": as_num(r["usd_divisa_rate"]),
                "usd_blue_rate": as_num(r["usd_blue_rate"]),
                "refinery_id": r["refinery_id"] or None,
                "buyer_id": r["buyer_id"] or None,
                "sale_price_per_ton": as_num(r["sale_price_per_ton"]),
                "ticket_number": as_ticket(r["ticket_number"]), "notes": r["notes"],
                "purchase_agreement_id": self.fk(r["purchase_agreement_id"],
                                                 "PurchaseAgreement", f"TruckPurchase {r['id']}"),
                "sale_agreement_id": self.fk(r["sale_agreement_id"],
                                             "PurchaseAgreement", f"TruckPurchase {r['id']}"),
                "created_at": r["created_date"]})
        self.emit("truck_purchases",
                  ["id", "date", "supplier_id", "oil_type", "tons", "discount_percent",
                   "price_per_ton", "price_currency", "usd_divisa_rate", "usd_blue_rate",
                   "refinery_id", "buyer_id", "sale_price_per_ton", "ticket_number",
                   "notes", "purchase_agreement_id", "sale_agreement_id", "created_at"], out)

    # ---- movimientos ------------------------------------------------------
    def movements(self):
        out = []
        for r in self.s["RefineryMovement"]:
            if is_ghost(r):
                self.warn(f"RefineryMovement {r['id']}: fila vacía -> se saltea")
                continue
            out.append({
                "id": r["id"], "date": as_date(r["date"]), "refinery_id": r["refinery_id"],
                "movement_type": r["movement_type"], "oil_type": r["oil_type"],
                "tons": as_num(r["tons"]), "gross_tons": as_num(r["gross_tons"]),
                "buyer_id": self.fk(r["destination"], "Buyer", f"RefineryMovement {r['id']}"),
                "truck_purchase_id": self.fk(r["truck_purchase_id"], "TruckPurchase",
                                             f"RefineryMovement {r['id']}"),
                "purchase_agreement_id": self.fk(r["purchase_agreement_id"], "PurchaseAgreement",
                                                 f"RefineryMovement {r['id']}"),
                "sale_price_per_ton": as_num(r["sale_price_per_ton"]),
                "sale_price_currency": r["sale_price_currency"],
                "usd_divisa_rate": as_num(r["usd_divisa_rate"]),
                "usd_blue_rate": as_num(r["usd_blue_rate"]),
                "is_initial_balance": as_bool(r["is_initial_balance"]),
                "ticket_number": as_ticket(r["ticket_number"]), "notes": r["notes"],
                "created_at": r["created_date"]})
        self.emit("refinery_movements",
                  ["id", "date", "refinery_id", "movement_type", "oil_type", "tons",
                   "gross_tons", "buyer_id", "truck_purchase_id", "purchase_agreement_id",
                   "sale_price_per_ton", "sale_price_currency", "usd_divisa_rate",
                   "usd_blue_rate", "is_initial_balance", "ticket_number", "notes",
                   "created_at"], out)

    # ---- ventas directas --------------------------------------------------
    def direct_sales(self):
        out = [{"id": r["id"], "date": as_date(r["date"]),
                "origin_refinery_id": r["origin_refinery_id"], "buyer_id": r["buyer_id"],
                "oil_type": r["oil_type"], "tons": as_num(r["tons"]),
                "price_per_ton": as_num(r["price_per_ton"]),
                "price_currency": r["price_currency"],
                "usd_divisa_rate": as_num(r["usd_divisa_rate"]),
                "usd_blue_rate": as_num(r["usd_blue_rate"]),
                "ticket_number": as_ticket(r["ticket_number"]), "notes": r["notes"],
                "created_at": r["created_date"]}
               for r in self.s["DirectSale"] if not is_ghost(r)]
        self.emit("direct_sales",
                  ["id", "date", "origin_refinery_id", "buyer_id", "oil_type", "tons",
                   "price_per_ton", "price_currency", "usd_divisa_rate", "usd_blue_rate",
                   "ticket_number", "notes", "created_at"], out)

    # ---- pagos ------------------------------------------------------------
    def payments(self, sheet, table, fk_col):
        out = []
        for r in self.s[sheet]:
            if is_ghost(r):
                self.warn(f"{sheet} {r['id']}: fila vacía -> se saltea")
                continue
            div, blue = as_num(r["usd_divisa_rate"]), as_num(r["usd_blue_rate"])
            amount, currency = as_num(r["amount"]), r["currency"]

            if as_bool(r["is_initial_balance"]):
                kind = "initial_balance"
            else:
                kind = "payment"
                if currency == "usd_billete" and div == 1 and blue == 1:
                    # Firma del truco de la planilla: importe en billete con las
                    # dos cotizaciones forzadas a 1 para que no se convierta.
                    # Algunos son ajustes y otros son pagos reales, y por el texto
                    # de las notas no se distingue con confianza. La importación NO
                    # decide: entra tal cual para que el saldo quede idéntico, y se
                    # reporta para reclasificar a mano después del corte.
                    self.candidates.append(
                        (sheet, r["id"], as_date(r["date"]), amount, r["notes"]))

            out.append({"id": r["id"], "date": as_date(r["date"]), fk_col: r[fk_col],
                        "kind": kind, "amount": amount, "currency": currency,
                        "usd_divisa_rate": div, "usd_blue_rate": blue,
                        "notes": r["notes"], "created_at": r["created_date"]})
        self.emit(table, ["id", "date", fk_col, "kind", "amount", "currency",
                          "usd_divisa_rate", "usd_blue_rate", "notes", "created_at"], out)

    def run(self):
        self.sql.append("-- Generado por supabase/import.py — NO editar a mano.")
        self.sql.append("-- Correr sobre una base con schema.sql ya aplicado.\n")
        self.sql.append("begin;\n")
        self.parties()
        self.agreements()
        self.purchases()
        self.movements()
        self.direct_sales()
        self.payments("SupplierPayment", "supplier_payments", "supplier_id")
        self.payments("RefineryPayment", "refinery_payments", "refinery_id")
        self.payments("BuyerPayment",    "buyer_payments",    "buyer_id")
        self.sql.append("commit;")
        return "\n".join(self.sql)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("-o", "--out", default="supabase/import.sql")
    a = ap.parse_args()

    imp = Importer(read_sheets(a.xlsx))
    sql = imp.run()
    with open(a.out, "w") as f:
        f.write(sql)

    print(f"Escrito: {a.out}  ({len(sql.splitlines())} líneas)")
    if imp.notes:
        print(f"\n{len(imp.notes)} avisos:")
        for n in imp.notes:
            print("  -", n)
    else:
        print("\nSin avisos.")

    if imp.candidates:
        print(f"\n{len(imp.candidates)} posibles AJUSTES cargados como pagos "
              f"(entran como 'payment'; reclasificar a mano si corresponde):")
        for sheet, rid, date, amount, notes in imp.candidates:
            print(f"  - {date}  {amount:>12,.2f}   {notes!r}")

if __name__ == "__main__":
    main()
