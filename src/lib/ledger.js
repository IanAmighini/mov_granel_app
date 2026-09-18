/**
 * CUENTA CORRIENTE UNIFICADA
 *
 * Arma las filas del libro mayor de un proveedor, una refinería o un
 * comprador con un layout único, calcado de las planillas que Ian lleva a
 * mano. Las tres hojas usaban columnas distintas (REASA con chofer y ticket,
 * Oligra con precio y toneladas, Mondello con la cotización) pero todas son
 * un subconjunto de la misma lista, así que se arma una sola y se esconden
 * las columnas que quedan vacías para esa cuenta.
 *
 * Los importes salen de oilUtils: esta capa NO recalcula nada, sólo presenta.
 */
import {
  calcTruckPurchaseAmount,
  calcNetTons,
  convertPaymentAmount,
  convertToUsdDivisa,
  calcRefinedSaleUsdDivisa,
  calcDirectSaleUsdDivisa,
  oilTypeLabels,
  currencyLabels,
} from "./oilUtils";

/**
 * Columnas de la cuenta corriente, en el orden de las planillas.
 * `tone` le dice al componente cómo colorear: rojo lo que se debe, verde lo
 * que se pagó, y por signo en los acumulados.
 */
export const LEDGER_COLUMNS = [
  { key: "date",     label: "Fecha",           align: "left",  width: 12 },
  // Las dos cotizaciones del día. En una cuenta llevada en billete hacen
  // falta las dos para poder auditar el precio convertido.
  { key: "rateDivisa",  label: "Divisa",       align: "right", width: 11, money: true },
  { key: "rateBillete", label: "Billete",      align: "right", width: 11, money: true },
  { key: "driver",   label: "Chofer",          align: "left",  width: 18 },
  { key: "ticket",   label: "Ticket",          align: "right", width: 11, entero: true },
  { key: "price",    label: "Precio",          align: "right", width: 12, money: true },
  { key: "tons",     label: "Tn",              align: "right", width: 10, tons: true },
  { key: "route",    label: "Origen - Destino",align: "left",  width: 22 },
  { key: "comments", label: "Comentarios",     align: "left",  width: 38 },
  { key: "debit",    label: "Debe",            align: "right", width: 14, money: true, tone: "debit" },
  { key: "credit",   label: "Haber",           align: "right", width: 14, money: true, tone: "credit" },
  { key: "balance",  label: "Saldo",           align: "right", width: 14, money: true, tone: "balance" },
];

/**
 * Columnas de la planilla de stock. Es un libro aparte del de la cuenta
 * corriente: acá se mueven toneladas, allá pesos. Una misma descarga aparece
 * en las dos, porque el cargo del fasón se calcula sobre esas toneladas, pero
 * mezclarlas en una sola tabla hace que media planilla quede con columnas
 * vacías y no se entienda ninguna de las dos historias.
 */
export const STOCK_COLUMNS = [
  { key: "date",     label: "Fecha",       align: "left",  width: 12 },
  { key: "oil",      label: "Aceite",      align: "left",  width: 12 },
  { key: "driver",   label: "Chofer",      align: "left",  width: 18 },
  { key: "ticket",   label: "Ticket",      align: "right", width: 11, entero: true },
  { key: "route",    label: "Origen - Destino", align: "left", width: 26 },
  { key: "tin",      label: "Ingreso",     align: "right", width: 12, tons: true },
  { key: "tout",     label: "Egreso",      align: "right", width: 12, tons: true },
  { key: "tadj",     label: "Ajuste",      align: "right", width: 12, tons: true, tone: "signed" },
  { key: "stock",    label: "Stock",       align: "right", width: 12, tons: true, tone: "neutral" },
  { key: "comments", label: "Comentarios", align: "left",  width: 38 },
];

const vacio = (v) => v === null || v === undefined || v === "";

/** Una fila, con todos los campos del layout aunque queden vacíos. */
function fila(base) {
  return {
    id: base.id, kind: base.kind,
    date: base.date, driver: base.driver ?? "",
    rateDivisa: base.rateDivisa ?? "", rateBillete: base.rateBillete ?? "",
    ticket: base.ticket ?? "", price: base.price ?? "", tons: base.tons ?? "",
    route: base.route ?? "", comments: base.comments ?? "",
    debit: base.debit || 0, credit: base.credit || 0,
    // campos del libro de stock
    oil: base.oil ?? "", tin: base.tin ?? "", tout: base.tout ?? "", tadj: base.tadj ?? "",
  };
}

/**
 * Texto del comentario de un pago.
 * En las planillas, la fila de un pago dice el monto en pesos y dónde se
 * pagó ("Pago en Berazategui - $26.489.400"). El lugar ya viene escrito en
 * las notas, así que sólo hay que sumarle el importe original.
 */
