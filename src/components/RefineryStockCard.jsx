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
      ? "text-haber"
      : balance < -0.01
        ? "text-debe"
        : "text-muted-foreground/70"
    : balance > 0.01
      ? "text-debe"
      : balance < -0.01
        ? "text-haber"
        : "text-muted-foreground/70";

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
        <Link to={`/refinerias/${refinery.id}`} className="font-semibold text-foreground hover:text-primary">
          {refinery.name}
        </Link>
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
          {pricingTypeLabels[refinery.pricing_type]}
        </span>
      </div>

      <div className="space-y-1 mb-3">
        {Object.keys(stock.byOilType).length === 0 ? (
          <p className="text-sm text-muted-foreground/70">Sin stock</p>
        ) : (
          Object.entries(stock.byOilType).map(([key, val]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{oilTypeLabels[key]}</span>
              <span className="font-medium">{formatTons(val.stock)}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex justify-between text-sm pt-2 border-t border-border">
        <span className="font-semibold text-foreground">Total Stock</span>
        <span className="font-bold">{formatTons(stock.total.stock)}</span>
      </div>

      <div className="flex justify-between items-center pt-2 mt-2 border-t border-border">
        <div>
          <span className="text-sm text-muted-foreground">Saldo USD Divisa</span>
          <span className="block text-xs text-muted-foreground/70">{balanceLabel}</span>
        </div>
        <span className={`font-bold ${balanceColor}`}>{formatUsd(balance)}</span>
      </div>
    </Card>
  );
}