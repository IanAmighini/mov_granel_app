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
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplet className="w-5 h-5 text-emerald-400" />
          <span className="font-semibold">Aceitera</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <aside
        className={`fixed top-0 left-0 z-30 h-full w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-slate-800">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <Droplet className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Aceitera</p>
            <p className="text-slate-500 text-xs">Aceite a Granel</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                }`
              }
            >
              <item.icon className="w-[18px] h-[18px]" />
              {item.label}
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