import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import AccountLedger from "@/components/AccountLedger";
import CupoRetiro from "@/components/CupoRetiro";
import { useOilData } from "@/hooks/useOilData";
import {
  calcRefineryBalance,
  calcRefineryStock,
  findMatchingAgreement,
  incrementAgreement,
  decrementAgreement,
  formatUsd,
  formatTons,
  oilTypeLabels,
  pricingTypeLabels,
  todayStr,
  adjustmentFields,
  driverSuggestions,
  findBySlugOrId,
} from "@/lib/oilUtils";
import { refineryLedger, refineryStockLedger } from "@/lib/ledger";
import { sheetsClient } from "@/api/sheetsClient";
import { useAuth } from "@/lib/AuthContext";

export default function RefineryDetail() {
  const { id: slug } = useParams();   // puede ser el nombre o un id viejo
  const { data, loading, refetch } = useOilData();
  const { isAdmin } = useAuth();
  const [movementDialog, setMovementDialog] = useState(false);
  const [editingMovement, setEditingMovement] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [ctaAdjustDialog, setCtaAdjustDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [adjustmentDialog, setAdjustmentDialog] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState(null);

  if (loading || !data) return <p className="text-muted-foreground">Cargando...</p>;

  const refinery = findBySlugOrId(data.refineries, slug);
  if (!refinery) return <p className="text-muted-foreground">Refinería no encontrada</p>;

  // El id real del registro: el resto de la pantalla lo usa para filtrar.
  const id = refinery.id;

  const movements = data.refineryMovements.filter((m) => m.refinery_id === id);
  const payments = data.refineryPayments.filter((p) => p.refinery_id === id);
  const purchases = data.truckPurchases.filter((p) => p.refinery_id === id);
  const stock = calcRefineryStock(movements);
  const { totalCharges, totalPayments, balance } = calcRefineryBalance(refinery, movements, payments, purchases);

  // El origen de un ingreso es el proveedor de la compra que lo generó, así
  // que estos tres hacen falta para resolver la columna Origen - Destino.
  const ctxPartes = {
    suppliers: data.suppliers,
    buyers: data.buyers,
    truckPurchases: data.truckPurchases,
  };
  const ledger = refineryLedger(refinery, { movements, payments, ...ctxPartes });
  const stockLedger = refineryStockLedger(refinery, movements, ctxPartes);

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
      type: "currency",
      hint: "Se autocompleta desde el acuerdo si se deja vacío.",
    },
    {
      name: "usd_divisa_rate",
      label: "Cotización USD Divisa",
      type: "currency",
      hint: "ARS por 1 USD divisa. Necesario si el precio está en USD Blue.",
      placeholder: "Ej: 1050",
    },
    {
      name: "usd_blue_rate",
      label: "Cotización USD Blue",
      type: "currency",
      hint: "ARS por 1 USD blue. Necesario si el precio está en USD Blue.",
      placeholder: "Ej: 1200",
    },
    {
      name: "driver",
      label: "Chofer",
      placeholder: "Ej: Walter Viera",
      hint: "Opcional. Si el camión no lo llevó un chofer nuestro, dejalo vacío.",
      suggestions: (v, ctx) => ctx.drivers || [],
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

  const stockAdjustmentFields = [
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
    {
      name: "tons",
      label: "Toneladas (con signo)",
      type: "number",
      required: true,
      placeholder: "Ej: 2.5 para sumar, -3.1 para restar",
      hint: "Positivo = la refinería nos sumó aceite. Negativo = nos restó.",
    },
    { name: "notes", label: "Motivo / Notas", type: "textarea" },
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

  // Ajuste de cuenta corriente: un asiento con signo, en la moneda de la
  // cuenta y sin conversión. Reemplaza al truco de cargar un pago con las
  // cotizaciones en 1 a 1, o de monto negativo.
  const handleCtaAdjustSubmit = async (values) => {
    await sheetsClient.entities.RefineryPayment.create({
      ...values,
      refinery_id: id,
      kind: "adjustment",
    });
    refetch();
  };

  const handlePaymentSubmit = async (values) => {
    if (editingPayment) {
      await sheetsClient.entities.RefineryPayment.update(editingPayment.id, { ...values, refinery_id: id });
    } else {
      await sheetsClient.entities.RefineryPayment.create({ ...values, refinery_id: id });
    }
    refetch();
  };

  // Volver de la fila del ledger al registro original: pasarle la fila al
  // formulario lo abre sin datos.
  const handleLedgerEdit = (row) => {
    if (row.kind === "payment" || row.kind === "initial" || row.kind === "adjustment") {
      const pago = data.refineryPayments.find((x) => x.id === row.id);
      if (pago) return handleEditPayment(pago);
    }
    const mov = data.refineryMovements.find((x) => x.id === row.id);
    if (mov) handleEditMovement(mov);
  };

  const handleLedgerDelete = (row) => {
    const esMovimiento = data.refineryMovements.some((x) => x.id === row.id);
    handleDeleteTransaction({ id: row.id, type: esMovimiento ? "movement" : "payment" });
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

  const handleCreateAdjustment = () => {
    setEditingAdjustment(null);
    setAdjustmentDialog(true);
  };

  const handleEditAdjustment = (item) => {
    setEditingAdjustment(item);
    setAdjustmentDialog(true);
  };

  const handleAdjustmentSubmit = async (values) => {
    const adjustmentData = { ...values, movement_type: "adjustment", refinery_id: id };
    if (editingAdjustment) {
      await sheetsClient.entities.RefineryMovement.update(editingAdjustment.id, adjustmentData);
    } else {
      await sheetsClient.entities.RefineryMovement.create(adjustmentData);
    }
    refetch();
  };

  const handleStockEdit = (row) => {
    const mov = data.refineryMovements.find((x) => x.id === row.id);
    if (!mov) return;
    if (mov.movement_type === "adjustment") handleEditAdjustment(mov);
    else handleEditMovement(mov);
  };

  const handleStockDelete = (row) => {
    if (!window.confirm("¿Eliminar este movimiento de stock?")) return;
    handleDeleteAdjustment(row.id);   // borra el RefineryMovement, sea del tipo que sea
  };

  const handleDeleteAdjustment = async (adjustmentId) => {
    await sheetsClient.entities.RefineryMovement.delete(adjustmentId);
    refetch();
  };

  return (
    <div>
      <Link to="/refinerias" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Refinerías
      </Link>

      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold text-foreground">{refinery.name}</h1>
        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
          {pricingTypeLabels[refinery.pricing_type]}
        </span>
      </div>
      {refinery.location && <p className="text-sm text-muted-foreground mb-1">{refinery.location}</p>}
      {refinery.notes && <p className="text-sm text-muted-foreground/70">{refinery.notes}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 mt-5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Stock por Tipo de Aceite</h2>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={handleCreateAdjustment}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Ajuste de Stock
              </Button>
            )}
          </div>
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <Table className="whitespace-nowrap">
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Ingresado</TableHead>
                  <TableHead className="text-right">Egresado</TableHead>
                  <TableHead className="text-right">Ajustes</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.keys(stock.byOilType).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground/70 py-6">
                      Sin movimientos
                    </TableCell>
                  </TableRow>
                ) : (
                  Object.entries(stock.byOilType).map(([key, val]) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{oilTypeLabels[key]}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatTons(val.crudeIn)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatTons(val.refinedOut)}</TableCell>
                      <TableCell
                        className={`text-right ${
                          val.adjustments > 0.01 ? "text-haber" : val.adjustments < -0.01 ? "text-debe" : "text-muted-foreground/70"
                        }`}
                      >
                        {val.adjustments === 0 ? "—" : `${val.adjustments > 0 ? "+" : ""}${formatTons(val.adjustments)}`}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatTons(val.stock)}</TableCell>
                    </TableRow>
                  ))
                )}
                <TableRow className="border-t-2 bg-muted">
                  <TableCell className="font-bold">Total</TableCell>
                  <TableCell className="text-right font-semibold">{formatTons(stock.total.crudeIn)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatTons(stock.total.refinedOut)}</TableCell>
                  <TableCell
                    className={`text-right font-semibold ${
                      stock.total.adjustments > 0.01 ? "text-haber" : stock.total.adjustments < -0.01 ? "text-debe" : "text-muted-foreground/70"
                    }`}
                  >
                    {stock.total.adjustments === 0 ? "—" : `${stock.total.adjustments > 0 ? "+" : ""}${formatTons(stock.total.adjustments)}`}
                  </TableCell>
                  <TableCell className="text-right font-bold">{formatTons(stock.total.stock)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {refinery.withdrawal_quota && (
            <div className="mt-4">
              <CupoRetiro refinery={refinery} movements={movements} conHistorial />
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Cuenta Corriente</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Procesos (Debe)</p>
              <p className="text-lg font-bold text-foreground mt-1">{formatUsd(totalCharges)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Pagos (Haber)</p>
              <p className="text-lg font-bold text-foreground mt-1">{formatUsd(totalPayments)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Saldo</p>
              <p
                className={`text-lg font-bold mt-1 ${
                  balance > 0.01 ? "text-debe" : balance < -0.01 ? "text-haber" : "text-muted-foreground/70"
                }`}
              >
                {formatUsd(balance)}
              </p>
            </Card>
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-2 mt-4 sm:flex-row sm:flex-wrap">
              <Button onClick={handleCreateMovement}>
                <Plus className="w-4 h-4 mr-2" /> Nuevo Egreso / Saldo Inicial
              </Button>
              <Button variant="outline" onClick={handleCreatePayment}>
                <Plus className="w-4 h-4 mr-2" /> Nuevo Pago / Saldo Inicial
              </Button>
              <Button variant="outline" onClick={() => setCtaAdjustDialog(true)}>
                <Plus className="w-4 h-4 mr-2" /> Ajuste de Cuenta
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Dos libros separados: el aceite y la plata. Una misma descarga
          aparece en los dos, porque el cargo del fasón se calcula sobre esas
          toneladas, pero son dos historias distintas.

          En pestañas y no una debajo de la otra: apiladas, cuanto más crecía
          el stock más abajo quedaba el saldo de la cuenta corriente. */}
      <Tabs defaultValue="stock">
        <TabsList className="mb-3">
          <TabsTrigger value="stock">Stock de Aceite</TabsTrigger>
          <TabsTrigger value="cuenta">Cuenta Corriente</TabsTrigger>
        </TabsList>
        <TabsContent value="stock">
          <AccountLedger
            ledger={stockLedger}
            heading="Stock de Aceite"
            onEdit={isAdmin ? handleStockEdit : undefined}
            onDelete={isAdmin ? handleStockDelete : undefined}
          />
        </TabsContent>
        <TabsContent value="cuenta">
          <AccountLedger
            ledger={ledger}
            heading="Cuenta Corriente"
            onEdit={isAdmin ? handleLedgerEdit : undefined}
            onDelete={isAdmin ? handleLedgerDelete : undefined}
          />
        </TabsContent>
      </Tabs>

      <ResourceFormDialog
        open={movementDialog}
        onOpenChange={(open) => {
          setMovementDialog(open);
          if (!open) setEditingMovement(null);
        }}
        title={editingMovement ? "Editar Movimiento" : `Nuevo Egreso / Saldo Inicial — ${refinery.name}`}
        fields={movementFields}
        context={{ drivers: driverSuggestions(data) }}
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
      <ResourceFormDialog
        open={adjustmentDialog}
        onOpenChange={(open) => {
          setAdjustmentDialog(open);
          if (!open) setEditingAdjustment(null);
        }}
        title={editingAdjustment ? "Editar Ajuste" : `Nuevo Ajuste de Stock — ${refinery.name}`}
        fields={stockAdjustmentFields}
        initialValues={editingAdjustment}
        onSubmit={handleAdjustmentSubmit}
        submitLabel={editingAdjustment ? "Guardar" : "Registrar Ajuste"}
      />
      <ResourceFormDialog
        open={ctaAdjustDialog}
        onOpenChange={setCtaAdjustDialog}
        title={`Ajuste de Cuenta Corriente — ${refinery.name}`}
        fields={adjustmentFields("USD Divisa")}
        onSubmit={handleCtaAdjustSubmit}
        submitLabel="Registrar Ajuste"
      />
    </div>
  );
}