import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import { useOilData } from "@/hooks/useOilData";
import {
  calcSupplierBalance,
  calcTruckPurchaseAmount,
  calcNetTons,
  convertPaymentAmount,
  formatUsd,
  formatDate,
  formatTons,
  oilTypeLabels,
  currencyLabels,
  accountCurrencyLabels,
  todayStr,
} from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";

export default function SupplierDetail() {
  const { id } = useParams();
  const { data, loading, refetch } = useOilData();
  const [purchaseDialog, setPurchaseDialog] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);

  if (loading || !data) return <p className="text-slate-500">Cargando...</p>;

  const supplier = data.suppliers.find((s) => s.id === id);
  if (!supplier) return <p className="text-slate-500">Proveedor no encontrado</p>;

  const accountCurrency = supplier.account_currency || "usd_divisa";
  const purchases = data.truckPurchases.filter((p) => p.supplier_id === id);
  const payments = data.supplierPayments.filter((p) => p.supplier_id === id);
  const { totalPurchases, totalPayments, balance } = calcSupplierBalance(purchases, payments, accountCurrency);

  const transactions = [
    ...purchases.map((p) => ({
      id: p.id,
      date: p.date,
      description: `Compra ${oilTypeLabels[p.oil_type]} — ${formatTons(calcNetTons(p))}`,
      debit: calcTruckPurchaseAmount(p, accountCurrency),
      credit: 0,
      type: "purchase",
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
        credit: convertPaymentAmount(p.amount, p.currency, p.usd_divisa_rate, p.usd_blue_rate, accountCurrency),
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

  const purchaseFields = [
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
    { name: "tons", label: "Toneladas Brutas", type: "number", required: true, placeholder: "Ej: 30,14" },
    {
      name: "discount_percent",
      label: "Descuento (%)",
      type: "number",
      hint: "Porcentaje de descuento sobre el peso bruto. Ej: 1.5",
      placeholder: "Ej: 1.5",
    },
    { name: "price_per_ton", label: "Precio por Tonelada", type: "number", required: true },
    {
      name: "price_currency",
      label: "Moneda del Precio",
      type: "select",
      required: true,
      options: [
        { value: "usd_divisa", label: "USD Divisa" },
        { value: "usd_blue", label: "USD Blue" },
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
      hint: "ARS por 1 USD blue. Necesario para conversión.",
      placeholder: "Ej: 1200",
    },
    {
      name: "sale_price_per_ton",
      label: "Precio de Venta por Tonelada (USD Divisa)",
      type: "number",
      hint: "Solo para refinerías compradoras (Oligra - Proveedores).",
      placeholder: "Ej: 990",
    },
    {
      name: "refinery_id",
      label: "Refinería de Destino",
      type: "select",
      required: true,
      options: data.refineries.map((r) => ({ value: r.id, label: r.name })),
    },
    { name: "ticket_number", label: "N° de Remito/Ticket" },
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
      hint: "ARS por 1 USD blue. Necesario si el pago es en USD Billete o ARS.",
      placeholder: "Ej: 1200",
    },
    {
      name: "is_initial_balance",
      label: "Es saldo inicial",
      type: "checkbox",
      checkboxLabel: `Marcar como saldo inicial (${accountCurrencyLabels[accountCurrency]})`,
      hint: `Para saldos iniciales, el monto se interpreta en ${accountCurrencyLabels[accountCurrency]}. Positivo = debemos, negativo = nos deben.`,
    },
    { name: "notes", label: "Notas", type: "textarea" },
  ];

  const handleCreatePurchase = () => {
    setEditingPurchase(null);
    setPurchaseDialog(true);
  };

  const handleEditPurchase = (item) => {
    setEditingPurchase(item);
    setPurchaseDialog(true);
  };

  const handlePurchaseSubmit = async (values) => {
    if (editingPurchase) {
      await sheetsClient.entities.TruckPurchase.update(editingPurchase.id, { ...values, supplier_id: id });
      const linkedMovement = data.refineryMovements.find((m) => m.truck_purchase_id === editingPurchase.id);
      if (linkedMovement) {
        const netTons = (values.tons || 0) * (1 - (values.discount_percent || 0) / 100);
        await sheetsClient.entities.RefineryMovement.update(linkedMovement.id, {
          date: values.date,
          refinery_id: values.refinery_id,
          oil_type: values.oil_type,
          tons: parseFloat(netTons.toFixed(3)),
          gross_tons: values.tons,
        });
      }
    } else {
      const purchase = await sheetsClient.entities.TruckPurchase.create({ ...values, supplier_id: id });
      const netTons = (values.tons || 0) * (1 - (values.discount_percent || 0) / 100);
      await sheetsClient.entities.RefineryMovement.create({
        date: values.date,
        refinery_id: values.refinery_id,
        movement_type: "crude_in",
        oil_type: values.oil_type,
        tons: parseFloat(netTons.toFixed(3)),
        gross_tons: values.tons,
        truck_purchase_id: purchase.id,
        notes: "Auto-generado desde compra",
      });
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
      await sheetsClient.entities.SupplierPayment.update(editingPayment.id, { ...values, supplier_id: id });
    } else {
      await sheetsClient.entities.SupplierPayment.create({ ...values, supplier_id: id });
    }
    refetch();
  };

  const handleDeleteTransaction = async (t) => {
    if (t.type === "purchase") {
      const linkedMovement = data.refineryMovements.find((m) => m.truck_purchase_id === t.id);
      if (linkedMovement) {
        await sheetsClient.entities.RefineryMovement.delete(linkedMovement.id);
      }
      await sheetsClient.entities.TruckPurchase.delete(t.id);
    } else {
      await sheetsClient.entities.SupplierPayment.delete(t.id);
    }
    refetch();
  };

  const currLabel = accountCurrencyLabels[accountCurrency];

  return (
    <div>
      <Link to="/proveedores" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Proveedores
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{supplier.name}</h1>
            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
              Cuenta en {currLabel}
            </span>
          </div>
          {supplier.phone && <p className="text-sm text-slate-500 mt-1">{supplier.phone}</p>}
          {supplier.notes && <p className="text-sm text-slate-400 mt-1">{supplier.notes}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Compras (Debe)</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatUsd(totalPurchases)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{currLabel}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Pagos (Haber)</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatUsd(totalPayments)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{currLabel}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Saldo</p>
          <p
            className={`text-xl font-bold mt-1 ${
              balance > 0.01 ? "text-rose-600" : balance < -0.01 ? "text-emerald-600" : "text-slate-400"
            }`}
          >
            {formatUsd(balance)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{currLabel}</p>
        </Card>
      </div>

      <div className="flex gap-2 mb-4">
        <Button onClick={handleCreatePurchase}>
          <Plus className="w-4 h-4 mr-2" /> Nueva Compra
        </Button>
        <Button variant="outline" onClick={handleCreatePayment}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo Pago / Saldo Inicial
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Debe ({currLabel})</TableHead>
              <TableHead className="text-right">Haber ({currLabel})</TableHead>
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
                        onClick={() => (t.type === "purchase" ? handleEditPurchase(t) : handleEditPayment(t))}
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
        open={purchaseDialog}
        onOpenChange={(open) => {
          setPurchaseDialog(open);
          if (!open) setEditingPurchase(null);
        }}
        title={editingPurchase ? "Editar Compra" : `Nueva Compra — ${supplier.name}`}
        fields={purchaseFields}
        initialValues={editingPurchase}
        onSubmit={handlePurchaseSubmit}
        submitLabel={editingPurchase ? "Guardar" : "Registrar Compra"}
      />
      <ResourceFormDialog
        open={paymentDialog}
        onOpenChange={(open) => {
          setPaymentDialog(open);
          if (!open) setEditingPayment(null);
        }}
        title={editingPayment ? "Editar Pago" : `Nuevo Pago / Saldo Inicial — ${supplier.name}`}
        fields={paymentFields}
        initialValues={editingPayment}
        onSubmit={handlePaymentSubmit}
        submitLabel={editingPayment ? "Guardar" : "Registrar"}
      />
    </div>
  );
}