import React from "react";
import { Droplet } from "lucide-react";

/**
 * Marco de las pantallas de sesión.
 *
 * Dos columnas: a la izquierda la marca sobre el verde oscuro de la barra
 * lateral, a la derecha el formulario. Es el mismo panel que ve después
 * adentro de la app, así que entrar no se siente como cambiar de producto.
 *
 * En pantallas chicas la columna de la marca desaparece y queda un encabezado
 * compacto arriba del formulario.
 */
export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Marca */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground">
        {/* Dos manchas doradas muy tenues: dan profundidad sin dibujar nada. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-[0.12] blur-3xl"
          style={{ background: "hsl(var(--sidebar-primary))" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full opacity-[0.10] blur-3xl"
          style={{ background: "hsl(var(--sidebar-primary))" }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar-primary/15">
            <Droplet className="h-6 w-6 text-sidebar-primary" />
          </div>
          <div>
            <p className="font-semibold leading-tight text-sidebar-accent-foreground">Aceitera</p>
            <p className="text-xs text-sidebar-foreground/70">Aceite a Granel</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight text-sidebar-accent-foreground">
            Del camión a la
            <span className="text-sidebar-primary"> cuenta corriente</span>.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/80">
            Compras, fasón en refinerías y ventas, con el saldo de cada
            proveedor, refinería y comprador siempre al día.
          </p>
        </div>

        <p className="relative text-xs text-sidebar-foreground/50">
          MRT · Movimientos a granel
        </p>
      </aside>

      {/* Formulario */}
      {/* min-h-screen sólo en celular: sin la columna de la izquierda, el
          contenedor no estira y el formulario quedaba pegado arriba con un
          hueco abajo. En escritorio lo estira la grilla. */}
      <main className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:min-h-0 lg:px-12">
        <div className="w-full max-w-sm">
          {/* Marca compacta, sólo cuando no está la columna de la izquierda */}
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Droplet className="h-5 w-5 text-primary" />
            </div>
            <span className="font-semibold text-foreground">Aceitera</span>
          </div>

          <div className="mb-8">
            {Icon && (
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>

          {children}

          {footer && (
            <p className="mt-8 text-sm text-muted-foreground">{footer}</p>
          )}
        </div>
      </main>
    </div>
  );
}
