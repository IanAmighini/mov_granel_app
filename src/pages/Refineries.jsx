import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import DeleteButton from "@/components/DeleteButton";
import PageHeader from "@/components/PageHeader";
import { useOilData } from "@/hooks/useOilData";
import {
  calcRefineryBalance,
  calcRefineryStock,
  formatUsd,
  formatTons,
  pricingTypeLabels,
} from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";

const fields = [
  { name: "name", label: "Nombre", required: true, placeholder: "Nombre de la refinería" },
  { name: "location", label: "Ubicación", placeholder: "Ciudad o zona" },
  {
    name: "pricing_type",
    label: "Tipo de Facturación",
    type: "select",
    required: true,
    defaultValue: "none",
    options: [
      { value: "none", label: "Sin Costo" },
      { value: "ingress_per_ton", label: "Costo por Tn Ingresada" },
      { value: "egress_per_ton", label: "Costo por Tn Egresada" },
      { value: "buyer", label: "Comprador (nos compra)" },
    ],
  },
  {
    name: "processing_cost_per_ton",
    label: "Costo por Tonelada (USD Divisa)",
    type: "number",
    hint: "No aplica para 'Sin Costo' o 'Comprador'.",
  },
  { name: "notes", label: "Notas", type: "textarea" },
];

export default function Refineries() {
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
      await sheetsClient.entities.Refinery.update(editingItem.id, values);
    } else {
      await sheetsClient.entities.Refinery.create(values);
    }
    refetch();
  };

  const handleDelete = async (id) => {
    await sheetsClient.entities.Refinery.delete(id);
    refetch();
  };

  return (
    <div>
      <PageHeader
        title="Refinerías"
        description="Gestión de refinerías, stock y cuentas corrientes"
        action={
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" /> Nueva Refinería
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
                <TableHead>Facturación</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Saldo (USD Divisa)</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.refineries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                    No hay refinerías cargadas
                  </TableCell>
                </TableRow>
              ) : (
                data.refineries.map((r) => {
                  const movements = data.refineryMovements.filter((m) => m.refinery_id === r.id);
                  const payments = data.refineryPayments.filter((p) => p.refinery_id === r.id);
                  const purchases = data.truckPurchases.filter((p) => p.refinery_id === r.id);
                  const stock = calcRefineryStock(movements);
                  const { balance } = calcRefineryBalance(r, movements, payments, purchases);
                  const isBuyer = r.pricing_type === "buyer";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-slate-500">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {pricingTypeLabels[r.pricing_type] || r.pricing_type}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatTons(stock.total.stock)}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          isBuyer
                            ? balance > 0.01 ? "text-emerald-600" : balance < -0.01 ? "text-rose-600" : "text-slate-400"
                            : balance > 0.01 ? "text-rose-600" : balance < -0.01 ? "text-emerald-600" : "text-slate-400"
                        }`}
                      >
                        {formatUsd(balance)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Link to={`/refinerias/${r.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(r)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <DeleteButton onDelete={() => handleDelete(r.id)} label={`la refinería ${r.name}`} />
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
        title={editingItem ? "Editar Refinería" : "Nueva Refinería"}
        fields={fields}
        initialValues={editingItem}
        onSubmit={handleSubmit}
        submitLabel={editingItem ? "Guardar" : "Crear"}
      />
    </div>
  );
}