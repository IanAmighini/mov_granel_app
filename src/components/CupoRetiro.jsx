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

      {historial.length > 0 && <Historial historial={historial} c={c} />}
    </Card>
  );
}

/**
 * Los períodos anteriores, en una tira de barras del más viejo al más nuevo.
 *
 * Antes era una lista de una fila por período: con 8 semanas ocupaba más que
 * el cupo mismo. Las barras van siempre en una línea, de alto fijo; el
 * detalle de cada una queda en el título (al pasar el mouse).
 */
function Historial({ historial, c }) {
  const semanal = c.tipo === "week";
  const cumplidos = historial.filter((h) => h.cumplido).length;
  const barras = [...historial].reverse();
  const lugares = Math.max(historial.length, semanal ? 8 : 6);

  return (
    <div className="mt-4 pt-3 border-t border-border">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-xs font-medium text-muted-foreground">
          {semanal ? `Últimas ${plural(historial.length, "semana", "semanas")}` : `Últimos ${plural(historial.length, "mes", "meses")}`}
        </p>
        <p className="text-xs text-muted-foreground">
          Cumplido en{" "}
          <span className={cumplidos === historial.length ? "text-haber font-medium" : "font-medium text-foreground"}>
            {cumplidos} de {historial.length}
          </span>
        </p>
      </div>

      {/* Lugares fijos (8 semanas o 6 meses), con lo más nuevo a la derecha:
          una refinería con pocos períodos no estira las barras. */}
      <div className="grid items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${lugares}, minmax(0, 1fr))` }}>
        {barras.map((h, i) => {
          const alto = Math.min(100, (h.usado / c.cupo) * 100);
          const valor = c.enCamiones ? h.camiones : Math.round(h.toneladas);
          const detalle = `${h.periodo}: ${formatTons(h.toneladas)} · ${retiros(h.camiones)}`;
          return (
            <div
              key={h.inicio}
              title={detalle}
              className="min-w-0 flex flex-col items-center"
              style={i === 0 ? { gridColumnStart: lugares - barras.length + 1 } : undefined}
            >
              <span className={`text-xs tabular-nums ${h.cumplido ? "text-haber font-medium" : "text-foreground"}`}>
                {valor}
              </span>
              <div className="w-full h-8 bg-muted rounded-sm flex items-end overflow-hidden mt-0.5">
                <div
                  className={`w-full ${h.cumplido ? "bg-haber" : "bg-primary/60"}`}
                  style={{ height: `${Math.max(alto, h.usado > 0 ? 6 : 0)}%` }}
                />
              </div>
              <span className="text-[10px] leading-tight text-muted-foreground mt-1 whitespace-nowrap">
                {semanal ? diaMesDe(h.inicio) : MES_CORTO[Number(h.inicio.slice(5, 7)) - 1]}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-1.5">
        {c.enCamiones ? "Retiros" : "Toneladas"} {semanal ? "de cada semana (empieza el lunes)" : "de cada mes"}.
      </p>
    </div>
  );
}

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaMesDe = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
