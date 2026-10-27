import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { calcCupo, calcHistorialDeCupo, formatTons, rutaRefineria } from "@/lib/oilUtils";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const camiones = (n) => plural(n, "camión", "camiones");
const retiros = (n) => plural(n, "retiro", "retiros");

/**
 * Cuánto se usó del cupo de retiro del período y cuánto falta.
 *
 * Habla en la unidad del cupo: El Triunfo en toneladas ("60 tn de 150"),
 * Oligra en retiros ("2 de 3 retiros"). La otra unidad va al costado como
 * referencia.
 *
 * En el Dashboard va con el nombre de la refinería (`conNombre`); en la ficha
 * de la refinería, con los períodos anteriores (`conHistorial`), para ver si
 * se viene llegando o no.
 */
export default function CupoRetiro({ refinery, movements, conNombre = false, conHistorial = false }) {
  const c = calcCupo(refinery, movements);
  if (!c) return null;
  const historial = conHistorial ? calcHistorialDeCupo(refinery, movements) : [];

  const quedan = c.diasRestantes === 1 ? "hoy es el último día" : `quedan ${c.diasRestantes} días`;

  let estado;
  if (c.excedido > 0.01) {
    const por = c.enCamiones ? retiros(c.excedido) : formatTons(c.excedido);
    estado = <span className="text-aviso">Cupo cumplido, pasado por {por}</span>;
  } else if (c.falta < 0.01) {
    estado = <span className="text-haber">Cupo cumplido</span>;
  } else {
    const falta = c.enCamiones
      ? `${c.falta === 1 ? "Falta" : "Faltan"} ${retiros(c.falta)} (≈ ${formatTons(c.toneladasFaltan)})`
      : `Faltan ${formatTons(c.falta)} ≈ ${camiones(c.camionesFaltan)}`;
    estado = (
      <span className={c.apurado ? "text-aviso" : "text-muted-foreground"}>
        {falta} · {quedan}
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
        <span className="text-xs text-muted-foreground first-letter:uppercase">{c.periodo}</span>
      </div>

      <div className="flex items-baseline justify-between gap-3 mb-2">
        {c.enCamiones ? (
          <p className="text-lg font-bold text-foreground">
            {c.usado}
            <span className="text-sm font-normal text-muted-foreground"> de {retiros(c.cupo)}</span>
          </p>
        ) : (
          <p className="text-lg font-bold text-foreground">
            {formatTons(c.usado)}
            <span className="text-sm font-normal text-muted-foreground"> de {formatTons(c.cupo)}</span>
          </p>
        )}
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {c.enCamiones ? formatTons(c.toneladas) : camiones(c.camiones)}
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
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {c.tipo === "week" ? "Semanas anteriores" : "Meses anteriores"}
          </p>
          <div className="space-y-1">
            {historial.map((h) => (
              <div key={h.inicio} className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground first-letter:uppercase">{h.periodo}</span>
                <span className="whitespace-nowrap">
                  <span className="text-muted-foreground">
                    {c.enCamiones ? formatTons(h.toneladas) : camiones(h.camiones)} ·{" "}
                  </span>
                  <span className={h.cumplido ? "text-haber font-medium" : "font-medium"}>
                    {c.enCamiones ? retiros(h.camiones) : formatTons(h.toneladas)}
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
