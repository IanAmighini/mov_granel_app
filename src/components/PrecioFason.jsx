import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import ResourceFormDialog from "@/components/ResourceFormDialog";
import DeleteButton from "@/components/DeleteButton";
import { costoDeFason, formatDate, formatUsd, todayStr } from "@/lib/oilUtils";
import { sheetsClient } from "@/api/sheetsClient";

/**
 * El precio del fasón y sus cambios, del más nuevo al más viejo.
 *
 * Un cambio vale desde su fecha: lo que se descargó o retiró antes se sigue
 * cobrando al precio de antes. El precio "desde el principio" se edita en
 * Refinerías, y cambiarlo ahí sí recalcula todo (es para corregir un error).
 */
export default function PrecioFason({ refinery, isAdmin, onChange }) {
  const [dialog, setDialog] = useState(false);
  const cambios = [...(refinery.cost_changes || [])].sort((a, b) => (a.from < b.from ? 1 : -1));
  const vigente = costoDeFason(refinery, todayStr());
  const queSeCobra = refinery.pricing_type === "ingress_per_ton" ? "las descargas" : "los retiros";

  const guardar = async (cambiosNuevos) => {
    await sheetsClient.entities.Refinery.update(refinery.id, {
      cost_changes: [...cambiosNuevos].sort((a, b) => (a.from < b.from ? -1 : 1)),
    });
    onChange();
  };

  // Un segundo cambio con la misma fecha reemplaza al primero.
  const handleSubmit = (values) =>
    guardar([
      ...cambios.filter((c) => c.from !== values.from),
      { from: values.from, cost: Number(values.cost) },
    ]);

  const filas = [
    ...cambios.map((c) => ({ ...c, desde: `desde el ${formatDate(c.from)}` })),
    { cost: Number(refinery.processing_cost_per_ton) || 0, desde: "desde el principio" },
  ];
  // El vigente es el primero que ya empezó; uno con fecha futura todavía no.
  const hoy = todayStr();
  const iVigente = filas.findIndex((f) => !f.from || f.from <= hoy);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-foreground">Precio del fasón</h2>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setDialog(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Cambiar precio
          </Button>
        )}
      </div>

      <div className="divide-y divide-border">
        {filas.map((f, i) => (
          <div key={f.from || "inicio"} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className={i === iVigente ? "font-semibold text-foreground" : "text-muted-foreground"}>
              {formatUsd(f.cost)} / Tn
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              {i === iVigente && (
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
                  vigente
                </span>
              )}
              {i < iVigente && <span className="text-xs text-aviso">próximo</span>}
              <span className="whitespace-nowrap">{f.desde}</span>
              {isAdmin && f.from && (
                <DeleteButton
                  label={`el cambio de precio del ${formatDate(f.from)} (lo de esa fecha en adelante vuelve al precio anterior)`}
                  onDelete={() => guardar(cambios.filter((c) => c.from !== f.from))}
                />
              )}
            </span>
          </div>
        ))}
      </div>

      <ResourceFormDialog
        open={dialog}
        onOpenChange={setDialog}
        title={`Cambiar precio del fasón — ${refinery.name}`}
        fields={[
          {
            name: "from",
            label: "Desde",
            type: "date",
            required: true,
            defaultValue: todayStr(),
            hint: `${queSeCobra[0].toUpperCase()}${queSeCobra.slice(1)} de esta fecha en adelante se cobran al precio nuevo. Lo anterior no cambia.`,
          },
          {
            name: "cost",
            label: "Precio por Tonelada (USD Divisa)",
            type: "currency",
            required: true,
            hint: `Hoy: ${formatUsd(vigente)} / Tn.`,
          },
        ]}
        onSubmit={handleSubmit}
        submitLabel="Guardar precio"
      />
    </Card>
  );
}
