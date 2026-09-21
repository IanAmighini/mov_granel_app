import { Outlet, NavLink } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Factory,
  Truck,
  Banknote,
  ArrowRightLeft,
  CreditCard,
  Menu,
  X,
  Droplet,
  FileText,
  ShoppingCart,
  Building2,
  Wallet,
  History,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  // Primero las fichas de las tres partes, después las operaciones y al
  // final los pagos de cada una, en el mismo orden que las fichas.
  { to: "/proveedores", label: "Proveedores", icon: Users },
  { to: "/refinerias", label: "Refinerías", icon: Factory },
  { to: "/compradores", label: "Compradores", icon: Building2 },
  { to: "/acuerdos", label: "Acuerdos", icon: FileText },
  { to: "/compras", label: "Compras", icon: Truck },
  { to: "/movimientos-refineria", label: "Egresos de Refinería", icon: ArrowRightLeft },
  { to: "/ventas-directas", label: "Ventas Directas", icon: ShoppingCart },
  { to: "/pagos-proveedores", label: "Pagos a Proveedores", icon: Banknote },
  { to: "/pagos-refinerias", label: "Pagos a Refinerías", icon: CreditCard },
  { to: "/pagos-compradores", label: "Pagos de Compradores", icon: Wallet },
  // No es una operación: es el registro de lo que hicieron las demás.
  { to: "/actividad", label: "Actividad", icon: History, aparte: true },
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* El botón va a la IZQUIERDA: a la derecha se superponía con la barra
          de scroll del teléfono y costaba acertarle. Además el panel sale de
          ese lado, así que el gesto acompaña.
          Área de toque de 44px, que es el mínimo cómodo para un pulgar. */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-sidebar text-sidebar-accent-foreground px-2 py-2 flex items-center gap-1">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileOpen}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent active:bg-sidebar-accent"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <div className="flex items-center gap-2">
          <Droplet className="w-5 h-5 text-sidebar-primary" />
          <span className="font-semibold">Aceitera</span>
        </div>
      </div>

      <aside
        className={`fixed top-0 left-0 z-30 h-full w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary/15 flex items-center justify-center">
            <Droplet className="w-5 h-5 text-sidebar-primary" />
          </div>
          <div>
            <p className="text-sidebar-accent-foreground font-semibold text-sm leading-tight">Aceitera</p>
            <p className="text-sidebar-foreground/50 text-xs">Aceite a Granel</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              // `aparte` separa con una línea lo que no es una operación
              style={item.aparte ? { marginTop: "0.75rem", paddingTop: "0.75rem" } : undefined}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  item.aparte ? "border-t border-sidebar-border rounded-t-none" : ""
                } ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* El ícono en dorado marca dónde estás parado: el color de
                      la marca haciendo trabajo, no decoración. */}
                  <item.icon
                    className={`w-[18px] h-[18px] ${
                      isActive ? "text-sidebar-primary" : ""
                    }`}
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-20" onClick={() => setMobileOpen(false)} />
      )}

      <main className="lg:ml-64 min-h-screen pt-14 lg:pt-0">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}