function comentarioDePago(p) {
  const notas = (p.notes || "").trim();
  if (p.currency === "ars" && p.amount) {
    const monto = new Intl.NumberFormat("es-AR").format(p.amount);
    return notas ? `${notas} - $${monto}` : `$${monto}`;
  }
  if (notas) return notas;
  return `Pago ${currencyLabels[p.currency] || ""}`.trim();
}

/**
 * La cotización a mostrar, o vacío.
 *
 * Los ajustes de importe que venían de la planilla están cargados como pagos
 * en billete con las dos cotizaciones forzadas a 1 para que la conversión no
 * los toque. Mostrar "1,00" en la columna Divisa sería engañoso: no es una
 * cotización, es relleno.
 */
function cotizaciones(p) {
  const relleno = p.usd_divisa_rate === 1 && p.usd_blue_rate === 1;
  if (relleno) return { rateDivisa: "", rateBillete: "" };
  return {
    rateDivisa: p.usd_divisa_rate || "",
    rateBillete: p.usd_blue_rate || "",
  };
}

/**
 * Precio por tonelada expresado en la moneda en la que se lleva la cuenta.
 *
 * La cuenta de Pico - La Pampa se lleva en billete y los precios se pactan en
 * divisa, así que el precio que corresponde mostrar es el pactado por la
 * cotización de la divisa sobre la del billete: 915 x 1489,5 / 1560 = 873,65.
 * Es la misma conversión que calcTruckPurchaseAmount() aplica al total, de
 * modo que precio x toneladas siempre reconstruye el importe de la fila.
 *
 * Si falta una cotización queda vacío en vez de mostrar el pactado: el
 * importe en ese caso también es cero, y mostrar un precio que no multiplica
 * a nada sería peor que no mostrar ninguno.
 */
function precioDeCuenta(p, acct) {
  const precio = p.price_per_ton || 0;
  const div = p.usd_divisa_rate;
  const blue = p.usd_blue_rate;
  const mismaMoneda =
    acct === "usd_billete" ? p.price_currency === "usd_blue"
                           : p.price_currency === "usd_divisa";
  if (mismaMoneda) return precio;
  if (!div || !blue) return "";
  return acct === "usd_billete" ? precio * (div / blue) : precio * (blue / div);
}

/** Saldo inicial y ajuste de importe comparten forma: van por signo. */
function filaDeAsiento(p, montoHaber) {
  const esInicial = p.kind === "initial_balance" || p.is_initial_balance;
  if (esInicial) {
    const m = p.amount || 0;
    return fila({
      id: p.id, kind: "initial", date: p.date,
      comments: (p.notes || "").trim() || "Saldo inicial",
      debit: m > 0 ? m : 0, credit: m < 0 ? Math.abs(m) : 0,
    });
  }
  if (p.kind === "adjustment") {
    const m = p.amount || 0;
    return fila({
      id: p.id, kind: "adjustment", date: p.date,
      comments: (p.notes || "").trim() || "Ajuste",
      debit: m < 0 ? Math.abs(m) : 0, credit: m > 0 ? m : 0,
    });
  }
  return fila({
    id: p.id, kind: "payment", date: p.date,
    ...cotizaciones(p), comments: comentarioDePago(p),
    credit: montoHaber,
  });
}

/**
 * Código corto del destino de un camión.
 *
 * En la cuenta de un proveedor el origen es el proveedor mismo, así que sólo
 * hace falta el destino. Si en algún caso el proveedor fue un intermediario y
 * el aceite salió de otro lado, eso se anota en los comentarios.
 */
function rutaDeCompra(p, refineries, buyers) {
  const r = refineries?.find((x) => x.id === p.refinery_id);
  if (r) return r.code || r.name;
  const b = buyers?.find((x) => x.id === p.buyer_id);
  if (b) return b.code || b.name;
  return "";
}

// --------------------------------------------------------------- proveedor

export function supplierLedger(supplier, { purchases, payments, refineries, buyers }) {
  const acct = supplier.account_currency || "usd_divisa";
  const rows = [
    ...purchases.map((p) =>
      fila({
        id: p.id, kind: "purchase", date: p.date,
        driver: p.driver, ticket: p.ticket_number,
        ...cotizaciones(p),
        price: precioDeCuenta(p, acct), tons: calcNetTons(p),
        route: rutaDeCompra(p, refineries, buyers),
        comments: (p.notes || "").trim() || `Crudo ${oilTypeLabels[p.oil_type] || ""}`.trim(),
        debit: calcTruckPurchaseAmount(p, acct),
      })
    ),
    ...payments.map((p) =>
      filaDeAsiento(
        p,
        convertPaymentAmount(p.amount, p.currency, p.usd_divisa_rate, p.usd_blue_rate, acct)
      )
    ),
  ];
  return armarCuenta({
    title: `Cuenta corriente — Proveedor: ${supplier.name}`,
    legend: "Saldo positivo: MRT debe",
    currency: acct === "usd_billete" ? "USD Billete" : "USD Divisa",
    rows,
    labels: { route: "Destino" },
  });
}

