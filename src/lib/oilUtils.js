import { sheetsClient } from "@/api/sheetsClient";

export const oilTypeLabels = {
  soja: "Soja",
  girasol: "Girasol",
  girasol_ao: "Girasol AO",
};

export const currencyLabels = {
  usd_divisa: "USD Divisa",
  usd_blue: "USD Blue",
  usd_billete: "USD Billete",
  ars: "ARS",
};

export const accountCurrencyLabels = {
  usd_divisa: "USD Divisa",
  usd_billete: "USD Billete",
};

export const pricingTypeLabels = {
  none: "Sin Costo",
  ingress_per_ton: "Costo por Tn Ingresada",
  egress_per_ton: "Costo por Tn Egresada",
  buyer: "Comprador",
};

export const agreementTypeLabels = {
  purchase_crude: "Compra de Crudo",
  sale_crude: "Venta de Crudo",
  sale_refined: "Venta de Refinado",
};

export function formatUsd(n) {
  return "USD " + new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

export function formatArs(n) {
  return "$ " + new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

export function formatTons(n) {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) + " Tn";
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function calcNetTons(purchase) {
  const gross = purchase.tons || 0;
  const discount = purchase.discount_percent || 0;
  return gross * (1 - discount / 100);
}

export function convertToUsdDivisa(amount, currency, usd_divisa_rate, usd_blue_rate) {
  if (!amount) return 0;
  switch (currency) {
    case "usd_divisa":
      return amount;
    case "usd_billete":
      if (!usd_divisa_rate || !usd_blue_rate) return 0;
      return amount * (usd_blue_rate / usd_divisa_rate);
    case "ars":
      if (!usd_divisa_rate) return 0;
      return amount / usd_divisa_rate;
    default:
      return amount;
  }
}

/**
 * ¿Hacen falta las dos cotizaciones?
 *
 * Sólo para convertir. "USD Blue" (moneda del precio) y "USD Billete" (moneda
 * de cuenta) son la misma plata con dos nombres: un camión pactado en blue
 * sobre una cuenta en billete pasa tal cual, y pedir cotizaciones ahí obliga a
 * inventar un 1 y 1 de relleno. Al revés —precio en divisa sobre una cuenta en
 * billete— sí hacen falta, y sin ellas el importe da 0.
 *
 * Es la misma regla que aplica el trigger `compra_cotizaciones()` en la base.
 */
export function needsRates(priceCurrency, accountCurrency = "usd_divisa") {
  const enMonedaDeCuenta =
    accountCurrency === "usd_billete"
      ? priceCurrency === "usd_blue"
      : priceCurrency === "usd_divisa";
  return !enMonedaDeCuenta;
}

export function calcTruckPurchaseAmount(purchase, accountCurrency = "usd_divisa") {
  const netTons = calcNetTons(purchase);
  const total = netTons * (purchase.price_per_ton || 0);

  if (accountCurrency === "usd_billete") {
    if (purchase.price_currency === "usd_blue") return total;
    if (purchase.price_currency === "usd_divisa") {
      if (!purchase.usd_divisa_rate || !purchase.usd_blue_rate) return 0;
      return total * (purchase.usd_divisa_rate / purchase.usd_blue_rate);
    }
  } else {
    if (purchase.price_currency === "usd_divisa") return total;
    if (purchase.price_currency === "usd_blue") {
      if (!purchase.usd_divisa_rate || !purchase.usd_blue_rate) return 0;
      return total * (purchase.usd_blue_rate / purchase.usd_divisa_rate);
    }
  }
  return total;
}

export function calcTruckPurchaseUsdDivisa(purchase) {
  return calcTruckPurchaseAmount(purchase, "usd_divisa");
}

export function convertPaymentAmount(amount, currency, usd_divisa_rate, usd_blue_rate, accountCurrency = "usd_divisa") {
  if (!amount) return 0;

  if (accountCurrency === "usd_billete") {
    switch (currency) {
      case "usd_billete":
        return amount;
      case "usd_divisa":
        if (!usd_divisa_rate || !usd_blue_rate) return 0;
        return amount * (usd_divisa_rate / usd_blue_rate);
      case "ars":
        if (!usd_blue_rate) return 0;
        return amount / usd_blue_rate;
      default:
        return amount;
    }
  } else {
    return convertToUsdDivisa(amount, currency, usd_divisa_rate, usd_blue_rate);
  }
}

export function calcTruckPurchaseSaleUsdDivisa(purchase) {
  const netTons = calcNetTons(purchase);
  return netTons * (purchase.sale_price_per_ton || 0);
}

export function calcSupplierBalance(purchases, payments, accountCurrency = "usd_divisa") {
  let totalDebits = purchases.reduce((sum, p) => sum + calcTruckPurchaseAmount(p, accountCurrency), 0);
  let totalCredits = 0;

  for (const p of payments) {
    if (p.is_initial_balance) {
      if ((p.amount || 0) > 0) totalDebits += p.amount;
      else totalCredits += Math.abs(p.amount || 0);
    } else {
      totalCredits += convertPaymentAmount(p.amount, p.currency, p.usd_divisa_rate, p.usd_blue_rate, accountCurrency);
    }
  }

  return { totalPurchases: totalDebits, totalPayments: totalCredits, balance: totalDebits - totalCredits };
}

export function getLatestRateForSupplier(supplierId, purchases, payments) {
  const allTransactions = [
    ...purchases.filter((p) => p.supplier_id === supplierId),
    ...payments.filter((p) => p.supplier_id === supplierId),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  for (const t of allTransactions) {
    // El 1 y 1 de relleno de los asientos viejos no es una cotización: leerlo
    // como tal convertiría el saldo a la par y desfasaría el Dashboard.
    if (t.usd_divisa_rate === 1 && t.usd_blue_rate === 1) continue;
    if (t.usd_divisa_rate && t.usd_blue_rate) {
      return { usd_divisa_rate: t.usd_divisa_rate, usd_blue_rate: t.usd_blue_rate };
    }
  }
  return null;
}

export function convertBetweenCurrencies(amount, fromCurrency, toCurrency, rate) {
  if (fromCurrency === toCurrency) return amount;
  if (!rate || !rate.usd_divisa_rate || !rate.usd_blue_rate) return amount;

  if (fromCurrency === "usd_billete" && toCurrency === "usd_divisa") {
    return amount * (rate.usd_blue_rate / rate.usd_divisa_rate);
  }
  if (fromCurrency === "usd_divisa" && toCurrency === "usd_billete") {
    return amount * (rate.usd_divisa_rate / rate.usd_blue_rate);
  }
  return amount;
}

export function calcRefineryBalance(refinery, movements, payments, purchases, allMovements = [], allAgreements = []) {
  let totalCharges = 0;

  if (refinery.pricing_type === "ingress_per_ton") {
    totalCharges = movements
      .filter((m) => m.movement_type === "crude_in")
      .reduce((sum, m) => sum + (m.gross_tons || m.tons || 0) * (refinery.processing_cost_per_ton || 0), 0);
  } else if (refinery.pricing_type === "egress_per_ton") {
    totalCharges = movements
      .filter((m) => m.movement_type === "refined_out" && !m.is_initial_balance)
      .reduce((sum, m) => sum + (m.tons || 0) * (refinery.processing_cost_per_ton || 0), 0);
  } else if (refinery.pricing_type === "buyer") {
    const refPurchases = (purchases || []).filter((p) => p.refinery_id === refinery.id);
    totalCharges = refPurchases.reduce((sum, p) => sum + calcTruckPurchaseSaleUsdDivisa(p), 0);

    const refinedSales = (allMovements || []).filter(
      (m) => m.movement_type === "refined_out" && !m.is_initial_balance && m.destination === refinery.id
    );
    for (const m of refinedSales) {
      totalCharges += calcRefinedSaleUsdDivisa(m, allAgreements);
    }
  }

  let totalPayments = 0;
  for (const p of payments) {
    if (p.is_initial_balance) {
      if ((p.amount || 0) > 0) totalCharges += p.amount;
      else totalPayments += Math.abs(p.amount || 0);
    } else {
      totalPayments += convertToUsdDivisa(p.amount, p.currency, p.usd_divisa_rate, p.usd_blue_rate);
    }
  }

  return { totalCharges, totalPayments, balance: totalCharges - totalPayments };
}

export function calcRefinedSaleUsdDivisa(movement, allAgreements = []) {
  const tons = movement.tons || 0;
  const agreement = allAgreements.find((a) => a.id === movement.purchase_agreement_id);
  const pricePerTon = movement.sale_price_per_ton || agreement?.price_per_ton || 0;
  const currency = movement.sale_price_currency || agreement?.price_currency || "usd_divisa";
  const total = tons * pricePerTon;
  if (currency === "usd_divisa") return total;
  if (currency === "usd_blue") {
    const divisaRate = movement.usd_divisa_rate;
    const blueRate = movement.usd_blue_rate;
    if (!divisaRate || !blueRate) return total;
    return total * (blueRate / divisaRate);
  }
  return total;
}

export function getAgreementPartyName(agreement, suppliers, buyers) {
  if (!agreement) return "—";
  const isSale = agreement.agreement_type === "sale_crude" || agreement.agreement_type === "sale_refined" || agreement.party_type === "buyer";
  if (isSale) {
    const buyer = (buyers || []).find((b) => b.id === (agreement.party_id || agreement.supplier_id));
    return buyer?.name || "—";
  }
  const supplier = suppliers.find((s) => s.id === (agreement.party_id || agreement.supplier_id));
  return supplier?.name || "—";
}

export function calcRefineryStock(movements) {
  const byOilType = {};
  for (const m of movements) {
    if (!byOilType[m.oil_type]) byOilType[m.oil_type] = { crudeIn: 0, refinedOut: 0, adjustments: 0, stock: 0 };
    if (m.movement_type === "crude_in") byOilType[m.oil_type].crudeIn += m.tons || 0;
    if (m.movement_type === "refined_out") byOilType[m.oil_type].refinedOut += m.tons || 0;
    if (m.movement_type === "adjustment") byOilType[m.oil_type].adjustments += m.tons || 0;
  }
  const total = { crudeIn: 0, refinedOut: 0, adjustments: 0, stock: 0 };
  for (const key of Object.keys(byOilType)) {
    byOilType[key].stock = byOilType[key].crudeIn - byOilType[key].refinedOut + byOilType[key].adjustments;
    total.crudeIn += byOilType[key].crudeIn;
    total.refinedOut += byOilType[key].refinedOut;
    total.adjustments += byOilType[key].adjustments;
  }
  total.stock = total.crudeIn - total.refinedOut + total.adjustments;
  return { byOilType, total };
}

export function calcAgreementProgress(agreement) {
  const delivered = agreement.delivered_count || 0;
  const total = agreement.total_deliveries || 0;
  const pending = Math.max(0, total - delivered);
  const percent = total > 0 ? (delivered / total) * 100 : 0;
  return { delivered, total, pending, percent };
}

export function findMatchingAgreement(agreements, partyId, oilType, agreementType) {
  const matches = (agreements || []).filter(
    (a) =>
      a.agreement_type === agreementType &&
      a.status === "open" &&
      a.oil_type === oilType &&
      (a.party_id === partyId || a.supplier_id === partyId)
  );
  if (matches.length === 0) return undefined;
  return matches.sort((a, b) => new Date(a.date) - new Date(b.date))[0];
}
export async function incrementAgreement(agreement) {
  if (!agreement) return;
  const newCount = (agreement.delivered_count || 0) + 1;
  const newStatus = newCount >= (agreement.total_deliveries || 0) ? "closed" : "open";
  await sheetsClient.entities.PurchaseAgreement.update(agreement.id, {
    delivered_count: newCount,
    status: newStatus,
  });
}

export async function decrementAgreement(agreement) {
  if (!agreement) return;
  const newCount = Math.max(0, (agreement.delivered_count || 0) - 1);
  await sheetsClient.entities.PurchaseAgreement.update(agreement.id, {
    delivered_count: newCount,
    status: "open",
  });
}

export function calcDirectSaleUsdDivisa(sale) {
  const tons = sale.tons || 0;
  const total = tons * (sale.price_per_ton || 0);
  if (sale.price_currency === "usd_divisa") return total;
  if (sale.price_currency === "usd_blue") {
    if (!sale.usd_divisa_rate || !sale.usd_blue_rate) return total;
    return total * (sale.usd_divisa_rate / sale.usd_blue_rate);
  }
  return total;
}

export function calcBuyerBalance(buyer, { movements = [], directSales = [], truckPurchases = [], payments = [] }, allAgreements = []) {
  let totalCharges = 0;
  let totalDeliveredTons = 0;

  for (const m of movements) {
    totalCharges += calcRefinedSaleUsdDivisa(m, allAgreements);
    totalDeliveredTons += m.tons || 0;
  }

  for (const p of truckPurchases) {
    const netTons = calcNetTons(p);
    totalCharges += netTons * (p.sale_price_per_ton || 0);
    totalDeliveredTons += netTons;
  }

  for (const s of directSales) {
    totalCharges += calcDirectSaleUsdDivisa(s);
    totalDeliveredTons += s.tons || 0;
  }

  let totalPayments = 0;
  for (const p of payments) {
    if (p.is_initial_balance) {
      if ((p.amount || 0) > 0) totalCharges += p.amount;
      else totalPayments += Math.abs(p.amount || 0);
    } else {
      totalPayments += convertToUsdDivisa(p.amount, p.currency, p.usd_divisa_rate, p.usd_blue_rate);
    }
  }

  return { totalCharges, totalPayments, balance: totalCharges - totalPayments, totalDeliveredTons };
}
/**
 * Choferes ya cargados, para el autocompletado del campo.
 *
 * Se juntan de las compras y de los egresos de refinado, que son los dos
 * lugares donde se registra. Es texto libre a propósito (conviven "Walter
 * Viera", "Ojeda" y apodos), así que esto no normaliza nada: sólo evita tener
 * que escribir el nombre completo cada vez.
 */
export function driverSuggestions(data) {
  const todos = [
    ...(data?.truckPurchases || []),
    ...(data?.refineryMovements || []),
  ].map((r) => (r.driver || "").trim()).filter(Boolean);
  return [...new Set(todos)].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Campos del ajuste de cuenta corriente.
 *
 * Existe porque pagan contra los kilos de carga y la refinería descarga otros:
 * la diferencia se saldaba cargando un "pago" en billete con las dos
 * cotizaciones forzadas a 1 para que no se convirtiera, o directamente un pago
 * de monto negativo. Funcionaba, pero quedaba registrado como algo que no era,
 * y bastaba con que alguien le corrigiera la cotización para mover el saldo.
 *
 * El monto va en la moneda de la cuenta y no se convierte. Positivo = a favor
 * de MRT (baja lo que debemos), negativo = en contra.
 */
export function adjustmentFields(monedaLabel) {
  return [
    { name: "date", label: "Fecha", type: "date", required: true, defaultValue: todayStr() },
    {
      name: "amount",
      label: `Monto del ajuste (${monedaLabel})`,
      type: "currency",
      required: true,
      hint: "Con signo. Positivo: a favor nuestro, baja el saldo. Negativo: en contra, lo sube.",
      placeholder: "Ej: 150,50  o  -101",
    },
    {
      name: "notes",
      label: "Motivo",
      type: "textarea",
      required: true,
      placeholder: "Ej: diferencia entre kilos de carga y de descarga",
      hint: "Obligatorio: un ajuste sin motivo es imposible de auditar después.",
    },
  ];
}

/**
 * URLS CON NOMBRE EN VEZ DE ID
 *
 * "/proveedores/9d50007d-df41-40db-9f3f-a396448c7d8b" no le dice nada a nadie;
 * "/proveedores/biocedes-sintiolo" sí. El id sigue siendo la clave real en la
 * base: esto es sólo cómo se ve la dirección.
 */
export function slugify(nombre) {
  return String(nombre || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Encuentra el registro por el nombre de la URL, y si no por id.
 *
 * El respaldo por id importa: los enlaces guardados de antes siguen andando, y
 * si alguien renombra un proveedor la dirección vieja deja de resolver por
 * nombre pero la de id sigue.
 */
export function findBySlugOrId(lista, clave) {
  if (!clave) return undefined;
  return (
    (lista || []).find((x) => slugify(x.name) === clave) ||
    (lista || []).find((x) => x.id === clave)
  );
}

/** La dirección de una ficha. Cae al id si el registro no tiene nombre. */
const ruta = (base) => (x) => `/${base}/${x?.name ? slugify(x.name) : x?.id || ""}`;
export const rutaProveedor = ruta("proveedores");
export const rutaRefineria = ruta("refinerias");
export const rutaComprador = ruta("compradores");
