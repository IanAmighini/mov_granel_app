import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import { useOilData } from "@/hooks/useOilData";
import {
  calcRefineryBalance,
  calcRefineryStock,
  convertToUsdDivisa,
  findMatchingAgreement,
  incrementAgreement,
  decrementAgreement,
  formatUsd,
  formatDate,
  formatTons,
  oilTypeLabels,
  currencyLabels,
  pricingTypeLabels,
  todayStr,
} from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";

export default function RefineryDetail() {
  const { id } = useParams();
  const { data, loading, refetch } = useOilData();
  const [movementDialog, setMovementDialog] = useState(false);
  const [editingMovement, setEditingMovement] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);

  if (loading || !data) return <p className="text-slate-500">Cargando...</p>;

  const refinery = data.refineries.find((r) => r.id === id);
  if (!refinery) return <p className="text-slate-500">Refinería no encontrada</p>;

  const movements = data.refineryMovements.filter((m) => m.refinery_id === id);
  const payments = data.refineryPayments.filter((p) => p.refinery_id === id);
  const purchases = data.truckPurchases.filter((p) => p.refinery_id === id);
  const stock = calcRefineryStock(movements);
  const { totalCharges, totalPayments, balance } = calcRefineryBalance(refinery, movements, payments, purchases);

  const transactions = [
    ...movements.map((m) => {
      let debit = 0;
      let description = "";

      if (m.is_initial_balance) {
        description = `Saldo Inicial — ${oilTypeLabels[m.oil_type]} — ${formatTons(m.tons)}`;
        if (refinery.pricing_type === "ingress_per_ton") {
          debit = (m.gross_tons || m.tons || 0) * (refinery.processing_cost_per_ton || 0);
        }
      } else {
        if (refinery.pricing_type === "ingress_per_ton" && m.movement_type === "crude_in") {
          debit = (m.gross_tons || m.tons || 0) * (refinery.processing_cost_per_ton || 0);
        } else if (refinery.pricing_type === "egress_per_ton" && m.movement_type === "refined_out") {
          debit = (m.tons || 0) * (refinery.processing_cost_per_ton || 0);
        }

        const moveLabel = m.movement_type === "crude_in" ? "Ingreso" : "Egreso";
        const destBuyer = data.buyers?.find((b) => b.id === m.destination);
        const destSuffix = m.destination ? ` → ${destBuyer?.name || m.destination}` : "";
        description = `${moveLabel} — ${oilTypeLabels[m.oil_type]} — ${formatTons(m.tons)}${destSuffix}`;
      }

      return {
        ...m,
        id: m.id,
        date: m.date,
        description,
        debit,
        credit: 0,
        type: "movement",
      };
    }),
    ...payments.map((p) => {
      if (p.is_initial_balance) {
        return {
          id: p.id,
          date: p.date,
          description: "Saldo Inicial",
          debit: (p.amount || 0) > 0 ? p.amount : 0,
          credit: (p.amount || 0) < 0 ? Math.abs(p.amount) : 0,
          type: "payment",
        };
      }
      return {
        id: p.id,
        date: p.date,
        description: `Pago ${currencyLabels[p.currency]} — ${p.amount}`,
        debit: 0,
        credit: convertToUsdDivisa(p.amount, p.currency, p.usd_divisa_rate, p.usd_blue_rate),
        type: "payment",
      };
    }),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let running = 0;
  const withBalance = transactions
    .map((t) => {
      running += t.debit - t.credit;
      return { ...t, runningBalance: running };
    })
    .reverse();

  const movementFields = [
    { name: "date", label: "Fecha", type: "date", required: true, defaultValue: todayStr() },
    {
      name: "oil_type",
      label: "Tipo de Aceite",
      type: "select",
      required: true,
      options: [
        { value: "soja", label: "Soja" },
        { value: "girasol", label: "Girasol" },
        { value: "girasol_ao", label: "Girasol AO" },
      ],
    },
    { name: "tons", label: "Toneladas", type: "number", required: true, placeholder: "Ej: 28,10" },
    {
      name: "destination",
      label: "Destino (Comprador)",
      type: "select",
      options: (data.buyers || []).map((b) => ({ value: b.id, label: b.name })),
      hint: "Comprador. Solo para egresos.",
    },
    {
      name: "sale_price_per_ton",
      label: "Precio de Venta/Tn",
      type: "number",
      hint: "Se autocompleta desde el acuerdo si se deja vacío.",
    },
    {
      name: "usd_divisa_rate",
      label: "Cotización USD Divisa",
      type: "number",
      hint: "ARS por 1 USD divisa. Necesario si el precio está en USD Blue.",
      placeholder: "Ej: 1050",
    },
    {
      name: "usd_blue_rate",
      label: "Cotización USD Blue",
      type: "number",
      hint: "ARS por 1 USD blue. Necesario si el precio está en USD Blue.",
      placeholder: "Ej: 1200",
    },
    {
      name: "is_initial_balance",
      label: "Es saldo inicial",
      type: "checkbox",
      checkboxLabel: "Marcar como saldo inicial de stock",
      hint: "Registra las toneladas iniciales de stock en la refinería.",
    },
    { name: "notes", label: "Notas", type: "textarea" },
  ];

  const paymentFields = [
    { name: "date", label: "Fecha", type: "date", required: true, defaultValue: todayStr() },
    { name: "amount", label: "Monto", type: "number", required: true },
    {
      name: "currency",
      label: "Moneda",
      type: "select",
      required: true,
      options: [
        { value: "usd_billete", label: "USD Billete" },
        { value: "ars", label: "ARS" },
      ],
    },
    {
      name: "usd_divisa_rate",
      label: "Cotización USD Divisa",
      type: "number",
      hint: "ARS por 1 USD divisa. Necesario para conversión.",
      placeholder: "Ej: 1050",
    },
    {
      name: "usd_blue_rate",
      label: "Cotización USD Blue",
      type: "number",
      hint: "ARS por 1 USD blue. Necesario si el pago es en USD Billete.",
      placeholder: "Ej: 1200",
    },
    {
      name: "is_initial_balance",
      label: "Es saldo inicial",
      type: "checkbox",
      checkboxLabel: "Marcar como saldo inicial (USD Divisa)",
      hint: "Para saldos iniciales, el monto se interpreta en USD Divisa. Positivo = debemos, negativo = nos deben.",
    },
    { name: "notes", label: "Notas", type: "textarea" },
  ];

  const handleCreateMovement = () => {
    setEditingMovement(null);
    setMovementDialog(true);
  };

  const handleEditMovement = (item) => {
    setEditingMovement(item);
    setMovementDialog(true);
  };

  const handleMovementSubmit = async (values) => {
    const movementType = values.is_initial_balance ? "crude_in" : "refined_out";
    const movementData = { ...values, movement_type: movementType, refinery_id: id };

    let newAgreementId = null;
    if (!values.is_initial_balance && values.destination) {
      const saleAgreement = findMatchingAgreement(data.purchaseAgreements, values.destination, values.oil_type, "sale_refined");
      if (saleAgreement) {
        newAgreementId = saleAgreement.id;
        movementData.purchase_agreement_id = saleAgreement.id;
        if (!movementData.sale_price_per_ton) {
          movementData.sale_price_per_ton = saleAgreement.price_per_ton;
        }
        movementData.sale_price_currency = saleAgreement.price_currency;
      } else {
        movementData.purchase_agreement_id = "";
      }
    } else {
      movementData.purchase_agreement_id = "";
    }

    if (editingMovement) {
      const oldAgreementId = editingMovement.purchase_agreement_id;
      await sheetsClient.entities.RefineryMovement.update(editingMovement.id, movementData);
      if (oldAgreementId && oldAgreementId !== newAgreementId) {
        const oldAgreement = data.purchaseAgreements?.find((a) => a.id === oldAgreementId);
        await decrementAgreement(oldAgreement);
      }
      if (newAgreementId && newAgreementId !== oldAgreementId) {
        const newAgreement = data.purchaseAgreements?.find((a) => a.id === newAgreementId);
        await incrementAgreement(newAgreement);
      }
    } else {
      await sheetsClient.entities.RefineryMovement.create(movementData);
      if (newAgreementId) {
        const agreement = data.purchaseAgreements?.find((a) => a.id === newAgreementId);
        await incrementAgreement(agreement);
      }
    }
    refetch();
  };

  const handleCreatePayment = () => {
    setEditingPayment(null);
    setPaymentDialog(true);
  };

  const handleEditPayment = (item) => {
    setEditingPayment(item);
    setPaymentDialog(true);
  };

  const handlePaymentSubmit = async (values) => {
    if (editingPayment) {
      await sheetsClient.entities.RefineryPayment.update(editingPayment.id, { ...values, refinery_id: id });
    } else {
      await sheetsClient.entities.RefineryPayment.create({ ...values, refinery_id: id });
    }
    refetch();
  };

  const handleDeleteTransaction = async (t) => {
    if (t.type === "movement") {
      const movement = data.refineryMovements.find((m) => m.id === t.id);
      await sheetsClient.entities.RefineryMovement.delete(t.id);
      if (movement?.purchase_agreement_id) {
        const agreement = data.purchaseAgreements?.find((a) => a.id === movement.purchase_agreement_id);
        await decrementAgreement(agreement);
      }
    } else {
      await sheetsClient.entities.RefineryPayment.delete(t.id);
    }
    refetch();
  };

  return (
    <div>
      <Link to="/refinerias" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Refinerías
      </Link>

      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-900">{refinery.name}</h1>
        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
          {pricingTypeLabels[refinery.pricing_type]}
        </span>
      </div>
      {refinery.location && <p className="text-sm text-slate-500 mb-1">{refinery.location}</p>}
      {refinery.notes && <p className="text-sm text-slate-400">{refinery.notes}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 mt-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Stock por Tipo de Aceite</h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Ingresado</TableHead>
                  <TableHead className="text-right">Egresado</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.keys(stock.byOilType).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-400 py-6">
                      Sin movimientos
                    </TableCell>
                  </TableRow>
                ) : (
                  Object.entries(stock.byOilType).map(([key, val]) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{oilTypeLabels[key]}</TableCell>
                      <TableCell className="text-right text-slate-500">{formatTons(val.crudeIn)}</TableCell>
                      <TableCell className="text-right text-slate-500">{formatTons(val.refinedOut)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatTons(val.stock)}</TableCell>
                    </TableRow>
                  ))
                )}
                <TableRow className="border-t-2 bg-slate-50">
                  <TableCell className="font-bold">Total</TableCell>
                  <TableCell className="text-right font-semibold">{formatTons(stock.total.crudeIn)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatTons(stock.total.refinedOut)}</TableCell>
                  <TableCell className="text-right font-bold">{formatTons(stock.total.stock)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Cuenta Corriente</h2>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-xs text-slate-500">Procesos (Debe)</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatUsd(totalCharges)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">Pagos (Haber)</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatUsd(totalPayments)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">Saldo</p>
              <p
                className={`text-lg font-bold mt-1 ${
                  balance > 0.01 ? "text-rose-600" : balance < -0.01 ? "text-emerald-600" : "text-slate-400"
                }`}
              >
                {formatUsd(balance)}
              </p>
            </Card>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleCreateMovement}>
              <Plus className="w-4 h-4 mr-2" /> Nuevo Egreso / Saldo Inicial
            </Button>
            <Button variant="outline" onClick={handleCreatePayment}>
              <Plus className="w-4 h-4 mr-2" /> Nuevo Pago / Saldo Inicial
            </Button>
          </div>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-3">Movimientos de Cta. Cte.</h2>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Debe (USD Divisa)</TableHead>
              <TableHead className="text-right">Haber (USD Divisa)</TableHead>
              <TableHead className="text-right">Saldo Acum.</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withBalance.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                  Sin movimientos
                </TableCell>
              </TableRow>
            ) : (
              withBalance.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-slate-500">{formatDate(t.date)}</TableCell>
                  <TableCell className="font-medium">{t.description}</TableCell>
                  <TableCell className="text-right text-rose-600">
                    {t.debit > 0 ? formatUsd(t.debit) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-emerald-600">
                    {t.credit > 0 ? formatUsd(t.credit) : "—"}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold ${
                      t.runningBalance > 0.01 ? "text-rose-600" : t.runningBalance < -0.01 ? "text-emerald-600" : "text-slate-400"
                    }`}
                  >
                    {formatUsd(t.runningBalance)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => (t.type === "movement" ? handleEditMovement(t) : handleEditPayment(t))}
                        className="text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTransaction(t)}
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ResourceFormDialog
        open={movementDialog}
        onOpenChange={(open) => {
          setMovementDialog(open);
          if (!open) setEditingMovement(null);
        }}
        title={editingMovement ? "Editar Movimiento" : `Nuevo Egreso / Saldo Inicial — ${refinery.name}`}
        fields={movementFields}
        initialValues={editingMovement}
        onSubmit={handleMovementSubmit}
        submitLabel={editingMovement ? "Guardar" : "Registrar"}
      />
      <ResourceFormDialog
        open={paymentDialog}
        onOpenChange={(open) => {
          setPaymentDialog(open);
          if (!open) setEditingPayment(null);
        }}
        title={editingPayment ? "Editar Pago" : `Nuevo Pago / Saldo Inicial — ${refinery.name}`}
        fields={paymentFields}
        initialValues={editingPayment}
        onSubmit={handlePaymentSubmit}
        submitLabel={editingPayment ? "Guardar" : "Registrar"}
      />
    </div>
  );
}