import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import DeleteButton from "@/components/DeleteButton";
import PageHeader from "@/components/PageHeader";
import { useOilData } from "@/hooks/useOilData";
import { formatDate, formatTons, oilTypeLabels, currencyLabels, todayStr } from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";
import { useAuth } from "@/lib/AuthContext";

export default function DirectSales() {
  const { data, loading, refetch } = useOilData();
  const { isAdmin } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  if (loading || !data) return <p className="text-muted-foreground">Cargando...</p>;

  const sales = [...(data.directSales || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  const fields = [
    { name: "date", label: "Fecha", type: "date", required: true, defaultValue: todayStr() },
    {
      name: "origin_refinery_id",
      label: "Origen (de dónde salió)",
      type: "select",
      required: true,
      options: data.refineries.map((r) => ({ value: r.id, label: r.name })),
      hint: "Refinería/proveedor de la que se retiró el camión.",
    },
    {
      name: "buyer_id",
      label: "Comprador",
      type: "select",
      required: true,
      options: data.buyers.map((b) => ({ value: b.id, label: b.name })),
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
    { name: "tons", label: "Toneladas", type: "number", required: true, placeholder: "Ej: 7" },
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
      hint: "ARS por 1 USD divisa.",
      placeholder: "Ej: 1050",
    },
    {
      name: "usd_blue_rate",
      label: "Cotización USD Blue",
      type: "currency",
      hint: "ARS por 1 USD blue.",
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
    if (editingItem) {
      await sheetsClient.entities.DirectSale.update(editingItem.id, values);
    } else {
      await sheetsClient.entities.DirectSale.create(values);
    }
    refetch();
  };

  const handleDelete = async (id) => {
    await sheetsClient.entities.DirectSale.delete(id);
    refetch();
  };

  const getRefineryName = (refId) => data.refineries.find((r) => r.id === refId)?.name || "—";
  const getBuyerName = (buyerId) => data.buyers.find((b) => b.id === buyerId)?.name || "—";

  return (
    <div>
      <PageHeader
        title="Ventas Directas"
        description="Ventas propias de MRT: retiro de un origen y venta directa a un comprador, sin pasar por el stock de una refinería."
        action={
          isAdmin && (
            <Button onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" /> Nueva Venta
            </Button>
          )
        }
      />

      <div className="bg-card rounded-xl border border-border overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Comprador</TableHead>
              <TableHead>Aceite</TableHead>
              <TableHead className="text-right">Toneladas</TableHead>
              <TableHead className="text-right">Precio/Tn</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead>Ticket</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground/70 py-8">
                  No hay ventas directas cargadas
                </TableCell>
              </TableRow>
            ) : (
              sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-muted-foreground">{formatDate(s.date)}</TableCell>
                  <TableCell>{getRefineryName(s.origin_refinery_id)}</TableCell>
                  <TableCell className="font-medium">{getBuyerName(s.buyer_id)}</TableCell>
                  <TableCell>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
                      {oilTypeLabels[s.oil_type]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{formatTons(s.tons)}</TableCell>
                  <TableCell className="text-right">{s.price_per_ton}</TableCell>
                  <TableCell className="text-muted-foreground">{currencyLabels[s.price_currency]}</TableCell>
                  <TableCell className="text-muted-foreground">{s.ticket_number || "—"}</TableCell>
                  <TableCell>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(s)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <DeleteButton onDelete={() => handleDelete(s.id)} label="esta venta" />
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
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingItem(null);
        }}
        title={editingItem ? "Editar Venta Directa" : "Nueva Venta Directa"}
        fields={fields}
        initialValues={editingItem}
        onSubmit={handleSubmit}
        submitLabel={editingItem ? "Guardar" : "Registrar"}
      />
    </div>
  );
}