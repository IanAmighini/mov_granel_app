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

export default function ResourceFormDialog({
  open,
  onOpenChange,
  title,
  fields,
  initialValues,
  onSubmit,
  submitLabel = "Guardar",
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {};
      fields.forEach((f) => {
        const v = values[f.name];
        if (f.type === "checkbox") {
          payload[f.name] = !!v;
        } else if (v === "" || v === undefined || v === null) {
          if (f.required) {
            payload[f.name] = f.type === "number" ? 0 : "";
          }
        } else {
          payload[f.name] = f.type === "number" ? parseFloat(v) : v;
        }
      });
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
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
          {fields.map((f) =>
            f.type === "checkbox" ? (
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
                  {f.hint && <p className="text-xs text-slate-400">{f.hint}</p>}
                </div>
              </div>
            ) : (
              <div key={f.name} className="space-y-1.5">
                <Label>
                  {f.label}
                  {f.required && <span className="text-rose-500"> *</span>}
                </Label>
                {f.type === "select" ? (
                  <Select
                    value={values[f.name] || ""}
                    onValueChange={(v) => setField(f.name, v)}
                    disabled={f.options?.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          f.options?.length === 0
                            ? "No hay opciones disponibles"
                            : f.placeholder || "Seleccionar..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : f.type === "textarea" ? (
                  <Textarea
                    value={values[f.name] || ""}
                    onChange={(e) => setField(f.name, e.target.value)}
                    placeholder={f.placeholder}
                  />
                ) : (
                  <Input
                    type={f.type || "text"}
                    step={f.type === "number" ? "0.01" : undefined}
                    value={values[f.name] || ""}
                    onChange={(e) => setField(f.name, e.target.value)}
                    placeholder={f.placeholder}
                  />
                )}
                {f.hint && <p className="text-xs text-slate-400">{f.hint}</p>}
              </div>
            )
          )}
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