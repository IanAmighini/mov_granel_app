import React from "react";
import { Link } from "react-router-dom";
import { UserPlus } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function Register() {
  return (
    <AuthLayout
      icon={UserPlus}
      title="Crear cuenta"
      subtitle="El acceso se otorga de forma manual"
    >
      <p className="text-sm text-muted-foreground mb-6">
        Por el momento, las cuentas nuevas las crea el administrador del sistema.
        Contactate con él para que te dé acceso.
      </p>
      <Link to="/login" className="text-primary font-medium hover:underline text-sm">
        Volver a iniciar sesión
      </Link>
    </AuthLayout>
  );
}