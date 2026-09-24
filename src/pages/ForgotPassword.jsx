import React from "react";
import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ForgotPassword() {
  return (
    <AuthLayout
      icon={KeyRound}
      title="¿Olvidaste tu contraseña?"
      subtitle="Recuperación manual"
    >
      <p className="text-sm text-muted-foreground mb-6">
        Por el momento no hay recuperación automática por email. Contactate con
        el administrador del sistema para que te asigne una contraseña nueva.
      </p>
      <Link to="/login" className="text-enlace font-medium hover:underline text-sm">
        Volver a iniciar sesión
      </Link>
    </AuthLayout>
  );
}