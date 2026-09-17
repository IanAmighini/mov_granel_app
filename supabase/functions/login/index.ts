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

    // Mismo mensaje exista o no el usuario: si se distinguen, la pantalla de
    // login sirve para averiguar qué direcciones están dadas de alta.
    // `code` distingue el motivo para poder diagnosticar; el `error` que se
    // muestra al usuario es siempre el mismo, así la pantalla de login no
    // sirve para averiguar qué direcciones están dadas de alta.
    const GENERICO = "Email o contraseña incorrectos";
    if (!user) return json({ success: false, error: GENERICO, code: "NO_USER" }, 401);
    if (!user.is_active) return json({ success: false, error: GENERICO, code: "INACTIVE" }, 401);

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return json({ success: false, error: GENERICO, code: "BAD_PASSWORD" }, 401);
    }

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
