import { Link } from "react-router-dom";
import { Users, Factory, Warehouse, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatCard from "@/components/StatCard";
import PageHeader from "@/components/PageHeader";
import RefineryStockCard from "@/components/RefineryStockCard";
import { useOilData } from "@/hooks/useOilData";
import {
  calcSupplierBalance,
  calcRefineryBalance,
  calcRefineryStock,
  calcTruckPurchaseUsdDivisa,
  calcNetTons,
  getLatestRateForSupplier,
  convertBetweenCurrencies,
  getAgreementPartyName,
  formatUsd,
  formatTons,
  formatDate,
  oilTypeLabels,
  accountCurrencyLabels,
  currencyLabels,
  agreementTypeLabels,
  calcAgreementProgress,
} from "@/lib/oilUtils";

export default function Dashboard() {
  const { data, loading } = useOilData();

  if (loading || !data) {
    return <p className="text-slate-500">Cargando dashboard...</p>;
  }

  const { suppliers, refineries, truckPurchases, supplierPayments, refineryMovements, refineryPayments } = data;

  let totalSupplierBalanceDivisa = 0;
  suppliers.forEach((s) => {
    const purchases = truckPurchases.filter((p) => p.supplier_id === s.id);
    const payments = supplierPayments.filter((p) => p.supplier_id === s.id);
    const accountCurrency = s.account_currency || "usd_divisa";
    const { balance } = calcSupplierBalance(purchases, payments, accountCurrency);
    if (accountCurrency === "usd_billete") {
      const rate = getLatestRateForSupplier(s.id, purchases, payments);
      totalSupplierBalanceDivisa += convertBetweenCurrencies(balance, "usd_billete", "usd_divisa", rate);
    } else {
      totalSupplierBalanceDivisa += balance;
    }
  });

  let totalRefineryBalance = 0;
  refineries.forEach((r) => {
    const movements = refineryMovements.filter((m) => m.refinery_id === r.id);
    const payments = refineryPayments.filter((p) => p.refinery_id === r.id);
    const purchases = truckPurchases.filter((p) => p.refinery_id === r.id);
    totalRefineryBalance += calcRefineryBalance(r, movements, payments, purchases, refineryMovements, data.purchaseAgreements).balance;
  });

  let totalStock = 0;
  refineries.forEach((r) => {
    const movements = refineryMovements.filter((m) => m.refinery_id === r.id);
    totalStock += calcRefineryStock(movements).total.stock;
  });

  const suppliersWeOwe = suppliers
    .map((s) => {
      const purchases = truckPurchases.filter((p) => p.supplier_id === s.id);
      const payments = supplierPayments.filter((p) => p.supplier_id === s.id);
      const accountCurrency = s.account_currency || "usd_divisa";
      return { ...s, balance: calcSupplierBalance(purchases, payments, accountCurrency).balance, accountCurrency };
    })
    .filter((s) => s.balance > 0.01)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);

  const activeAgreements = (data.purchaseAgreements || []).filter((a) => a.status === "open");

  const recentPurchases = [...truckPurchases]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  return (
    <div>
      <PageHeader title="Dashboard" description="Resumen general de operaciones" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Saldo Total a Proveedores"
          value={formatUsd(totalSupplierBalanceDivisa)}
          sublabel="En USD Divisa"
          icon={Users}
          tone={totalSupplierBalanceDivisa > 0 ? "red" : "green"}
        />
        <StatCard
          label="Saldo con Refinerías"
          value={formatUsd(totalRefineryBalance)}
          sublabel="Neto en USD Divisa"
          icon={Factory}
          tone={totalRefineryBalance > 0 ? "red" : "green"}
        />
        <StatCard
          label="Stock Total en Refinerías"
          value={formatTons(totalStock)}
          sublabel="Toneladas"
          icon={Warehouse}
          tone="amber"
        />
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Proveedores — Los que más debemos</h2>
          <Link to="/proveedores">
            <Button variant="ghost" size="sm">
              Ver todos <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliersWeOwe.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-400 py-6">
                    No hay saldos pendientes
                  </TableCell>
                </TableRow>
              ) : (
                suppliersWeOwe.map((s, idx) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-slate-400 font-medium">{idx + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/proveedores/${s.id}`} className="hover:text-emerald-600">
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs">
                      {accountCurrencyLabels[s.accountCurrency]}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-rose-600">
                      {formatUsd(s.balance)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Acuerdos Vigentes</h2>
          <Link to="/acuerdos">
            <Button variant="ghost" size="sm">
              Ver todos <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
        {activeAgreements.length === 0 ? (
          <p className="text-slate-400 text-center py-6">Sin acuerdos vigentes</p>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contraparte</TableHead>
                  <TableHead>Tipo Acuerdo</TableHead>
                  <TableHead>Aceite</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Progreso</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAgreements.map((a) => {
                  const progress = calcAgreementProgress(a);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {getAgreementPartyName(a, suppliers, refineries)}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {agreementTypeLabels[a.agreement_type || "purchase_crude"]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                          {oilTypeLabels[a.oil_type]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {a.price_per_ton} {currencyLabels[a.price_currency]}
                      </TableCell>
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
                      <TableCell className="text-right font-semibold text-amber-600">
                        {progress.pending}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Stock y Saldo por Refinería</h2>
          <Link to="/refinerias">
            <Button variant="ghost" size="sm">
              Ver todas <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
        {refineries.length === 0 ? (
          <p className="text-slate-400 text-center py-6">Sin refinerías cargadas</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {refineries.map((r) => {
              const movements = refineryMovements.filter((m) => m.refinery_id === r.id);
              const payments = refineryPayments.filter((p) => p.refinery_id === r.id);
              const purchases = truckPurchases.filter((p) => p.refinery_id === r.id);
              return (
                <RefineryStockCard
                  key={r.id}
                  refinery={r}
                  movements={movements}
                  payments={payments}
                  purchases={purchases}
                  allMovements={refineryMovements}
                  allAgreements={data.purchaseAgreements}
                />
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Compras Recientes</h2>
          <Link to="/compras">
            <Button variant="ghost" size="sm">
              Ver todas <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">Total USD Divisa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPurchases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                    Sin compras registradas
                  </TableCell>
                </TableRow>
              ) : (
                recentPurchases.map((p) => {
                  const supplier = suppliers.find((s) => s.id === p.supplier_id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-slate-500">{formatDate(p.date)}</TableCell>
                      <TableCell className="font-medium">{supplier?.name || "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {oilTypeLabels[p.oil_type] || p.oil_type}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{formatTons(calcNetTons(p))}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatUsd(calcTruckPurchaseUsdDivisa(p))}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}