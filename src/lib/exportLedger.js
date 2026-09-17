/**
 * Descarga la cuenta corriente como Excel, con el formato de las planillas:
 * título, leyenda de a favor de quién es el saldo, fila de totales arriba,
 * encabezados y los montos con separador de miles.
 *
 * `write-excel-file` se importa dinámicamente para que no entre en el bundle
 * inicial: sólo se descarga cuando alguien aprieta Exportar.
 */
const MONEDA = "#,##0.00";
const TONS = "#,##0.000";
// write-excel-file exige el formato #RRGGBB, no el ARGB de exceljs.
const GRIS = "#EFEFEF";

function valorDeCelda(row, col) {
  const v = row[col.key];
  if (col.key === "date") return { value: v || "", type: String };
  // En las planillas, el Debe y el Haber que no aplican van en blanco, no en
  // cero: una columna llena de ceros hace más ruido que la que está vacía.
  // El Saldo sí se muestra siempre, incluso cuando es cero.
  if ((col.key === "debit" || col.key === "credit") && !v) {
    return { value: "", type: String };
  }
  if (col.money || col.tons) {
    const n = Number(v);
    if (!v && v !== 0) return { value: "", type: String };
    if (Number.isNaN(n)) return { value: String(v), type: String };
    return { value: n, type: Number, format: col.tons ? TONS : MONEDA };
  }
  return { value: v === "" || v == null ? "" : String(v), type: String };
}

/**
 * Arma la matriz de celdas. Separado de la descarga a propósito: así se puede
 * probar en Node, sin navegador, que es donde se vio que fallaba.
 */
export function buildSheetData(ledger) {
  const cols = ledger.columns;
  const n = cols.length;

  const encabezado = (texto, extra = {}) => [
    { value: texto, type: String, fontWeight: "bold", columnSpan: n,
      align: "center", backgroundColor: GRIS, ...extra },
    ...Array(n - 1).fill(null),
  ];

  // Fila de totales, como en las planillas: arriba, antes del detalle.
  const totales = cols.map((c) => {
    if (c.key === "tons")    return { value: ledger.totals.tons,    type: Number, format: TONS,   fontWeight: "bold", align: "right" };
    if (c.key === "debit")   return { value: ledger.totals.debit,   type: Number, format: MONEDA, fontWeight: "bold", align: "right" };
    if (c.key === "credit")  return { value: ledger.totals.credit,  type: Number, format: MONEDA, fontWeight: "bold", align: "right" };
    if (c.key === "balance") return { value: ledger.totals.balance, type: Number, format: MONEDA, fontWeight: "bold", align: "right" };
    return { value: "", type: String };
  });

  const data = [
    encabezado(ledger.title),
    encabezado(`${ledger.legend}  ·  ${ledger.unitLabel}`, {
      fontWeight: undefined, fontStyle: "italic", backgroundColor: undefined,
    }),
    cols.map((c) => ({
      value: c.label, type: String, fontWeight: "bold",
      align: c.align, backgroundColor: GRIS, borderColor: "#000000",
    })),
    totales,
    ...ledger.rows.map((r) => cols.map((c) => ({ ...valorDeCelda(r, c), align: c.align }))),
  ];

  return { data, columns: cols.map((c) => ({ width: c.width })) };
}

export async function exportLedgerToExcel(ledger, nombreArchivo) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const { data, columns } = buildSheetData(ledger);
  await writeExcelFile(data, {
    columns,
    sheet: "Cuenta corriente",
    fontFamily: "Calibri",
    fontSize: 11,
    // Título, leyenda, encabezados y totales quedan fijos al hacer scroll.
    stickyRowsCount: 4,
    fileName: nombreArchivo,
  });
}

/** "Biocedes - Sintiolo" -> "cuenta-corriente-biocedes-sintiolo-2026-09-17.xlsx" */
export function nombreDeArchivo(nombre) {
  const limpio = nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `cuenta-corriente-${limpio}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}
