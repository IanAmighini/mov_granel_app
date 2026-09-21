import { Card } from "@/components/ui/card";

export default function StatCard({ label, value, sublabel, icon: Icon, tone = "default" }) {
  const toneClasses = {
    default: "bg-muted text-muted-foreground",
    red: "bg-destructive/10 text-debe",
    green: "bg-haber/10 text-haber",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-aviso/10 text-aviso",
  };

  return (
    <Card className="p-5 border-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1 truncate">{value}</p>
          {sublabel && <p className="text-xs text-muted-foreground/70 mt-1">{sublabel}</p>}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-lg shrink-0 ${toneClasses[tone]}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </Card>
  );
}