/**
 * Origen o destino de un movimiento de refinería, con el nombre completo.
 *
 * Si entra crudo, el origen es el proveedor al que se lo compramos: se llega
 * a él por la compra que generó el ingreso. Si sale refinado, el destino es
 * el comprador. Un saldo inicial de stock no tiene ni uno ni otro.
 */
function origenDestino(m, { suppliers, buyers, truckPurchases }) {
  if (m.movement_type === "crude_in") {
    if (m.is_initial_balance) return "";
    const compra = (truckPurchases || []).find((p) => p.id === m.truck_purchase_id);
    if (!compra) return "";
    return (suppliers || []).find((x) => x.id === compra.supplier_id)?.name || "";
  }
  if (m.movement_type === "refined_out") {
    return (buyers || []).find((x) => x.id === m.buyer_id)?.name || "";
  }
  return "";
}

// --------------------------------------------------------------- refinería

/**
 * CUENTA CORRIENTE de una refinería: sólo la plata.
 *
 * Entran los movimientos que generan cargo de fasón y los pagos. Los que no
 * cobran nada quedan afuera a propósito: son la historia del stock, y
 * mostrarlos acá con el Debe vacío hacía que la planilla no se entendiera.
 * Para eso está refineryStockLedger().
 */
export function refineryLedger(refinery, { movements, payments, suppliers, buyers, truckPurchases }) {
  const costo = refinery.processing_cost_per_ton || 0;
  const porIngreso = refinery.pricing_type === "ingress_per_ton";
  const porEgreso = refinery.pricing_type === "egress_per_ton";

  const cargos = [];
  for (const m of movements) {
    if (m.movement_type === "adjustment") continue;  // ajuste de stock, no de plata
    const esIngreso = m.movement_type === "crude_in";

    // Un saldo inicial de stock entra como crude_in: si la refinería cobra por
    // tonelada ingresada, también se le cobra. Si cobra por egresada, no.
    let debit = 0;
    let tn = 0;
    if (porIngreso && esIngreso) {
      tn = m.gross_tons || m.tons || 0;
      debit = tn * costo;
    } else if (porEgreso && !esIngreso && !m.is_initial_balance) {
      tn = m.tons || 0;
      debit = tn * costo;
    }
    if (!debit) continue;

    cargos.push(
      fila({
        id: m.id, kind: esIngreso ? "in" : "out", date: m.date,
        driver: m.driver, ticket: m.ticket_number,
        route: origenDestino(m, { suppliers, buyers, truckPurchases }),
        price: costo, tons: tn,
        comments:
          (m.notes || "").trim() ||
          `${esIngreso ? "Descarga" : "Retiro"} ${oilTypeLabels[m.oil_type] || ""}`.trim(),
        debit,
      })
    );
  }

  const rows = [
    ...cargos,
    ...payments.map((p) =>
      filaDeAsiento(p, convertToUsdDivisa(p.amount, p.currency, p.usd_divisa_rate, p.usd_blue_rate))
    ),
  ];
  return armarCuenta({
    title: `Cuenta corriente — Refinería: ${refinery.name}`,
    legend: `Saldo positivo: a favor de ${refinery.name}`,
    currency: "USD Divisa",
    rows,
    labels: { route: "Origen - Destino" },
  });
}

/**
 * PLANILLA DE STOCK de una refinería: sólo las toneladas.
 *
 * Libro aparte del de la cuenta corriente, porque son dos historias
 * distintas: acá entra y sale aceite, allá entra y sale plata.
 */
export function refineryStockLedger(refinery, movements, ctx = {}) {
  const rows = movements.map((m) => {
    const tn = m.tons || 0;
    const esAjuste = m.movement_type === "adjustment";
    const esIngreso = m.movement_type === "crude_in";
    return fila({
      id: m.id, kind: esAjuste ? "adjustment" : esIngreso ? "in" : "out", date: m.date,
      oil: oilTypeLabels[m.oil_type] || m.oil_type,
      driver: m.driver, ticket: m.ticket_number,
      route: origenDestino(m, ctx),
      tin: !esAjuste && esIngreso ? tn : "",
      tout: !esAjuste && !esIngreso ? tn : "",
      tadj: esAjuste ? tn : "",
      comments:
        (m.notes || "").trim() ||
        (m.is_initial_balance ? "Saldo inicial de stock"
          : esAjuste ? "Ajuste"
          : esIngreso ? "Descarga de crudo"
          : "Retiro de refinado"),
    });
  });
  return armarStock({
    title: `Stock de aceite — ${refinery.name}`,
    legend: "Ingresos menos egresos, más ajustes",
    rows,
  });
}

