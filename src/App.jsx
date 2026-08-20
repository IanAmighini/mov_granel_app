import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';

// Páginas de autenticación
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

// Páginas de la app
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Suppliers from './pages/Suppliers';
import SupplierDetail from './pages/SupplierDetail';
import Refineries from './pages/Refineries';
import RefineryDetail from './pages/RefineryDetail';
import TruckPurchases from './pages/TruckPurchases';
import SupplierPayments from './pages/SupplierPayments';
import RefineryMovements from './pages/RefineryMovements';
import RefineryPayments from './pages/RefineryPayments';
import PurchaseAgreements from './pages/PurchaseAgreements';
import DirectSales from './pages/DirectSales';
import Buyers from './pages/Buyers';
import BuyerPayments from './pages/BuyerPayments.jsx';
import BuyerDetail from './pages/BuyerDetail';

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Rutas públicas */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Rutas protegidas: requieren login */}
      <Route
        element={
          <ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />
        }
      >
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/proveedores" element={<Suppliers />} />
          <Route path="/proveedores/:id" element={<SupplierDetail />} />
          <Route path="/refinerias" element={<Refineries />} />
          <Route path="/refinerias/:id" element={<RefineryDetail />} />
          <Route path="/compras" element={<TruckPurchases />} />
          <Route path="/pagos-proveedores" element={<SupplierPayments />} />
          <Route path="/movimientos-refineria" element={<RefineryMovements />} />
          <Route path="/pagos-refinerias" element={<RefineryPayments />} />
          <Route path="/acuerdos" element={<PurchaseAgreements />} />
          <Route path="/ventas-directas" element={<DirectSales />} />
          <Route path="/compradores" element={<Buyers />} />
          <Route path="/pagos-compradores" element={<BuyerPayments />} />
          <Route path="/compradores/:id" element={<BuyerDetail />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App