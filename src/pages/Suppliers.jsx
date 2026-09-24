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
  calcSupplierBalance,
  formatUsd,
  accountCurrencyLabels,
  rutaProveedor,
} from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";
import { useAuth } from "@/lib/AuthContext";

const fields = [
  { name: "name", label: "Nombre", required: true, placeholder: "Nombre del proveedor" },
  { name: "phone", label: "Teléfono", placeholder: "Teléfono de contacto" },
  {
    name: "account_currency",
    label: "Moneda de Cuenta",
    type: "select",
    required: true,
    defaultValue: "usd_divisa",
    hint: "Moneda en la que se lleva la cuenta corriente.",
    options: [
      { value: "usd_divisa", label: "USD Divisa" },
      { value: "usd_billete", label: "USD Billete" },
    ],
  },
  { name: "notes", label: "Notas", type: "textarea" },
];

export default function Suppliers() {
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
      await sheetsClient.entities.Supplier.update(editingItem.id, values);
    } else {
      await sheetsClient.entities.Supplier.create(values);
    }
    refetch();
  };

  const handleDelete = async (id) => {
    await sheetsClient.entities.Supplier.delete(id);
    refetch();
  };

  return (
    <div>
      <PageHeader
        title="Proveedores"
        description="Gestión de proveedores y cuentas corrientes"
        action={
          isAdmin && (
            <Button className="w-full sm:w-auto" onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" /> Nuevo Proveedor
            </Button>
          )
        }
      />

      {loading || !data ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-x-auto">
          <Table className="whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground/70 py-8">
                    No hay proveedores cargados
                  </TableCell>
                </TableRow>
              ) : (
                data.suppliers.map((s) => {
                  const purchases = data.truckPurchases.filter((p) => p.supplier_id === s.id);
                  const payments = data.supplierPayments.filter((p) => p.supplier_id === s.id);
                  const accountCurrency = s.account_currency || "usd_divisa";
                  const { balance } = calcSupplierBalance(purchases, payments, accountCurrency);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        <Link to={rutaProveedor(s)} className="hover:text-primary">
                          {s.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
                          {accountCurrencyLabels[accountCurrency]}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.phone || "—"}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          balance > 0.01 ? "text-debe" : balance < -0.01 ? "text-haber" : "text-muted-foreground/70"
                        }`}
                      >
                        {formatUsd(balance)}
                      </TableCell>
                      <TableCell>
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(s)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <DeleteButton onDelete={() => handleDelete(s.id)} label={`el proveedor ${s.name}`} />
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
      )}

      <ResourceFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingItem(null);
        }}
        title={editingItem ? "Editar Proveedor" : "Nuevo Proveedor"}
        fields={fields}
        initialValues={editingItem}
        onSubmit={handleSubmit}
        submitLabel={editingItem ? "Guardar" : "Crear"}
      />
    </div>
  );
}