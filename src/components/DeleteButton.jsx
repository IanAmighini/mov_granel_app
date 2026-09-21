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
      className="text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10"
    >
      <Trash2 className="w-4 h-4" />
    </Button>
  );
}