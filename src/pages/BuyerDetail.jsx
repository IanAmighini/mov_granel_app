import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import { useOilData } from "@/hooks/useOilData";
import {
  calcBuyerBalance,
  calcRefinedSaleUsdDivisa,
  calcDirectSaleUsdDivisa,
  calcNetTons,
  convertToUsdDivisa,
  formatUsd,
  formatDate,
  formatTons,
  oilTypeLabels,
  currencyLabels,
  todayStr,
} from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";

export default function BuyerDetail() {
  const { id } = useParams();
  const { data, loading, refetch } = useOilData();
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);

  if (loading || !data) return <p className="text-slate-500">Cargando...</p>;

  const buyer = (data.buyers || []).find((b) => b.id === id);
  if (!buyer) return <p className="text-slate-500">Comprador no encontrado</p>;

  const movements = data.refineryMovements.filter(
    (m) => m.destination === id && m.movement_type === "refined_out" && !m.is_initial_balance
  );
  const directSales = (data.directSales || []).filter((s) => s.buyer_id === id);
  const directTruckPurchases = data.truckPurchases.filter((p) => p.buyer_id === id);
  const payments = (data.buyerPayments || []).filter((p) => p.buyer_id === id);

  const { totalCharges, totalPayments, balance, totalDeliveredTons } = calcBuyerBalance(
    buyer,
    { movements, directSales, truckPurchases: directTruckPurchases, payments },
    data.purchaseAgreements
  );

  const transactions = [
    ...movements.map((m) => {
      const sourceRefinery = data.refineries.find((r) => r.id === m.refinery_id);
      return {
        id: m.id,
        date: m.date,
        description: `Refinado ${oilTypeLabels[m.oil_type]} — ${formatTons(m.tons)} (desde ${sourceRefinery?.name || "—"})`,
        debit: calcRefinedSaleUsdDivisa(m, data.purchaseAgreements),
        credit: 0,
        type: "movement",
      };
    }),
    ...directTruckPurchases.map((p) => ({
      id: p.id,
      date: p.date,
      description: `Compra Directa ${oilTypeLabels[p.oil_type]} — ${formatTons(calcNetTons(p))}`,
      debit: calcNetTons(p) * (p.sale_price_per_ton || 0),
      credit: 0,
      type: "truckPurchase",
    })),
    ...directSales.map((s) => ({
      id: s.id,
      date: s.date,
      description: `Venta Directa ${oilTypeLabels[s.oil_type]} — ${formatTons(s.tons)}`,
      debit: calcDirectSaleUsdDivisa(s),
      credit: 0,
      type: "directSale",
    })),
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

  const paymentFields = [
    { name: "date", label: "Fecha", type: "date", required: true, defaultValue: todayStr() },
    { name: "amount", label: "Monto", type: "currency", required: true },
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
    { name: "usd_divisa_rate", label: "Cotización USD Divisa", type: "currency", hint: "ARS por 1 USD divisa.", placeholder: "Ej: 1050" },
    { name: "usd_blue_rate", label: "Cotización USD Blue", type: "currency", hint: "ARS por 1 USD blue.", placeholder: "Ej: 1200" },
    {
      name: "is_initial_balance",
      label: "Es saldo inicial",
      type: "checkbox",
      checkboxLabel: "Marcar como saldo inicial (USD Divisa)",
      hint: "Positivo = nos debe, negativo = le debemos.",
    },
    { name: "notes", label: "Notas", type: "textarea" },
  ];

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
      await sheetsClient.entities.BuyerPayment.update(editingPayment.id, { ...values, buyer_id: id });
    } else {
      await sheetsClient.entities.BuyerPayment.create({ ...values, buyer_id: id });
    }
    refetch();
  };
  const handleDeletePayment = async (paymentId) => {
    await sheetsClient.entities.BuyerPayment.delete(paymentId);
    refetch();
  };

  return (
    <div>
      <Link to="/compradores" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Compradores
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{buyer.name}</h1>
        {buyer.location && <p className="text-sm text-slate-500 mt-1">{buyer.location}</p>}
        {buyer.notes && <p className="text-sm text-slate-400 mt-1">{buyer.notes}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Total Entregado</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatTons(totalDeliveredTons)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Ventas (Debe)</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatUsd(totalCharges)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Pagos (Haber)</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatUsd(totalPayments)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Saldo</p>
          <p
            className={`text-xl font-bold mt-1 ${
              balance > 0.01 ? "text-emerald-600" : balance < -0.01 ? "text-rose-600" : "text-slate-400"
            }`}
          >
            {formatUsd(balance)}
          </p>
        </Card>
      </div>

      <div className="mb-4">
        <Button variant="outline" onClick={handleCreatePayment}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo Pago / Saldo Inicial
        </Button>
      </div>

      <p className="text-xs text-slate-400 mb-2">
        Las compras, egresos y ventas directas se cargan desde sus respectivas pantallas. Acá solo se gestionan los pagos.
      </p>

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
                <TableRow key={`${t.type}-${t.id}`}>
                  <TableCell className="text-slate-500">{formatDate(t.date)}</TableCell>
                  <TableCell className="font-medium">{t.description}</TableCell>
                  <TableCell className="text-right text-rose-600">{t.debit > 0 ? formatUsd(t.debit) : "—"}</TableCell>
                  <TableCell className="text-right text-emerald-600">{t.credit > 0 ? formatUsd(t.credit) : "—"}</TableCell>
                  <TableCell
                    className={`text-right font-semibold ${
                      t.runningBalance > 0.01 ? "text-emerald-600" : t.runningBalance < -0.01 ? "text-rose-600" : "text-slate-400"
                    }`}
                  >
                    {formatUsd(t.runningBalance)}
                  </TableCell>
                  <TableCell>
                    {t.type === "payment" && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditPayment(t)}
                          className="text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePayment(t.id)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ResourceFormDialog
        open={paymentDialog}
        onOpenChange={(open) => {
          setPaymentDialog(open);
          if (!open) setEditingPayment(null);
        }}
        title={editingPayment ? "Editar Pago" : `Nuevo Pago / Saldo Inicial — ${buyer.name}`}
        fields={paymentFields}
        initialValues={editingPayment}
        onSubmit={handlePaymentSubmit}
        submitLabel={editingPayment ? "Guardar" : "Registrar"}
      />
    </div>
  );
}