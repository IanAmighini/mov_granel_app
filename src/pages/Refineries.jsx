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
  calcRefineryBalance,
  calcRefineryStock,
  formatUsd,
  formatTons,
  pricingTypeLabels,
  rutaRefineria,
} from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";
import { useAuth } from "@/lib/AuthContext";

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
    ],
  },
  {
    name: "processing_cost_per_ton",
    label: "Costo por Tonelada (USD Divisa)",
    type: "currency",
    hint: "No aplica para 'Sin Costo'.",
  },
  {
    name: "monthly_free_tons",
    label: "Cupo Mensual de Retiro (Tn)",
    type: "number",
    placeholder: "Ej: 150",
    hint: "Opcional. Toneladas que se pueden retirar gratis por mes; el Dashboard muestra cuánto falta.",
  },
  { name: "notes", label: "Notas", type: "textarea" },
];

export default function Refineries() {
  const { data, loading, refetch } = useOilData();
  const { isAdmin } = useAuth();
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
      // El formulario no manda los campos vacíos, así que borrar el cupo no
      // llegaría nunca a la base: hay que mandarlo vacío a propósito.
      await sheetsClient.entities.Refinery.update(editingItem.id, {
        monthly_free_tons: null,
        ...values,
      });
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
          isAdmin && (
            <Button className="w-full sm:w-auto" onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" /> Nueva Refinería
            </Button>
          )
        }
      />

      {loading || !data ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden overflow-x-auto">
          <Table className="whitespace-nowrap">
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
                  <TableCell colSpan={5} className="text-center text-muted-foreground/70 py-8">
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
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <Link to={rutaRefineria(r)} className="hover:text-enlace">
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
                          {pricingTypeLabels[r.pricing_type] || r.pricing_type}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatTons(stock.total.stock)}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          balance > 0.01 ? "text-debe" : balance < -0.01 ? "text-haber" : "text-muted-foreground/70"
                        }`}
                      >
                        {formatUsd(balance)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {isAdmin && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(r)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <DeleteButton onDelete={() => handleDelete(r.id)} label={`la refinería ${r.name}`} />
                            </>
                          )}
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