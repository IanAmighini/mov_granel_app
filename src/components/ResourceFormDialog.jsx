import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function formatCurrencyDisplay(value) {
  if (value === "" || value === undefined || value === null) return "";
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function parseCurrencyInput(text) {
  if (!text) return "";
  const cleaned = text.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? "" : num;
}

function CurrencyInput({ value, onChange, placeholder }) {
  const [text, setText] = useState(() => formatCurrencyDisplay(value));

  useEffect(() => {
    setText(formatCurrencyDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(parseCurrencyInput(text))}
      placeholder={placeholder}
    />
  );
}

/**
 * Cada campo (`fields`) puede tener, además de lo de siempre:
 * - showIf: (values, context) => boolean   → si devuelve false, el campo no se muestra ni se envía.
 * - required: boolean | (values, context) => boolean   → puede depender de otros campos.
 * - dynamicHint: (values, context) => string | null → texto de ayuda calculado en vivo (reemplaza a `hint` si devuelve algo).
 * - dynamicOptions: (values, context) => [{value, label}] → para selects cuyas opciones dependen de otros campos.
 * - suggestions: (values, context) => string[] → autocompletado para campos de
 *   texto libre. No restringe: sugiere valores ya usados (ej: choferes) para
 *   que no haya que normalizar a mano ni mantener una tabla aparte.
 *
 * `context` es cualquier dato extra que la pantalla quiera pasarle a los campos
 * (ej: la lista de acuerdos vigentes) para poder calcular showIf/required/dynamicHint/dynamicOptions.
 */
export default function ResourceFormDialog({
  open,
  onOpenChange,
  title,
  fields,
  initialValues,
  onSubmit,
  submitLabel = "Guardar",
  context = {},
}) {
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const defaults = {};
      fields.forEach((f) => {
        defaults[f.name] = f.defaultValue ?? (f.type === "checkbox" ? false : "");
      });
      setValues({ ...defaults, ...(initialValues || {}) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setField = (name, value) => setValues((prev) => ({ ...prev, [name]: value }));

  /**
   * Un select cuyas opciones dependen de otro campo puede quedar con un valor
   * que ya no está en la lista: elegir un proveedor y después cambiar el tipo
   * de acuerdo a "venta" deja el id del proveedor guardado mientras la lista
   * muestra compradores. Al guardar eso viaja a la base y la rompe.
   *
   * Cuando el valor deja de ser una opción válida, se limpia.
   */
  useEffect(() => {
    for (const f of fields) {
      if (!f.dynamicOptions) continue;
      const v = values[f.name];
      if (!v) continue;
      const opts = f.dynamicOptions(values, context) || [];
      if (!opts.some((o) => o.value === v)) setField(f.name, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const isNumericType = (type) => type === "number" || type === "currency";
  const isRequired = (f) => (typeof f.required === "function" ? f.required(values, context) : !!f.required);

  const visibleFields = fields.filter((f) => !f.showIf || f.showIf(values, context));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {};
      for (const f of visibleFields) {
        const v = values[f.name];
        if (f.type === "checkbox") {
          payload[f.name] = !!v;
          continue;
        }
        if (v === "" || v === undefined || v === null) {
          if (isRequired(f)) {
            alert(`Completá el campo "${f.label}".`);
            setSubmitting(false);
            return;
          }
        } else {
          payload[f.name] = isNumericType(f.type) ? parseFloat(v) : v;
        }
      }
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      alert(err.message || "Ocurrió un error al guardar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {visibleFields.map((f) => {
            const dynamicHintText = f.dynamicHint ? f.dynamicHint(values, context) : null;

            return f.type === "checkbox" ? (
              <div key={f.name} className="flex items-start space-x-2">
                <Checkbox
                  id={f.name}
                  checked={values[f.name] || false}
                  onCheckedChange={(checked) => setField(f.name, checked)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor={f.name} className="text-sm font-normal cursor-pointer">
                    {f.checkboxLabel || f.label}
                  </Label>
                  {(dynamicHintText || f.hint) && (
                    <p className="text-xs text-muted-foreground/70">{dynamicHintText || f.hint}</p>
                  )}
                </div>
              </div>
            ) : (
              <div key={f.name} className="space-y-1.5">
                <Label>
                  {f.label}
                  {isRequired(f) && <span className="text-destructive"> *</span>}
                </Label>
                {dynamicHintText && (
                  <p className="text-xs font-medium text-haber bg-haber/10 rounded-md px-2 py-1">
                    {dynamicHintText}
                  </p>
                )}
                {f.type === "select" ? (() => {
                  const opts = f.dynamicOptions ? f.dynamicOptions(values, context) : f.options;
                  return (
                    <Select
                      value={values[f.name] || ""}
                      onValueChange={(v) => setField(f.name, v)}
                      disabled={opts?.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            opts?.length === 0
                              ? "No hay opciones disponibles"
                              : f.placeholder || "Seleccionar..."
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {opts?.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                })() : f.type === "textarea" ? (
                  <Textarea
                    value={values[f.name] || ""}
                    onChange={(e) => setField(f.name, e.target.value)}
                    placeholder={f.placeholder}
                  />
                ) : f.type === "currency" ? (
                  <CurrencyInput
                    value={values[f.name]}
                    onChange={(v) => setField(f.name, v)}
                    placeholder={f.placeholder}
                  />
                ) : (() => {
                  const sugerencias = f.suggestions ? f.suggestions(values, context) : null;
                  const listId = sugerencias?.length ? `${f.name}-lista` : undefined;
                  return (
                    <>
                      <Input
                        type={f.type || "text"}
                        step={f.type === "number" ? "0.01" : undefined}
                        value={values[f.name] || ""}
                        onChange={(e) => setField(f.name, e.target.value)}
                        placeholder={f.placeholder}
                        list={listId}
                        autoComplete="off"
                      />
                      {listId && (
                        <datalist id={listId}>
                          {sugerencias.map((s) => (
                            <option key={s} value={s} />
                          ))}
                        </datalist>
                      )}
                    </>
                  );
                })()}
                {!dynamicHintText && f.hint && <p className="text-xs text-muted-foreground/70">{f.hint}</p>}
              </div>
            );
          })}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}