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
  convertToUsdDivisa,
  formatUsd,
  formatDate,
  currencyLabels,
  todayStr,
} from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";

export default function SupplierPayments() {
  const { data, loading, refetch } = useOilData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  if (loading || !data) return <p className="text-slate-500">Cargando...</p>;

  const fields = [
    { name: "date", label: "Fecha", type: "date", required: true, defaultValue: todayStr() },
    {
      name: "supplier_id",
      label: "Proveedor",
      type: "select",
      required: true,
      options: data.suppliers.map((s) => ({ value: s.id, label: s.name })),
    },
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
      await sheetsClient.entities.SupplierPayment.update(editingItem.id, values);
    } else {
      await sheetsClient.entities.SupplierPayment.create(values);
    }
    refetch();
  };

  const handleDelete = async (id) => {
    await sheetsClient.entities.SupplierPayment.delete(id);
    refetch();
  };

  return (
    <div>
      <PageHeader
        title="Pagos a Proveedores"
        description="Registro de pagos y saldos iniciales con proveedores"
        action={
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Pago
          </Button>
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead className="text-right">USD Divisa</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.supplierPayments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                  No hay pagos registrados
                </TableCell>
              </TableRow>
            ) : (
              data.supplierPayments.map((p) => {
                const supplier = data.suppliers.find((s) => s.id === p.supplier_id);
                const converted = p.is_initial_balance
                  ? p.amount
                  : convertToUsdDivisa(p.amount, p.currency, p.usd_divisa_rate, p.usd_blue_rate);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-slate-500">{formatDate(p.date)}</TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/proveedores/${p.supplier_id}`} className="hover:text-emerald-600">
                        {supplier?.name || "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{p.amount}</TableCell>
                    <TableCell className="text-slate-500">
                      {p.is_initial_balance ? "USD Divisa" : currencyLabels[p.currency]}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${p.is_initial_balance ? "text-amber-600" : "text-emerald-600"}`}>
                      {formatUsd(converted)}
                    </TableCell>
                    <TableCell>
                      {p.is_initial_balance ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                          Saldo Inicial
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                          Pago
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-400 max-w-[200px] truncate">{p.notes || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <DeleteButton onDelete={() => handleDelete(p.id)} label="este pago" />
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
        title={editingItem ? "Editar Pago" : "Nuevo Pago a Proveedor"}
        fields={fields}
        initialValues={editingItem}
        onSubmit={handleSubmit}
        submitLabel={editingItem ? "Guardar" : "Registrar Pago"}
      />
    </div>
  );
}