import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import DeleteButton from "@/components/DeleteButton";
import PageHeader from "@/components/PageHeader";
import { useOilData } from "@/hooks/useOilData";
import {
  calcTruckPurchaseUsdDivisa,
  calcNetTons,
  formatUsd,
  formatTons,
  formatDate,
  oilTypeLabels,
  currencyLabels,
  todayStr,
  findMatchingAgreement,
  incrementAgreement,
  decrementAgreement,
} from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";
import { useAuth } from "@/lib/AuthContext";

function getOpenAgreements(agreements, partyId, oilType) {
  return (agreements || []).filter(
    (a) =>
      a.agreement_type === "purchase_crude" &&
      a.status === "open" &&
      a.oil_type === oilType &&
      (a.party_id === partyId || a.supplier_id === partyId)
  );
}

export default function TruckPurchases() {
  const { data, loading, refetch } = useOilData();
  const { isAdmin } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  if (loading || !data) return <p className="text-slate-500">Cargando...</p>;

  const context = {
    suppliers: data.suppliers,
    agreements: data.purchaseAgreements,
  };

  const supplierNeedsRates = (values, ctx) => {
    const supplier = ctx.suppliers.find((s) => s.id === values.supplier_id);
    return values.price_currency === "usd_blue" || supplier?.account_currency === "usd_billete";
  };

  const fields = [
    { name: "date", label: "Fecha", type: "date", required: true, defaultValue: todayStr() },
    {
      name: "supplier_id",
      label: "Proveedor",
      type: "select",
      required: true,
      options: data.suppliers.map((s) => ({ value: s.id, label: s.name })),
    },
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
    {
      name: "price_per_ton",
      label: "Precio por Tonelada",
      type: "currency",
      required: true,
      dynamicHint: (values, ctx) => {
        if (!values.supplier_id || !values.oil_type) return null;
        const matches = getOpenAgreements(ctx.agreements, values.supplier_id, values.oil_type);
        if (matches.length !== 1) return null; // si hay 0 o 2+, no mostramos hint acá (2+ tiene su propio selector abajo)
        const agreement = matches[0];
        const pending = (agreement.total_deliveries || 0) - (agreement.delivered_count || 0);
        return `Acuerdo vigente: ${agreement.price_per_ton} ${agreement.price_currency === "usd_divisa" ? "USD Divisa" : "USD Blue"} — quedan ${pending} entrega${pending === 1 ? "" : "s"}`;
      },
    },
    {
      name: "agreement_id",
      label: "¿A qué acuerdo corresponde?",
      type: "select",
      showIf: (values, ctx) => {
        if (!values.supplier_id || !values.oil_type) return false;
        return getOpenAgreements(ctx.agreements, values.supplier_id, values.oil_type).length >= 2;
      },
      options: [],
      dynamicOptions: (values, ctx) =>
        getOpenAgreements(ctx.agreements, values.supplier_id, values.oil_type).map((a) => ({
          value: a.id,
          label: `${a.price_per_ton} ${a.price_currency === "usd_divisa" ? "USD Divisa" : "USD Blue"} — ${a.delivered_count || 0}/${a.total_deliveries} entregado (${formatDate(a.date)})`,
        })),
      hint: "Este proveedor tiene más de un acuerdo vigente con el mismo aceite. Elegí a cuál corresponde esta compra.",
    },
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
      hint: "ARS por 1 USD divisa.",
      placeholder: "Ej: 1050",
      showIf: supplierNeedsRates,
    },
    {
      name: "usd_blue_rate",
      label: "Cotización USD Blue",
      type: "currency",
      hint: "ARS por 1 USD blue.",
      placeholder: "Ej: 1200",
      showIf: supplierNeedsRates,
    },
    {
      name: "is_direct_sale",
      label: "¿Es venta directa a un Comprador?",
      type: "checkbox",
      checkboxLabel: "Sí, este camión se vende directo (no pasa por una refinería)",
      defaultValue: !!editingItem?.buyer_id,
    },
    {
      name: "refinery_id",
      label: "Refinería de Destino",
      type: "select",
      options: data.refineries.map((r) => ({ value: r.id, label: r.name })),
      showIf: (values) => !values.is_direct_sale,
      required: (values) => !values.is_direct_sale,
    },
    {
      name: "buyer_id",
      label: "Comprador",
      type: "select",
      options: data.buyers.map((b) => ({ value: b.id, label: b.name })),
      showIf: (values) => !!values.is_direct_sale,
      required: (values) => !!values.is_direct_sale,
    },
    {
      name: "sale_price_per_ton",
      label: "Precio de Venta por Tonelada (USD Divisa)",
      type: "currency",
      placeholder: "Ej: 990",
      showIf: (values) => !!values.is_direct_sale,
      required: (values) => !!values.is_direct_sale,
    },
    { name: "ticket_number", label: "N° de Remito/Ticket" },
    { name: "notes", label: "Notas", type: "textarea" },
  ];

  const handleCreate = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleSubmit = async (values) => {
    const isDirectSale = !!values.is_direct_sale;

    if (editingItem) {
      await sheetsClient.entities.TruckPurchase.update(editingItem.id, values);
      const linkedMovement = data.refineryMovements.find((m) => m.truck_purchase_id === editingItem.id);
      if (linkedMovement && !isDirectSale) {
        const netTons = (values.tons || 0) * (1 - (values.discount_percent || 0) / 100);
        await sheetsClient.entities.RefineryMovement.update(linkedMovement.id, {
          date: values.date,
          refinery_id: values.refinery_id,
          oil_type: values.oil_type,
          tons: parseFloat(netTons.toFixed(3)),
          gross_tons: values.tons,
        });
      } else if (linkedMovement && isDirectSale) {
        await sheetsClient.entities.RefineryMovement.delete(linkedMovement.id);
      } else if (!linkedMovement && !isDirectSale) {
        const netTons = (values.tons || 0) * (1 - (values.discount_percent || 0) / 100);
        await sheetsClient.entities.RefineryMovement.create({
          date: values.date,
          refinery_id: values.refinery_id,
          movement_type: "crude_in",
          oil_type: values.oil_type,
          tons: parseFloat(netTons.toFixed(3)),
          gross_tons: values.tons,
          truck_purchase_id: editingItem.id,
          notes: "Auto-generado desde compra",
        });
      }
    } else {
      const purchaseAgreement = values.agreement_id
        ? data.purchaseAgreements.find((a) => a.id === values.agreement_id)
        : findMatchingAgreement(data.purchaseAgreements, values.supplier_id, values.oil_type, "purchase_crude");
      const saleAgreement = isDirectSale
        ? findMatchingAgreement(data.purchaseAgreements, values.buyer_id, values.oil_type, "sale_crude")
        : null;

      const purchaseData = { ...values };
      if (purchaseAgreement) purchaseData.purchase_agreement_id = purchaseAgreement.id;
      if (saleAgreement) purchaseData.sale_agreement_id = saleAgreement.id;

      const purchase = await sheetsClient.entities.TruckPurchase.create(purchaseData);

      if (!isDirectSale) {
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

      await incrementAgreement(purchaseAgreement);
      await incrementAgreement(saleAgreement);
    }
    refetch();
  };

  const handleDelete = async (id) => {
    const purchase = data.truckPurchases.find((p) => p.id === id);
    const linkedMovement = data.refineryMovements.find((m) => m.truck_purchase_id === id);
    if (linkedMovement) {
      await sheetsClient.entities.RefineryMovement.delete(linkedMovement.id);
    }
    await sheetsClient.entities.TruckPurchase.delete(id);
    if (purchase?.purchase_agreement_id) {
      const agreement = data.purchaseAgreements?.find((a) => a.id === purchase.purchase_agreement_id);
      await decrementAgreement(agreement);
    }
    if (purchase?.sale_agreement_id) {
      const agreement = data.purchaseAgreements?.find((a) => a.id === purchase.sale_agreement_id);
      await decrementAgreement(agreement);
    }
    refetch();
  };

  return (
    <div>
      <PageHeader
        title="Compras de Camiones"
        description="Registro de compras de aceite crudo a granel. El ingreso a refinería es automático, salvo venta directa a un Comprador."
        action={
          isAdmin && (
            <Button onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" /> Nueva Compra
            </Button>
          )
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Desc.</TableHead>
              <TableHead className="text-right">Neto</TableHead>
              <TableHead className="text-right">Precio/Tn</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead className="text-right">Total USD Divisa</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.truckPurchases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-slate-400 py-8">
                  No hay compras registradas
                </TableCell>
              </TableRow>
            ) : (
              data.truckPurchases.map((p) => {
                const supplier = data.suppliers.find((s) => s.id === p.supplier_id);
                const refinery = data.refineries.find((r) => r.id === p.refinery_id);
                const buyer = data.buyers.find((b) => b.id === p.buyer_id);
                const agreement = data.purchaseAgreements?.find((a) => a.id === p.purchase_agreement_id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-slate-500">{formatDate(p.date)}</TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/proveedores/${p.supplier_id}`} className="hover:text-emerald-600">
                        {supplier?.name || "—"}
                      </Link>
                      {agreement && (
                        <span className="block text-xs text-emerald-600 font-medium mt-0.5">
                          Acuerdo {agreement.price_per_ton} {currencyLabels[agreement.price_currency]}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {oilTypeLabels[p.oil_type]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{formatTons(p.tons)}</TableCell>
                    <TableCell className="text-right text-slate-500">{p.discount_percent ? `${p.discount_percent}%` : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatTons(calcNetTons(p))}</TableCell>
                    <TableCell className="text-right">{p.price_per_ton}</TableCell>
                    <TableCell className="text-slate-500">{currencyLabels[p.price_currency]}</TableCell>
                    <TableCell className="text-slate-500">
                      {refinery ? (
                        <Link to={`/refinerias/${p.refinery_id}`} className="hover:text-emerald-600">
                          {refinery.name}
                        </Link>
                      ) : buyer ? (
                        <Link to={`/compradores/${p.buyer_id}`} className="hover:text-emerald-600">
                          {buyer.name} <span className="text-xs text-amber-600">(directo)</span>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatUsd(calcTruckPurchaseUsdDivisa(p))}
                    </TableCell>
                    <TableCell>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <DeleteButton onDelete={() => handleDelete(p.id)} label="esta compra" />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ResourceFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingItem(null);
        }}
        title={editingItem ? "Editar Compra" : "Nueva Compra"}
        fields={fields}
        initialValues={editingItem}
        onSubmit={handleSubmit}
        submitLabel={editingItem ? "Guardar" : "Registrar Compra"}
        context={context}
      />
    </div>
  );
}