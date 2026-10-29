import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, RotateCcw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import { sheetsClient } from "@/api/sheetsClient";
import { useOilData } from "@/hooks/useOilData";
import { oilTypeLabels, formatDate } from "@/lib/oilUtils";

/** Nombres de tabla en castellano. */
const TABLAS = {
  suppliers: "Proveedores",
  refineries: "Refinerías",
  buyers: "Compradores",
  purchase_agreements: "Acuerdos",
  truck_purchases: "Compras",
  refinery_movements: "Movimientos de refinería",
  direct_sales: "Ventas directas",
  supplier_payments: "Pagos a proveedores",
  refinery_payments: "Pagos a refinerías",
  buyer_payments: "Pagos de compradores",
  users: "Usuarios",
};

const ACCIONES = {
  insert: { label: "Alta",   icon: Plus,   clase: "text-haber" },
  update: { label: "Cambio", icon: Pencil, clase: "text-aviso" },
  delete: { label: "Baja",   icon: Trash2, clase: "text-debe" },
};

/** Campos con nombre entendible; el resto se muestra como viene. */
const CAMPOS = {
  name: "Nombre", date: "Fecha", amount: "Monto", currency: "Moneda",
  tons: "Toneladas", gross_tons: "Toneladas descargadas", net_tons: "Toneladas netas",
  discount_percent: "Descuento %", price_per_ton: "Precio por tonelada",
  price_currency: "Moneda del precio", sale_price_per_ton: "Precio de venta",
  usd_divisa_rate: "Cotización divisa", usd_blue_rate: "Cotización blue",
  ticket_number: "Ticket", driver: "Chofer", notes: "Notas", kind: "Tipo",
  oil_type: "Aceite", movement_type: "Movimiento", status: "Estado",
  role: "Rol", email: "Email", is_active: "Activo",
  account_currency: "Moneda de cuenta", processing_cost_per_ton: "Costo de fasón",
  cost_changes: "Cambios de precio del fasón",
  delivered_count: "Entregas hechas", total_deliveries: "Entregas totales",
};
const campo = (k) => CAMPOS[k] || k;

