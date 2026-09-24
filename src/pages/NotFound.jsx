import { Link, useLocation } from "react-router-dom";
import { Compass, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Compass className="h-7 w-7 text-muted-foreground" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Esta página no existe
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No encontramos nada en{" "}
          <span className="font-mono text-foreground">{pathname}</span>. Puede
          ser un enlace viejo o un error al escribir la dirección.
        </p>

        <Link to="/" className="mt-8 inline-block">
          <Button>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al inicio
          </Button>
        </Link>
      </div>
    </div>
  );
}
