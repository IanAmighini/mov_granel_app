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

export const movementTypeLabels = {
  crude_in: "Ingreso Crudo",
  refined_out: "Egreso Refinado",
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

export function getAgreementPartyName(agreement, suppliers, refineries) {
  if (!agreement) return "—";
  const isSale = agreement.agreement_type === "sale_crude" || agreement.agreement_type === "sale_refined" || agreement.party_type === "buyer";
  if (isSale) {
    const buyer = refineries.find((r) => r.id === (agreement.party_id || agreement.supplier_id));
    return buyer?.name || "—";
  }
  const supplier = suppliers.find((s) => s.id === (agreement.party_id || agreement.supplier_id));
  return supplier?.name || "—";
}

export function calcRefineryStock(movements) {
  const byOilType = {};
  for (const m of movements) {
    if (!byOilType[m.oil_type]) byOilType[m.oil_type] = { crudeIn: 0, refinedOut: 0, stock: 0 };
    if (m.movement_type === "crude_in") byOilType[m.oil_type].crudeIn += m.tons || 0;
    if (m.movement_type === "refined_out") byOilType[m.oil_type].refinedOut += m.tons || 0;
  }
  const total = { crudeIn: 0, refinedOut: 0, stock: 0 };
  for (const key of Object.keys(byOilType)) {
    byOilType[key].stock = byOilType[key].crudeIn - byOilType[key].refinedOut;
    total.crudeIn += byOilType[key].crudeIn;
    total.refinedOut += byOilType[key].refinedOut;
  }
  total.stock = total.crudeIn - total.refinedOut;
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
  return (agreements || []).find(
    (a) =>
      a.agreement_type === agreementType &&
      a.status === "open" &&
      a.oil_type === oilType &&
      (a.party_id === partyId || a.supplier_id === partyId)
  );
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