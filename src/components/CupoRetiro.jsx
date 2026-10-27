import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import {
  calcCupoDelMes,
  calcHistorialDeCupo,
  formatTons,
  nombreDeMes,
  rutaRefineria,
} from "@/lib/oilUtils";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Cuánto se retiró del cupo gratis del mes y cuánto falta.
 *
 * En el Dashboard va sola con el nombre de la refinería (`conNombre`); en la
 * ficha de la refinería va además con los meses anteriores (`conHistorial`),
 * para ver si se viene llegando o no.
 */
export default function CupoRetiro({ refinery, movements, conNombre = false, conHistorial = false }) {
  const c = calcCupoDelMes(refinery, movements);
  if (!c) return null;
  const historial = conHistorial ? calcHistorialDeCupo(refinery, movements) : [];

  // Última semana del mes con cupo pendiente: lo que no se retira se pierde.
  const apurado = c.falta > 0 && c.diasRestantes <= 7;

  let estado;
  if (c.excedido > 0.01) {
    estado = <span className="text-aviso">Cupo cumplido, pasado por {formatTons(c.excedido)}</span>;
  } else if (c.falta < 0.01) {
    estado = <span className="text-haber">Cupo cumplido</span>;
  } else {
    estado = (
      <span className={apurado ? "text-aviso" : "text-muted-foreground"}>
        Faltan {formatTons(c.falta)} ≈ {plural(c.camionesFaltan, "camión", "camiones")} ·{" "}
        {c.diasRestantes === 1 ? "hoy es el último día" : `quedan ${c.diasRestantes} días`}
      </span>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
        {conNombre ? (
          <Link to={rutaRefineria(refinery)} className="font-semibold text-foreground hover:text-enlace">
            {refinery.name}
          </Link>
        ) : (
          <h2 className="text-sm font-semibold text-foreground">Cupo de retiro</h2>
        )}
        <span className="text-xs text-muted-foreground capitalize">{nombreDeMes(c.mes)}</span>
      </div>

      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-lg font-bold text-foreground">
          {formatTons(c.retirado)}
          <span className="text-sm font-normal text-muted-foreground"> de {formatTons(c.cupo)}</span>
        </p>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {plural(c.camiones, "camión", "camiones")}
        </span>
      </div>

      <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full ${c.falta < 0.01 ? "bg-haber" : "bg-primary"}`}
          style={{ width: `${c.percent}%` }}
        />
      </div>

      <p className="text-sm">{estado}</p>

      {historial.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">Meses anteriores</p>
          <div className="space-y-1">
            {historial.map((h) => (
              <div key={h.mes} className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground capitalize">{nombreDeMes(h.mes)}</span>
                <span className="whitespace-nowrap">
                  <span className="text-muted-foreground">{plural(h.camiones, "camión", "camiones")} · </span>
                  <span className={h.percent >= 99.99 ? "text-haber font-medium" : "font-medium"}>
                    {formatTons(h.retirado)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