const fmt = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  // cost_changes: [{from, cost}] -> "140 desde 2026-10-29"
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    return v.map((x) => (x?.from ? `${x.cost} desde ${x.from}` : JSON.stringify(x))).join(", ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

function cuando(iso) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * De qué registro se trata, en una línea.
 *
 * El log guarda los ids tal como están en la base, así que sin resolverlos
 * contra los nombres una fila dice "cambió una nota" y no cuál. La gracia de
 * la pantalla es justamente poder identificar el registro de un vistazo.
 */
function describir(fila, nombres) {
  const r = fila.new_row || fila.old_row || {};
  const quien = (id) => nombres[id] || null;
  const partes = [];

  switch (fila.table_name) {
    case "truck_purchases":
      partes.push(quien(r.supplier_id), formatDate(r.date),
                  r.tons && `${r.tons} tn`, oilTypeLabels[r.oil_type],
                  r.ticket_number && `tk ${r.ticket_number}`,
                  quien(r.refinery_id) || quien(r.buyer_id));
      break;
    case "refinery_movements":
      partes.push(quien(r.refinery_id), formatDate(r.date),
                  r.movement_type === "crude_in" ? "ingreso"
                    : r.movement_type === "refined_out" ? "egreso" : "ajuste",
                  r.tons && `${r.tons} tn`, oilTypeLabels[r.oil_type],
                  quien(r.buyer_id) && `→ ${quien(r.buyer_id)}`);
      break;
    case "direct_sales":
      partes.push(quien(r.buyer_id), formatDate(r.date), r.tons && `${r.tons} tn`);
      break;
    case "supplier_payments":
      partes.push(quien(r.supplier_id), formatDate(r.date), r.amount && `${r.amount}`, r.currency);
      break;
    case "refinery_payments":
      partes.push(quien(r.refinery_id), formatDate(r.date), r.amount && `${r.amount}`, r.currency);
      break;
    case "buyer_payments":
      partes.push(quien(r.buyer_id), formatDate(r.date), r.amount && `${r.amount}`, r.currency);
      break;
    case "purchase_agreements":
      partes.push(quien(r.supplier_id) || quien(r.buyer_id), oilTypeLabels[r.oil_type],
                  r.price_per_ton && `${r.price_per_ton}/tn`);
      break;
    case "users":
      partes.push(r.email, r.role);
      break;
    default:
      partes.push(r.name, r.notes);
  }

  const texto = partes.filter(Boolean).join(" · ");
  return texto || "—";
}

const corto = (v) => {
  const t = fmt(v);
  return t.length > 28 ? t.slice(0, 27) + "…" : t;
};

/** Qué cambió, con el antes y el después cuando entra en una línea. */
function queCambio(fila) {
  if (fila.action !== "update" || !fila.changed?.length) return null;
  if (fila.changed.length === 1) {
    const k = fila.changed[0];
    return `${campo(k)}: ${corto(fila.old_row?.[k])} → ${corto(fila.new_row?.[k])}`;
  }
  return fila.changed.map(campo).join(", ");
}

export default function Activity() {
  const [detalle, setDetalle] = useState(null);
  const [filtro, setFiltro] = useState({});

  // Proveedores, refinerías y compradores, para poder poner nombres donde el
  // log sólo tiene ids. Comparte caché con el resto de la app, así que casi
  // siempre ya está cargado.
  const { data: oil } = useOilData();
  const nombres = {};
  for (const lista of [oil?.suppliers, oil?.refineries, oil?.buyers]) {
    for (const x of lista || []) nombres[x.id] = x.name;
  }

  const { data, isLoading } = useQuery({
    queryKey: ["auditLog", filtro],
    queryFn: () => sheetsClient.auditLog(filtro),
    staleTime: 15000,
  });

  const filas = data || [];
  const usuarios = [...new Set(filas.map((f) => f.actor_email).filter(Boolean))];

  return (
    <div>
      <PageHeader
        title="Actividad"
        description="Todo lo que se cargó, cambió o borró, y quién lo hizo. Se registra solo."
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <Filtro activo={!filtro.action && !filtro.actor} onClick={() => setFiltro({})}>
          Todo
        </Filtro>
        {Object.entries(ACCIONES).map(([k, a]) => (
          <Filtro key={k} activo={filtro.action === k}
                  onClick={() => setFiltro((f) => ({ ...f, action: f.action === k ? undefined : k }))}>
            {a.label}
          </Filtro>
        ))}
        {usuarios.map((u) => (
          <Filtro key={u} activo={filtro.actor === u}
                  onClick={() => setFiltro((f) => ({ ...f, actor: f.actor === u ? undefined : u }))}>
            {u.split("@")[0]}
          </Filtro>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden overflow-x-auto">
        <Table className="whitespace-nowrap">
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Cuándo</TableHead>
              <TableHead className="w-28">Qué</TableHead>
              <TableHead>Quién</TableHead>
              <TableHead>Dónde</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : filas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Todavía no hay actividad registrada
                </TableCell>
              </TableRow>
            ) : (
              filas.map((f) => {
                const a = ACCIONES[f.action] || {};
                const Icono = a.icon;
                return (
                  <TableRow key={f.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {cuando(f.at)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 font-medium ${a.clase}`}>
                        {Icono && <Icono className="w-3.5 h-3.5" />}
                        {a.label}
                      </span>
                    </TableCell>
                    <TableCell className={f.actor_email ? "" : "text-muted-foreground/70 italic"}>
                      {f.actor_email || "desde la base"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {TABLAS[f.table_name] || f.table_name}
                    </TableCell>
                    <TableCell className="max-w-[420px]">
                      <span className="block truncate">{describir(f, nombres)}</span>
                      {queCambio(f) && (
                        <span className="block text-xs text-muted-foreground/70 truncate">
                          {queCambio(f)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setDetalle(f)}>
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DetalleDialog fila={detalle} nombres={nombres} onClose={() => setDetalle(null)} />
    </div>
  );
}

function Filtro({ activo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        activo
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** El antes y el después, campo por campo. */
function DetalleDialog({ fila, nombres, onClose }) {
  if (!fila) return null;
  const a = ACCIONES[fila.action] || {};

  // En un cambio sólo interesan los campos que cambiaron; en un alta o una
  // baja, la fila entera (sin los campos internos, que no dicen nada).
  const OCULTOS = ["id", "created_at"];
  const claves =
    fila.action === "update"
      ? fila.changed || []
      : Object.keys(fila.new_row || fila.old_row || {}).filter((k) => !OCULTOS.includes(k));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {a.label} en {TABLAS[fila.table_name] || fila.table_name}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm font-medium -mt-2">{describir(fila, nombres)}</p>
        <p className="text-sm text-muted-foreground -mt-3">
          {cuando(fila.at)} · {fila.actor_email || "desde la base de datos, sin pasar por la app"}
        </p>

        <div className="rounded-lg border border-border overflow-x-auto">
          <Table className="whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead>Campo</TableHead>
                <TableHead>Antes</TableHead>
                <TableHead>Después</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claves.map((k) => (
                <TableRow key={k}>
                  <TableCell className="font-medium">{campo(k)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmt(fila.old_row?.[k])}
                  </TableCell>
                  <TableCell>{fmt(fila.new_row?.[k])}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {fila.action === "delete" && (
          <p className="text-xs text-muted-foreground flex items-start gap-2">
            <RotateCcw className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Esto se borró, pero la fila quedó guardada entera. Se puede recuperar
            desde la base con <code className="font-mono">audit_restore({fila.id})</code>.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
