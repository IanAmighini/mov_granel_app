import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import DeleteButton from "@/components/DeleteButton";
import PageHeader from "@/components/PageHeader";
import { useOilData } from "@/hooks/useOilData";
import { calcBuyerBalance, formatUsd, formatTons } from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";

const fields = [
  { name: "name", label: "Nombre", required: true, placeholder: "Nombre del comprador" },
  { name: "location", label: "Ubicación", placeholder: "Ciudad o zona" },
  {
    name: "default_price_currency",
    label: "Moneda de Precio Habitual",
    type: "select",
    options: [
      { value: "usd_divisa", label: "USD Divisa" },
      { value: "usd_blue", label: "USD Blue" },
    ],
    hint: "Solo informativo, para referencia rápida.",
  },
  {
    name: "default_price_per_ton",
    label: "Precio Habitual por Tonelada",
    type: "number",
    hint: "Solo informativo, para referencia rápida.",
  },
  { name: "notes", label: "Notas", type: "textarea" },
];

export default function Buyers() {
  const { data, loading, refetch } = useOilData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

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
      await sheetsClient.entities.Buyer.update(editingItem.id, values);
    } else {
      await sheetsClient.entities.Buyer.create(values);
    }
    refetch();
  };
  const handleDelete = async (id) => {
    await sheetsClient.entities.Buyer.delete(id);
    refetch();
  };

  return (
    <div>
      <PageHeader
        title="Compradores"
        description="Clientes a los que se les vende aceite refinado."
        action={
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Comprador
          </Button>
        }
      />

      {loading || !data ? (
        <p className="text-slate-500">Cargando...</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Total Entregado</TableHead>
                <TableHead className="text-right">Saldo (USD Divisa)</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.buyers || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                    No hay compradores cargados
                  </TableCell>
                </TableRow>
              ) : (
                (data.buyers || []).map((b) => {
                  const movements = data.refineryMovements.filter(
                    (m) => m.destination === b.id && m.movement_type === "refined_out" && !m.is_initial_balance
                  );
                  const directSales = (data.directSales || []).filter((s) => s.buyer_id === b.id);
                  const directTruckPurchases = data.truckPurchases.filter((p) => p.buyer_id === b.id);
                  const payments = (data.buyerPayments || []).filter((p) => p.buyer_id === b.id);
                  const { balance, totalDeliveredTons } = calcBuyerBalance(
                    b,
                    { movements, directSales, truckPurchases: directTruckPurchases, payments },
                    data.purchaseAgreements
                  );
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-right font-semibold">{formatTons(totalDeliveredTons)}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          balance > 0.01 ? "text-emerald-600" : balance < -0.01 ? "text-rose-600" : "text-slate-400"
                        }`}
                      >
                        {formatUsd(balance)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Link to={`/compradores/${b.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(b)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <DeleteButton onDelete={() => handleDelete(b.id)} label={`el comprador ${b.name}`} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ResourceFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingItem(null);
        }}
        title={editingItem ? "Editar Comprador" : "Nuevo Comprador"}
        fields={fields}
        initialValues={editingItem}
        onSubmit={handleSubmit}
        submitLabel={editingItem ? "Guardar" : "Crear"}
      />
    </div>
  );
}