// -------------------------------------------------------------- comprador

export function buyerLedger(buyer, { movements, truckPurchases, directSales, payments }, agreements) {
  const rows = [
    ...movements.map((m) =>
      fila({
        id: m.id, kind: "out", date: m.date,
        driver: m.driver, ticket: m.ticket_number,
        price: m.sale_price_per_ton ||
               agreements?.find((a) => a.id === m.purchase_agreement_id)?.price_per_ton || "",
        tons: m.tons,
        comments: (m.notes || "").trim() || `Refinado ${oilTypeLabels[m.oil_type] || ""}`.trim(),
        debit: calcRefinedSaleUsdDivisa(m, agreements),
      })
    ),
    ...truckPurchases.map((p) =>
      fila({
        id: p.id, kind: "purchase", date: p.date,
        driver: p.driver, ticket: p.ticket_number,
        price: p.sale_price_per_ton, tons: calcNetTons(p),
        comments: (p.notes || "").trim() || `Compra directa ${oilTypeLabels[p.oil_type] || ""}`.trim(),
        debit: calcNetTons(p) * (p.sale_price_per_ton || 0),
      })
    ),
    ...directSales.map((s) =>
      fila({
        id: s.id, kind: "sale", date: s.date,
        ticket: s.ticket_number, price: s.price_per_ton, tons: s.tons,
        comments: (s.notes || "").trim() || `Venta directa ${oilTypeLabels[s.oil_type] || ""}`.trim(),
        debit: calcDirectSaleUsdDivisa(s),
      })
    ),
    ...payments.map((p) =>
      filaDeAsiento(p, convertToUsdDivisa(p.amount, p.currency, p.usd_divisa_rate, p.usd_blue_rate))
    ),
  ];
  return armarCuenta({
    title: `Cuenta corriente — Cliente: ${buyer.name}`,
    legend: "Saldo positivo: a favor de MRT",
    currency: "USD Divisa",
    rows,
  });
}

// ------------------------------------------------------------------ común

/**
 * Ordena por fecha, acumula el saldo y saca los totales.
 *
 * Sirve para los dos libros: `suma` son las columnas que se totalizan,
 * `acumula` las dos que se restan para el corriente, y `dest` dónde se
 * guarda. La cuenta corriente acumula debe menos haber; el stock, ingresos
 * menos egresos más ajustes.
 */
function armar({ title, legend, currency, unitLabel, rows, columns, suma, acumula, dest, siempre, labels }) {
  const ordenadas = [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));

  let corriente = 0;
  const conSaldo = ordenadas.map((r) => {
    corriente += acumula(r);
    return { ...r, [dest]: corriente };
  });

  const totals = { [dest]: corriente };
  for (const k of suma) {
    totals[k] = conSaldo.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  }

  // Una columna vacía en todas las filas no se muestra: es lo que hace que
  // las planillas distintas salgan de un layout único. `driver` es la
  // excepción y va siempre: se carga "si se tiene", así que una cuenta puede
  // no tener ninguno todavía y la columna igual tiene que estar para poder
  // verlo y completarlo.
  const visibles = columns
    .filter((c) => {
      if (siempre.includes(c.key)) return true;
      return conSaldo.some((r) => !vacio(r[c.key]));
    })
    // La misma columna se llama distinto según el libro: en la cuenta de un
    // proveedor es sólo "Destino" (el origen es él mismo), y en la de una
    // refinería es el par "Origen - Destino".
    .map((c) => (labels?.[c.key] ? { ...c, label: labels[c.key] } : c));

  return { title, legend, currency, unitLabel, rows: conSaldo, totals, columns: visibles };
}

/** Cuenta corriente: debe menos haber. */
function armarCuenta({ title, legend, currency, rows, labels }) {
  return armar({
    title, legend, currency, unitLabel: `Importes en ${currency}`, rows, labels,
    columns: LEDGER_COLUMNS,
    suma: ["tons", "debit", "credit"],
    acumula: (r) => r.debit - r.credit,
    dest: "balance",
    siempre: ["date", "driver", "debit", "credit", "balance"],
  });
}

/** Stock: ingresos menos egresos más ajustes, en toneladas. */
function armarStock({ title, legend, rows, labels }) {
  return armar({
    title, legend, currency: "Toneladas", unitLabel: "Toneladas", rows, labels,
    columns: STOCK_COLUMNS,
    suma: ["tin", "tout", "tadj"],
    acumula: (r) => (Number(r.tin) || 0) - (Number(r.tout) || 0) + (Number(r.tadj) || 0),
    dest: "stock",
    siempre: ["date", "oil", "driver", "tin", "tout", "stock"],
  });
}
