import React from "react";
import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  return (
    <AuthLayout
      icon={KeyRound}
      title="Restablecer contraseña"
      subtitle="No disponible por ahora"
    >
      <p className="text-sm text-muted-foreground mb-6">
        Esta función no está disponible. Contactate con el administrador del
        sistema para que te asigne una contraseña nueva.
      </p>
      <Link to="/login" className="text-primary font-medium hover:underline text-sm">
        Volver a iniciar sesión
      </Link>
    </AuthLayout>
  );
}