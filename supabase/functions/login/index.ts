/**
 * LOGIN — Edge Function
 *
 * Es el único lugar que puede leer la tabla `users`: usa la service_role key,
 * que no pasa por RLS. El navegador nunca la ve.
 *
 * Devuelve un JWT firmado con el secreto del proyecto, con dos claims:
 *   role      = "authenticated"  -> es el rol de Postgres al que se le dieron
 *                                   los permisos sobre las 10 tablas.
 *   app_role  = "admin" | "user" -> es lo que leen las políticas de RLS para
 *                                   decidir si además puede escribir.
 *
 * Como el secreto de firma sólo vive acá, el navegador no puede fabricarse un
 * token que diga "admin". Eso es lo que hace que el rol sea inviolable, a
 * diferencia del control anterior, que sólo escondía botones.
 *
 * Secretos que necesita (Edge Functions -> Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (los pone Supabase solo)
 *   APP_JWT_SECRET                            (Settings -> API -> JWT Secret)
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
// bcryptjs (JS puro) en vez de deno.land/x/bcrypt: esa levanta un Web Worker
// y es poco confiable adentro de una Edge Function.
import bcrypt from "npm:bcryptjs@2.4.3";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const HORAS_DE_SESION = 8;

// Freno al login. Cinco intentos fallidos en la ventana y la cuenta queda
// bloqueada hasta que esos intentos salgan de ella.
//
// El bloqueo es por mail, no por IP: son dos usuarios conocidos y una IP
// cambia sola. Tiene un costo — alguien que sepa el mail puede dejar afuera
// al dueño 15 minutos — y por eso la ventana es corta y no crece.
const MAX_INTENTOS = 5;
const VENTANA_MINUTOS = 15;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return json({ success: false, error: "Faltan email y contraseña" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const desde = new Date(Date.now() - VENTANA_MINUTOS * 60_000).toISOString();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    const { data: fallidos } = await admin
      .from("login_attempts")
      .select("at")
      .ilike("email", email)
      .eq("ok", false)
      .gte("at", desde)
      .order("at", { ascending: true });

    if ((fallidos?.length ?? 0) >= MAX_INTENTOS) {
      // Cuánto falta para que el más viejo salga de la ventana.
      const libre = new Date(fallidos![0].at).getTime() + VENTANA_MINUTOS * 60_000;
      const minutos = Math.max(1, Math.ceil((libre - Date.now()) / 60_000));
      return json({
        success: false,
        code: "BLOQUEADO",
        error: `Demasiados intentos fallidos. Probá de nuevo en ${minutos} minuto${minutos === 1 ? "" : "s"}.`,
      }, 429);
    }

    const registrar = (ok: boolean) =>
      admin.from("login_attempts").insert({ email, ip, ok });

    const { data: user, error: dbError } = await admin
      .from("users")
      .select("id, email, name, role, password_hash, is_active")
      .ilike("email", email)
      .maybeSingle();

    // Un problema de base (permisos, conexión) NO es lo mismo que una
    // contraseña incorrecta. Si se responden igual, un error de configuración
    // se disfraza de credencial mala y se pierden horas buscando donde no es.
    if (dbError) {
      console.error("DB:", dbError);
      return json({ success: false, error: "No se pudo consultar la base de datos",
                    code: "DB_ERROR" }, 500);
    }

    // El mensaje es el mismo exista o no el usuario: si se distinguieran, la
    // pantalla de login serviría para averiguar qué direcciones están dadas
    // de alta. El `code` queda para poder diagnosticar.
    const GENERICO = "Email o contraseña incorrectos";
    if (!user) {
      await registrar(false);
      return json({ success: false, error: GENERICO, code: "NO_USER" }, 401);
    }
    if (!user.is_active) {
      await registrar(false);
      return json({ success: false, error: GENERICO, code: "INACTIVE" }, 401);
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      await registrar(false);
      return json({ success: false, error: GENERICO, code: "BAD_PASSWORD" }, 401);
    }

    // Entró bien: se borran los fallidos, así el contador arranca de cero, y
    // queda registrado el ingreso. De paso se limpia lo viejo, que si no la
    // tabla crece para siempre.
    await admin.from("login_attempts").delete().ilike("email", email).eq("ok", false);
    await registrar(true);
    await admin.from("login_attempts")
      .delete().lt("at", new Date(Date.now() - 30 * 86_400_000).toISOString());

    const jwtSecret = Deno.env.get("APP_JWT_SECRET");
    if (!jwtSecret) {
      return json({ success: false, error: "Falta configurar APP_JWT_SECRET",
                    code: "NO_JWT_SECRET" }, 500);
    }

    const secret = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );

    const token = await create(
      { alg: "HS256", typ: "JWT" },
      {
        sub: user.id,
        email: user.email,
        role: "authenticated",
        app_role: user.role,
        exp: getNumericDate(HORAS_DE_SESION * 60 * 60),
      },
      secret,
    );

    return json({
      success: true,
      session: token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    console.error(e);
    return json({ success: false, error: "Error al iniciar sesión",
                  code: "EXCEPTION" }, 500);
  }
});
