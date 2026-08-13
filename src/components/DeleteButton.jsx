import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DeleteButton({ onDelete, label = "este registro" }) {
  const handleDelete = async () => {
    if (window.confirm(`¿Eliminar ${label}?`)) {
      await onDelete();
    }
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
    >
      <Trash2 className="w-4 h-4" />
    </Button>
  );
}