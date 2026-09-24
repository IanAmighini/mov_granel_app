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
  formatDate,
  formatUsd,
  formatArs,
  currencyLabels,
  todayStr,
  rutaComprador,
} from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";
import { useAuth } from "@/lib/AuthContext";

export default function BuyerPayments() {
  const { data, loading, refetch } = useOilData();
  const { isAdmin } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  if (loading || !data) return <p className="text-muted-foreground">Cargando...</p>;

  const payments = [...(data.buyerPayments || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  const fields = [
    { name: "date", label: "Fecha", type: "date", required: true, defaultValue: todayStr() },
    {
      name: "buyer_id",
      label: "Comprador",
      type: "select",
      required: true,
      options: data.buyers.map((b) => ({ value: b.id, label: b.name })),
    },
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
      hint: "Positivo = nos debe, negativo = le debemos.",
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
      await sheetsClient.entities.BuyerPayment.update(editingItem.id, values);
    } else {
      await sheetsClient.entities.BuyerPayment.create(values);
    }
    refetch();
  };

  const handleDelete = async (id) => {
    await sheetsClient.entities.BuyerPayment.delete(id);
    refetch();
  };

  const getBuyer = (buyerId) => data.buyers.find((b) => b.id === buyerId);
  const getBuyerName = (buyerId) => getBuyer(buyerId)?.name || "—";

  return (
    <div>
      <PageHeader
        title="Pagos de Compradores"
        description="Registro de pagos que nos hacen los compradores por el aceite entregado, y saldos iniciales."
        action={
          isAdmin && (
            <Button className="w-full sm:w-auto" onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" /> Nuevo Pago
            </Button>
          )
        }
      />

      <div className="bg-card rounded-xl border border-border overflow-hidden overflow-x-auto">
        <Table className="whitespace-nowrap">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Comprador</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground/70 py-8">
                  No hay pagos registrados
                </TableCell>
              </TableRow>
            ) : (
              payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{formatDate(p.date)}</TableCell>
                  <TableCell className="font-medium">
                    <Link to={rutaComprador(getBuyer(p.buyer_id))} className="hover:text-primary">
                      {getBuyerName(p.buyer_id)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.is_initial_balance
                      ? formatUsd(p.amount)
                      : p.currency === "ars"
                        ? formatArs(p.amount)
                        : formatUsd(p.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.is_initial_balance ? "USD Divisa" : currencyLabels[p.currency]}
                  </TableCell>
                  <TableCell>
                    {p.is_initial_balance ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-aviso/10 text-aviso">
                        Saldo Inicial
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-haber/10 text-haber">
                        Pago
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <DeleteButton onDelete={() => handleDelete(p.id)} label="este pago" />
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
        title={editingItem ? "Editar Pago" : "Nuevo Pago"}
        fields={fields}
        initialValues={editingItem}
        onSubmit={handleSubmit}
        submitLabel={editingItem ? "Guardar" : "Registrar"}
      />
    </div>
  );
}