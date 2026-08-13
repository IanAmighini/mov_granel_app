import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import {
  calcRefineryStock,
  calcRefineryBalance,
  formatUsd,
  formatTons,
  oilTypeLabels,
  pricingTypeLabels,
} from "@/lib/oilUtils";

export default function RefineryStockCard({ refinery, movements, payments, purchases, allMovements = [], allAgreements = [] }) {
  const stock = calcRefineryStock(movements);
  const isBuyer = refinery.pricing_type === "buyer";
  const { balance } = calcRefineryBalance(refinery, movements, payments, purchases, allMovements, allAgreements);

  const balanceColor = isBuyer
    ? balance > 0.01
      ? "text-emerald-600"
      : balance < -0.01
        ? "text-rose-600"
        : "text-slate-400"
    : balance > 0.01
      ? "text-rose-600"
      : balance < -0.01
        ? "text-emerald-600"
        : "text-slate-400";

  const balanceLabel = isBuyer
    ? balance > 0.01
      ? "Nos deben"
      : balance < -0.01
        ? "Les debemos"
        : "Saldado"
    : balance > 0.01
      ? "Les debemos"
      : balance < -0.01
        ? "Nos deben"
        : "Saldado";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <Link to={`/refinerias/${refinery.id}`} className="font-semibold text-slate-900 hover:text-emerald-600">
          {refinery.name}
        </Link>
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
          {pricingTypeLabels[refinery.pricing_type]}
        </span>
      </div>

      <div className="space-y-1 mb-3">
        {Object.keys(stock.byOilType).length === 0 ? (
          <p className="text-sm text-slate-400">Sin stock</p>
        ) : (
          Object.entries(stock.byOilType).map(([key, val]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-slate-500">{oilTypeLabels[key]}</span>
              <span className="font-medium">{formatTons(val.stock)}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
        <span className="font-semibold text-slate-700">Total Stock</span>
        <span className="font-bold">{formatTons(stock.total.stock)}</span>
      </div>

      <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-100">
        <div>
          <span className="text-sm text-slate-500">Saldo USD Divisa</span>
          <span className="block text-xs text-slate-400">{balanceLabel}</span>
        </div>
        <span className={`font-bold ${balanceColor}`}>{formatUsd(balance)}</span>
      </div>
    </Card>
  );
}