import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import DeleteButton from "@/components/DeleteButton";
import PageHeader from "@/components/PageHeader";
import { useOilData } from "@/hooks/useOilData";
import {
  calcAgreementProgress,
  getAgreementPartyName,
  formatDate,
  oilTypeLabels,
  currencyLabels,
  agreementTypeLabels,
  todayStr,
} from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";
import { useAuth } from "@/lib/AuthContext";

const TIPOS = ["purchase_crude", "sale_crude", "sale_refined"];

/** En una compra la contraparte es un proveedor; en una venta, un comprador. */
const esCompra = (tipo) => tipo === "purchase_crude";

const campos = (data) => [
  {
    name: "agreement_type",
    label: "Tipo de Acuerdo",
    type: "select",
    required: true,
    defaultValue: "purchase_crude",
    options: TIPOS.map((t) => ({ value: t, label: agreementTypeLabels[t] })),
  },
  {
    name: "party_id",
    label: "Contraparte",
    type: "select",
    required: true,
    options: [],
    // Depende del tipo: por eso se calculan acá y no una vez al armar.
    dynamicOptions: (values) =>
      (esCompra(values.agreement_type) ? data.suppliers : data.buyers)
        .map((x) => ({ value: x.id, label: x.name })),
  },
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
    name: "total_deliveries",
    label: "Entregas Totales",
    type: "number",
    required: true,
    hint: "Número de camiones/entregas acordados.",
  },
  { name: "notes", label: "Notas", type: "textarea" },
];

export default function PurchaseAgreements() {
  const { data, loading, refetch } = useOilData();
  const { isAdmin } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [filtro, setFiltro] = useState(null);   // null = todos

  if (loading || !data) return <p className="text-muted-foreground">Cargando...</p>;

  const todos = [...(data.purchaseAgreements || [])].sort((a, b) => {
    if (a.status === "open" && b.status !== "open") return -1;
    if (a.status !== "open" && b.status === "open") return 1;
    return new Date(b.date) - new Date(a.date);
  });
  const acuerdos = filtro ? todos.filter((a) => (a.agreement_type || "purchase_crude") === filtro) : todos;
  const cuantos = (t) => todos.filter((a) => (a.agreement_type || "purchase_crude") === t).length;

  const handleSubmit = async (values) => {
    const tipo = values.agreement_type || "purchase_crude";
    const payload = {
      ...values,
      agreement_type: tipo,
      party_type: esCompra(tipo) ? "supplier" : "buyer",
    };
    if (editingItem) {
      await sheetsClient.entities.PurchaseAgreement.update(editingItem.id, payload);
    } else {
      // `status` lo calcula la base a partir de las entregas.
      await sheetsClient.entities.PurchaseAgreement.create({ ...payload, delivered_count: 0 });
    }
    refetch();
  };

  const handleDelete = async (id) => {
    await sheetsClient.entities.PurchaseAgreement.delete(id);
    refetch();
  };

  return (
    <div>
      <PageHeader
        title="Acuerdos Comerciales"
        description="Acuerdos por cantidad de entregas: compras de crudo, ventas de crudo y ventas de refinado."
        action={
          isAdmin && (
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setEditingItem(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" /> Nuevo Acuerdo
            </Button>
          )
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <Filtro activo={filtro === null} onClick={() => setFiltro(null)}>
          Todos ({todos.length})
        </Filtro>
        {TIPOS.map((t) => (
          <Filtro key={t} activo={filtro === t} onClick={() => setFiltro(filtro === t ? null : t)}>
            {agreementTypeLabels[t]} ({cuantos(t)})
          </Filtro>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <Table className="whitespace-nowrap">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Contraparte</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Aceite</TableHead>
              <TableHead className="text-right">Precio/Tn</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead>Progreso</TableHead>
              <TableHead className="text-right">Pendiente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {acuerdos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  {filtro ? "No hay acuerdos de este tipo" : "No hay acuerdos cargados"}
                </TableCell>
              </TableRow>
            ) : (
              acuerdos.map((a) => {
                const progreso = calcAgreementProgress(a);
                const tipo = a.agreement_type || "purchase_crude";
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(a.date)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {getAgreementPartyName(a, data.suppliers, data.buyers)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        {agreementTypeLabels[tipo]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-aviso/10 text-aviso">
                        {oilTypeLabels[a.oil_type]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{a.price_per_ton}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {currencyLabels[a.price_currency]}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-[60px]">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${progreso.percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {progreso.delivered}/{progreso.total}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-aviso">
                      {progreso.pending}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.status === "open"
                            ? "bg-haber/10 text-haber"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {a.status === "open" ? "Vigente" : "Cerrado"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingItem(a);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <DeleteButton onDelete={() => handleDelete(a.id)} label="este acuerdo" />
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
        title={editingItem ? "Editar Acuerdo" : "Nuevo Acuerdo"}
        fields={campos(data)}
        initialValues={editingItem}
        onSubmit={handleSubmit}
        submitLabel={editingItem ? "Guardar" : "Crear"}
      />
    </div>
  );
}

function Filtro({ activo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        activo
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
