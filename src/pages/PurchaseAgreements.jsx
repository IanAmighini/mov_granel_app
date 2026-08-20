import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

export default function PurchaseAgreements() {
  const { data, loading, refetch } = useOilData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [activeTab, setActiveTab] = useState("purchase_crude");

  if (loading || !data) return <p className="text-slate-500">Cargando...</p>;

  const buyerRefineries = data.buyers;

  const getFields = (type) => {
    const isPurchase = type === "purchase_crude";
    const partyOptions = isPurchase
      ? data.suppliers.map((s) => ({ value: s.id, label: s.name }))
      : buyerRefineries.map((r) => ({ value: r.id, label: r.name }));

    return [
      { name: "date", label: "Fecha", type: "date", required: true, defaultValue: todayStr() },
      {
        name: "party_id",
        label: isPurchase ? "Proveedor" : "Cliente Comprador",
        type: "select",
        required: true,
        options: partyOptions,
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
  };

  const handleCreate = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleSubmit = async (values) => {
    const type = editingItem?.agreement_type || activeTab;
    const partyType = type === "purchase_crude" ? "supplier" : "buyer";
    const payload = {
      ...values,
      agreement_type: type,
      party_type: partyType,
      supplier_id: partyType === "supplier" ? values.party_id : "",
    };
    if (editingItem) {
      await sheetsClient.entities.PurchaseAgreement.update(editingItem.id, payload);
    } else {
      await sheetsClient.entities.PurchaseAgreement.create({
        ...payload,
        delivered_count: 0,
        status: "open",
      });
    }
    refetch();
  };

  const handleDelete = async (id) => {
    await sheetsClient.entities.PurchaseAgreement.delete(id);
    refetch();
  };

  const sortAgreements = (list) =>
    [...list].sort((a, b) => {
      if (a.status === "open" && b.status !== "open") return -1;
      if (a.status !== "open" && b.status === "open") return 1;
      return new Date(b.date) - new Date(a.date);
    });

  const renderTable = (type) => {
    const agreements = sortAgreements(
      (data.purchaseAgreements || []).filter((a) => (a.agreement_type || "purchase_crude") === type)
    );
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>{type === "purchase_crude" ? "Proveedor" : "Cliente"}</TableHead>
              <TableHead>Aceite</TableHead>
              <TableHead className="text-right">Precio/Tn</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead>Progreso</TableHead>
              <TableHead className="text-right">Pendiente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agreements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-slate-400 py-8">
                  No hay acuerdos cargados
                </TableCell>
              </TableRow>
            ) : (
              agreements.map((a) => {
                const progress = calcAgreementProgress(a);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-slate-500">{formatDate(a.date)}</TableCell>
                    <TableCell className="font-medium">
                      {getAgreementPartyName(a, data.suppliers, data.refineries)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {oilTypeLabels[a.oil_type]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{a.price_per_ton}</TableCell>
                    <TableCell className="text-slate-500">{currencyLabels[a.price_currency]}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[80px]">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {progress.delivered}/{progress.total}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-amber-600">{progress.pending}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {a.status === "open" ? "Vigente" : "Cerrado"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(a)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <DeleteButton onDelete={() => handleDelete(a.id)} label="este acuerdo" />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  const fields = getFields(editingItem?.agreement_type || activeTab);

  return (
    <div>
      <PageHeader
        title="Acuerdos Comerciales"
        description="Acuerdos por cantidad de entregas: compras de crudo, ventas de crudo y ventas de refinado."
        action={
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Acuerdo
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="purchase_crude">Compras de Crudo</TabsTrigger>
          <TabsTrigger value="sale_crude">Ventas de Crudo</TabsTrigger>
          <TabsTrigger value="sale_refined">Ventas de Refinado</TabsTrigger>
        </TabsList>
        <TabsContent value="purchase_crude">{renderTable("purchase_crude")}</TabsContent>
        <TabsContent value="sale_crude">{renderTable("sale_crude")}</TabsContent>
        <TabsContent value="sale_refined">{renderTable("sale_refined")}</TabsContent>
      </Tabs>

      <ResourceFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingItem(null);
        }}
        title={editingItem ? "Editar Acuerdo" : `Nuevo Acuerdo — ${agreementTypeLabels[editingItem?.agreement_type || activeTab]}`}
        fields={fields}
        initialValues={editingItem}
        onSubmit={handleSubmit}
        submitLabel={editingItem ? "Guardar" : "Crear"}
      />
    </div>
  );
}