import { Card } from "@/components/ui/card";

export default function StatCard({ label, value, sublabel, icon: Icon, tone = "default" }) {
  const toneClasses = {
    default: "bg-slate-100 text-slate-600",
    red: "bg-rose-50 text-rose-600",
    green: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
  };

  return (
    <Card className="p-5 border-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500 truncate">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 truncate">{value}</p>
          {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
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