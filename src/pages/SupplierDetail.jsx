import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import AccountLedger from "@/components/AccountLedger";
import { useOilData } from "@/hooks/useOilData";
import {
  calcSupplierBalance,
  formatUsd,
  accountCurrencyLabels,
  todayStr,
  adjustmentFields,
  driverSuggestions,
} from "@/lib/oilUtils";
import { supplierLedger } from "@/lib/ledger";
import { sheetsClient } from "@/api/sheetsClient";
import { useAuth } from "@/lib/AuthContext";

export default function SupplierDetail() {
  const { id } = useParams();
  const { data, loading, refetch } = useOilData();
  const { isAdmin } = useAuth();
  const [purchaseDialog, setPurchaseDialog] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [ctaAdjustDialog, setCtaAdjustDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);

  if (loading || !data) return <p className="text-muted-foreground">Cargando...</p>;

  const supplier = data.suppliers.find((s) => s.id === id);
  if (!supplier) return <p className="text-muted-foreground">Proveedor no encontrado</p>;

  const accountCurrency = supplier.account_currency || "usd_divisa";
  const purchases = data.truckPurchases.filter((p) => p.supplier_id === id);
  const payments = data.supplierPayments.filter((p) => p.supplier_id === id);
  const { totalPurchases, totalPayments, balance } = calcSupplierBalance(purchases, payments, accountCurrency);

  const ledger = supplierLedger(supplier, {
    purchases,
    payments,
    refineries: data.refineries,
    buyers: data.buyers,
  });

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
    { name: "price_per_ton", label: "Precio por Tonelada", type: "currency", required: true },
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
      type: "currency",
      hint: "ARS por 1 USD divisa. Necesario para conversión.",
      placeholder: "Ej: 1050",
    },
    {
      name: "usd_blue_rate",
      label: "Cotización USD Blue",
      type: "currency",
      hint: "ARS por 1 USD blue. Necesario para conversión.",
      placeholder: "Ej: 1200",
    },
    {
      name: "sale_price_per_ton",
      label: "Precio de Venta por Tonelada (USD Divisa)",
      type: "currency",
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
    {
      name: "driver",
      label: "Chofer",
      placeholder: "Ej: Walter Viera",
      hint: "Opcional. Si el camión no lo llevó un chofer nuestro, dejalo vacío.",
      suggestions: (v, ctx) => ctx.drivers || [],
    },
    { name: "ticket_number", label: "N° de Remito/Ticket" },
    { name: "notes", label: "Notas", type: "textarea" },
  ];

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
    {
      name: "usd_divisa_rate",
      label: "Cotización USD Divisa",
      type: "currency",
      hint: "ARS por 1 USD divisa. Necesario para conversión.",
      placeholder: "Ej: 1050",
    },
    {
      name: "usd_blue_rate",
      label: "Cotización USD Blue",
      type: "currency",
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

  // Ajuste de cuenta corriente: un asiento con signo, en la moneda de la
  // cuenta y sin conversión. Reemplaza al truco de cargar un pago con las
  // cotizaciones en 1 a 1, o de monto negativo.
  const handleCtaAdjustSubmit = async (values) => {
    await sheetsClient.entities.SupplierPayment.create({
      ...values,
      supplier_id: id,
      kind: "adjustment",
    });
    refetch();
  };

  const handlePaymentSubmit = async (values) => {
    if (editingPayment) {
      await sheetsClient.entities.SupplierPayment.update(editingPayment.id, { ...values, supplier_id: id });
    } else {
      await sheetsClient.entities.SupplierPayment.create({ ...values, supplier_id: id });
    }
    refetch();
  };

  // El ledger entrega filas de presentación, no registros. Hay que volver al
  // original: si se le pasa la fila al formulario, se abre sin los datos.
  const handleLedgerEdit = (row) => {
    if (row.kind === "purchase") {
      handleEditPurchase(data.truckPurchases.find((x) => x.id === row.id));
    } else {
      handleEditPayment(data.supplierPayments.find((x) => x.id === row.id));
    }
  };

  const handleLedgerDelete = (row) =>
    handleDeleteTransaction({
      id: row.id,
      type: row.kind === "purchase" ? "purchase" : "payment",
    });

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
      <Link to="/proveedores" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Proveedores
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{supplier.name}</h1>
            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-aviso/10 text-aviso border border-aviso/30">
              Cuenta en {currLabel}
            </span>
          </div>
          {supplier.phone && <p className="text-sm text-muted-foreground mt-1">{supplier.phone}</p>}
          {supplier.notes && <p className="text-sm text-muted-foreground/70 mt-1">{supplier.notes}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Compras (Debe)</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatUsd(totalPurchases)}</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">{currLabel}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Pagos (Haber)</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatUsd(totalPayments)}</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">{currLabel}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Saldo</p>
          <p
            className={`text-xl font-bold mt-1 ${
              balance > 0.01 ? "text-debe" : balance < -0.01 ? "text-haber" : "text-muted-foreground/70"
            }`}
          >
            {formatUsd(balance)}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">{currLabel}</p>
        </Card>
      </div>

      {isAdmin && (
        <div className="flex gap-2 mb-4">
          <Button onClick={handleCreatePurchase}>
            <Plus className="w-4 h-4 mr-2" /> Nueva Compra
          </Button>
          <Button variant="outline" onClick={handleCreatePayment}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Pago / Saldo Inicial
          </Button>
          <Button variant="outline" onClick={() => setCtaAdjustDialog(true)}>
            <Plus className="w-4 h-4 mr-2" /> Ajuste de Cuenta
          </Button>
        </div>
      )}

      <AccountLedger
        ledger={ledger}
        onEdit={isAdmin ? handleLedgerEdit : undefined}
        onDelete={isAdmin ? handleLedgerDelete : undefined}
      />

      <ResourceFormDialog
        open={purchaseDialog}
        onOpenChange={(open) => {
          setPurchaseDialog(open);
          if (!open) setEditingPurchase(null);
        }}
        title={editingPurchase ? "Editar Compra" : `Nueva Compra — ${supplier.name}`}
        fields={purchaseFields}
        context={{ drivers: driverSuggestions(data) }}
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
      <ResourceFormDialog
        open={ctaAdjustDialog}
        onOpenChange={setCtaAdjustDialog}
        title={`Ajuste de Cuenta Corriente — ${supplier.name}`}
        fields={adjustmentFields(accountCurrencyLabels[accountCurrency])}
        onSubmit={handleCtaAdjustSubmit}
        submitLabel="Registrar Ajuste"
      />
    </div>
  );
}