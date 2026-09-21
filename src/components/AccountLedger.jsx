import { useState } from "react";
import { Download, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatUsd, formatDate } from "@/lib/oilUtils";
import { exportLedgerToExcel, nombreDeArchivo } from "@/lib/exportLedger";

const miles = (n, dec = 2) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);

function celda(row, col) {
  const v = row[col.key];
  if (col.key === "date") return formatDate(v);
  if (v === "" || v === null || v === undefined) return "—";
  if (col.tons) return miles(Number(v), 3);
  if (col.money) {
    const n = Number(v);
    return Number.isNaN(n) ? v : miles(n);
  }
  return v;
}

/** Un cero en Debe, Haber o Ajuste se muestra como vacío, no como 0,00. */
function vacia(col, row) {
  return ["debit", "credit", "tadj"].includes(col.key) && !row[col.key];
}

/** Color de la celda según el rol de la columna. */
function tono(col, row) {
  const v = Number(row[col.key]) || 0;
  switch (col.tone) {
    case "debit":  return v ? "text-debe" : "";
    case "credit": return v ? "text-haber" : "";
    case "signed": // un ajuste: verde si suma, rojo si resta
      return v > 0 ? "text-haber" : v < 0 ? "text-debe" : "";
    case "balance": // saldo de cuenta: positivo es deuda
      return `font-semibold ${
        v > 0.01 ? "text-debe" : v < -0.01 ? "text-haber" : "text-muted-foreground/70"}`;
    case "neutral": // stock acumulado: sólo negativo es raro
      return `font-semibold ${v < -0.001 ? "text-debe" : "text-foreground"}`;
    default:
      return col.key === "comments" ? "text-muted-foreground" : "";
  }
}

/**
 * La cuenta corriente con el formato de las planillas: título, leyenda del
 * signo del saldo, totales arriba y el detalle abajo con el saldo acumulado.
 *
 * `onEdit`/`onDelete` son opcionales: si no se pasan, no se muestra la
 * columna de acciones (por ejemplo para un usuario de sólo lectura).
 */
export default function AccountLedger({ ledger, heading = "Cuenta Corriente", onEdit, onDelete }) {
  const [bajando, setBajando] = useState(false);
  const { columns, rows, totals, title, legend, unitLabel } = ledger;
  const acciones = !!(onEdit || onDelete);

  const exportar = async () => {
    setBajando(true);
    try {
      await exportLedgerToExcel(ledger, nombreDeArchivo(title));
    } catch (e) {
      console.error(e);
      alert("No se pudo generar el Excel: " + (e.message || e));
    } finally {
      setBajando(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{heading}</h2>
          <p className="text-xs text-muted-foreground/70 italic">
            {legend} · {unitLabel}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportar} disabled={bajando}>
          <Download className="w-4 h-4 mr-2" />
          {bajando ? "Generando..." : "Exportar a Excel"}
        </Button>
      </div>

      {/* Alto máximo a propósito: la tabla scrollea por dentro y así los
          encabezados y los totales quedan fijos, igual que los panes
          congelados del Excel. Sin un alto definido, `sticky` no tiene
          contra qué fijarse y el saldo se va de pantalla al scrollear. */}
      <div className="bg-card rounded-xl border border-border max-h-[70vh] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={`sticky top-0 z-20 bg-muted ${
                    c.align === "right" ? "text-right" : ""
                  }`}
                >
                  {c.label}
                </TableHead>
              ))}
              {acciones && <TableHead className="sticky top-0 z-20 bg-muted w-20" />}
            </TableRow>
            {/* Totales arriba, como en las planillas */}
            <TableRow>
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  className={`sticky top-10 z-10 bg-muted font-bold border-b-2 ${
                    c.align === "right" ? "text-right" : ""
                  }`}
                >
                  {totals[c.key] === undefined
                    ? ""
                    : c.tons
                      ? miles(totals[c.key], 3)
                      : formatUsd(totals[c.key])}
                </TableCell>
              ))}
              {acciones && <TableCell className="sticky top-10 z-10 bg-muted border-b-2" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (acciones ? 1 : 0)} className="text-center text-muted-foreground/70 py-8">
                  Sin movimientos
                </TableCell>
              </TableRow>
            ) : (
              [...rows].reverse().map((r) => (
                <TableRow key={`${r.kind}-${r.id}`}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={
                        c.align === "right" ? "text-right" : ""
                      }
                    >
                      <span className={tono(c, r)}>
                        {vacia(c, r) ? "—" : celda(r, c)}
                      </span>
                    </TableCell>
                  ))}
                  {acciones && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {onEdit && (
                          <Button variant="ghost" size="sm" onClick={() => onEdit(r)}
                            className="text-muted-foreground/70 hover:text-foreground hover:bg-muted">
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {onDelete && (
                          <Button variant="ghost" size="sm" onClick={() => onDelete(r)}
                            className="text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
