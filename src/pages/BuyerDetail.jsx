import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import AccountLedger from "@/components/AccountLedger";
import { useOilData } from "@/hooks/useOilData";
import {
  calcBuyerBalance,
  formatUsd,
  formatTons,
  todayStr,
  adjustmentFields,
} from "@/lib/oilUtils";
import { buyerLedger } from "@/lib/ledger";
import { sheetsClient } from "@/api/sheetsClient";
import { useAuth } from "@/lib/AuthContext";

export default function BuyerDetail() {
  const { id } = useParams();
  const { data, loading, refetch } = useOilData();
  const { isAdmin } = useAuth();
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [ctaAdjustDialog, setCtaAdjustDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);

  if (loading || !data) return <p className="text-muted-foreground">Cargando...</p>;

  const buyer = (data.buyers || []).find((b) => b.id === id);
  if (!buyer) return <p className="text-muted-foreground">Comprador no encontrado</p>;

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

  const ledger = buyerLedger(
    buyer,
    { movements, truckPurchases: directTruckPurchases, directSales, payments },
    data.purchaseAgreements
  );

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
  // Ajuste de cuenta corriente: un asiento con signo, en la moneda de la
  // cuenta y sin conversión. Reemplaza al truco de cargar un pago con las
  // cotizaciones en 1 a 1, o de monto negativo.
  const handleCtaAdjustSubmit = async (values) => {
    await sheetsClient.entities.BuyerPayment.create({
      ...values,
      buyer_id: id,
      kind: "adjustment",
    });
    refetch();
  };

  const handlePaymentSubmit = async (values) => {
    if (editingPayment) {
      await sheetsClient.entities.BuyerPayment.update(editingPayment.id, { ...values, buyer_id: id });
    } else {
      await sheetsClient.entities.BuyerPayment.create({ ...values, buyer_id: id });
    }
    refetch();
  };
  const esPago = (row) => (data.buyerPayments || []).some((x) => x.id === row.id);

  const handleLedgerEdit = (row) => {
    if (!esPago(row)) {
      alert("Las compras, egresos y ventas directas se editan desde sus propias pantallas.");
      return;
    }
    handleEditPayment(data.buyerPayments.find((x) => x.id === row.id));
  };

  const handleLedgerDelete = (row) => {
    if (!esPago(row)) {
      alert("Las compras, egresos y ventas directas se borran desde sus propias pantallas.");
      return;
    }
    if (window.confirm("¿Eliminar este pago?")) handleDeletePayment(row.id);
  };

  const handleDeletePayment = async (paymentId) => {
    await sheetsClient.entities.BuyerPayment.delete(paymentId);
    refetch();
  };

  return (
    <div>
      <Link to="/compradores" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Compradores
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{buyer.name}</h1>
        {buyer.location && <p className="text-sm text-muted-foreground mt-1">{buyer.location}</p>}
        {buyer.notes && <p className="text-sm text-muted-foreground/70 mt-1">{buyer.notes}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Entregado</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatTons(totalDeliveredTons)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Ventas (Debe)</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatUsd(totalCharges)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Pagos (Haber)</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatUsd(totalPayments)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Saldo</p>
          <p
            className={`text-xl font-bold mt-1 ${
              balance > 0.01 ? "text-haber" : balance < -0.01 ? "text-debe" : "text-muted-foreground/70"
            }`}
          >
            {formatUsd(balance)}
          </p>
        </Card>
      </div>

      {isAdmin && (
        <div className="mb-4">
          <Button variant="outline" onClick={handleCreatePayment}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Pago / Saldo Inicial
          </Button>
          <Button variant="outline" onClick={() => setCtaAdjustDialog(true)}>
            <Plus className="w-4 h-4 mr-2" /> Ajuste de Cuenta
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground/70 mb-2">
        Las compras, egresos y ventas directas se cargan desde sus respectivas pantallas. Acá solo se gestionan los pagos.
      </p>

      <AccountLedger
        ledger={ledger}
        onEdit={isAdmin ? handleLedgerEdit : undefined}
        onDelete={isAdmin ? handleLedgerDelete : undefined}
      />

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
      <ResourceFormDialog
        open={ctaAdjustDialog}
        onOpenChange={setCtaAdjustDialog}
        title={`Ajuste de Cuenta Corriente — ${buyer.name}`}
        fields={adjustmentFields("USD Divisa")}
        onSubmit={handleCtaAdjustSubmit}
        submitLabel="Registrar Ajuste"
      />
    </div>
  );
}