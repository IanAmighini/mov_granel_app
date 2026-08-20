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
  formatTons,
  formatDate,
  oilTypeLabels,
  todayStr,
  findMatchingAgreement,
  incrementAgreement,
  decrementAgreement,
} from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";

export default function RefineryMovements() {
  const { data, loading, refetch } = useOilData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  if (loading || !data) return <p className="text-slate-500">Cargando...</p>;

  const fields = [
    { name: "date", label: "Fecha", type: "date", required: true, defaultValue: todayStr() },
    {
      name: "refinery_id",
      label: "Refinería de Origen",
      type: "select",
      required: true,
      options: data.refineries.map((r) => ({ value: r.id, label: r.name })),
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
    { name: "tons", label: "Toneladas", type: "number", required: true, placeholder: "Ej: 28,10" },
    {
      name: "destination",
      label: "Destino (Comprador)",
      type: "select",
      required: true,
      options: data.buyers.map((b) => ({ value: b.id, label: b.name })),
      hint: "Comprador. Para MRT (consumo propio) no genera deuda si no hay acuerdo de venta.",
    },
    {
      name: "sale_price_per_ton",
      label: "Precio de Venta/Tn",
      type: "number",
      hint: "Se autocompleta desde el acuerdo de venta si se deja vacío.",
    },
    {
      name: "usd_divisa_rate",
      label: "Cotización USD Divisa",
      type: "number",
      hint: "ARS por 1 USD divisa. Necesario si el precio del acuerdo está en USD Blue.",
      placeholder: "Ej: 1050",
    },
    {
      name: "usd_blue_rate",
      label: "Cotización USD Blue",
      type: "number",
      hint: "ARS por 1 USD blue. Necesario si el precio del acuerdo está en USD Blue.",
      placeholder: "Ej: 1200",
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
    const saleAgreement = findMatchingAgreement(
      data.purchaseAgreements,
      values.destination,
      values.oil_type,
      "sale_refined"
    );

    const movementData = { ...values, movement_type: "refined_out" };
    if (saleAgreement) {
      movementData.purchase_agreement_id = saleAgreement.id;
      if (!movementData.sale_price_per_ton) {
        movementData.sale_price_per_ton = saleAgreement.price_per_ton;
      }
      movementData.sale_price_currency = saleAgreement.price_currency;
    }

    if (editingItem) {
      const oldAgreementId = editingItem.purchase_agreement_id;
      await sheetsClient.entities.RefineryMovement.update(editingItem.id, movementData);
      if (oldAgreementId && oldAgreementId !== saleAgreement?.id) {
        const oldAgreement = data.purchaseAgreements?.find((a) => a.id === oldAgreementId);
        await decrementAgreement(oldAgreement);
      }
      if (saleAgreement && saleAgreement.id !== oldAgreementId) {
        await incrementAgreement(saleAgreement);
      }
    } else {
      await sheetsClient.entities.RefineryMovement.create(movementData);
      if (saleAgreement) {
        await incrementAgreement(saleAgreement);
      }
    }
    refetch();
  };

  const handleDelete = async (id) => {
    const movement = data.refineryMovements.find((m) => m.id === id);
    await sheetsClient.entities.RefineryMovement.delete(id);
    if (movement?.purchase_agreement_id) {
      const agreement = data.purchaseAgreements?.find((a) => a.id === movement.purchase_agreement_id);
      await decrementAgreement(agreement);
    }
    refetch();
  };

  const egressMovements = data.refineryMovements.filter(
    (m) => m.movement_type === "refined_out" && !m.is_initial_balance && !m.truck_purchase_id
  );

  return (
    <div>
      <PageHeader
        title="Egresos de Refinería"
        description="Retiro de aceite refinado. Descuenta stock de la refinería e imputa en la cuenta del comprador."
        action={
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Egreso
          </Button>
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Refinería</TableHead>
              <TableHead>Aceite</TableHead>
              <TableHead className="text-right">Toneladas</TableHead>
              <TableHead>Ticket</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {egressMovements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                  No hay egresos registrados
                </TableCell>
              </TableRow>
            ) : (
              egressMovements.map((m) => {
                const refinery = data.refineries.find((r) => r.id === m.refinery_id);
                const buyer = data.buyers.find((b) => b.id === m.destination);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-slate-500">{formatDate(m.date)}</TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/refinerias/${m.refinery_id}`} className="hover:text-emerald-600">
                        {refinery?.name || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                        {oilTypeLabels[m.oil_type]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatTons(m.tons)}</TableCell>
                    <TableCell className="text-slate-500">{m.ticket_number || "—"}</TableCell>
                    <TableCell className="text-slate-600">
                      {buyer ? (
                        <Link to={`/compradores/${m.destination}`} className="hover:text-emerald-600">
                          {buyer.name}
                        </Link>
                      ) : (
                        m.destination || "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(m)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <DeleteButton onDelete={() => handleDelete(m.id)} label="este egreso" />
                      </div>
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
        title={editingItem ? "Editar Egreso" : "Nuevo Egreso de Refinería"}
        fields={fields}
        initialValues={editingItem}
        onSubmit={handleSubmit}
        submitLabel={editingItem ? "Guardar" : "Registrar Egreso"}
      />
    </div>
  );
}