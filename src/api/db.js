/**
 * CLIENTE DE SUPABASE
 *
 * Reemplaza al backend de Google Apps Script conservando exactamente la misma
 * interfaz (`entities.X.list/get/create/update/delete`, `listMultiple`, `auth`),
 * para que las pantallas no tengan que cambiar al migrar.
 *
 * CAPA DE TRADUCCIÓN
 * El esquema nuevo renombró algunas cosas. En vez de tocar 86 llamadas en las
 * 12 pantallas al mismo tiempo que se cambia de base de datos, se traduce acá:
 *
 *   base de datos                 código de las pantallas
 *   refinery_movements.buyer_id   <->  destination
 *   *_payments.kind               <->  is_initial_balance
 *   agreements.supplier_id/buyer_id <-> party_id
 *
 * Es deuda deliberada y temporal: primero se cambia la base con el código
 * quieto y se verifica que los saldos no se movieron; después se renombran los
 * campos en las pantallas como un cambio propio, verificable por separado.
 * Cuando eso pase, todo el bloque de traducción de este archivo se borra.
 */
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. " +
    "En local van en .env.local; en Vercel, en Settings -> Environment Variables."
  );
}

function getToken() {
  return sessionStorage.getItem("sessionToken");
}

/**
 * Cuándo vence la sesión, en milisegundos, leído del `exp` del JWT que firmó
 * la Edge Function. 0 si no hay token.
 *
 * Devuelve `null` si el token existe pero no se puede leer. Eso NO cuenta como
 * vencido a propósito: echar a alguien por un token ilegible podría dejarlo
 * dando vueltas entre el login y la app. En ese caso se comporta como antes y,
 * si de verdad está vencido, lo rechaza el servidor.
 */
export function sessionExpiresAt() {
  const token = getToken();
  if (!token) return 0;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function sessionExpired() {
  const vence = sessionExpiresAt();
  return vence !== null && Date.now() >= vence;
}

export const supabase = createClient(URL, ANON, {
  // Login propio: el JWT lo firma la Edge Function, no el Auth de Supabase.
  accessToken: async () => getToken(),
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------- entidades

const TABLES = {
  Supplier: "suppliers",
  Refinery: "refineries",
  Buyer: "buyers",
  PurchaseAgreement: "purchase_agreements",
  TruckPurchase: "truck_purchases",
  RefineryMovement: "refinery_movements",
  DirectSale: "direct_sales",
  SupplierPayment: "supplier_payments",
  RefineryPayment: "refinery_payments",
  BuyerPayment: "buyer_payments",
};

const PAYMENTS = ["SupplierPayment", "RefineryPayment", "BuyerPayment"];

/**
 * Campos que existen sólo en el formulario y no son columnas.
 *
 * Con Google Sheets esto no molestaba: el script escribía únicamente las
 * columnas que conocía e ignoraba el resto. Postgres rechaza el pedido entero
 * si le mandan un campo que no existe, así que hay que sacarlos acá.
 *
 * - `is_direct_sale`: decide si el camión va a refinería o a comprador, y eso
 *   ya queda expresado en cuál de los dos ids viaja.
 * - `agreement_id`: el selector de "¿a qué acuerdo corresponde?". La pantalla
 *   lo usa para elegir el acuerdo y después guarda su id en
 *   `purchase_agreement_id`, que sí es columna.
 */
const SOLO_FORMULARIO = {
  TruckPurchase: ["is_direct_sale", "agreement_id"],
};

// ------------------------------------------------------------- traducción

/** Fila de la base -> forma que esperan las pantallas. */
function fromDb(entity, row) {
  if (!row) return row;
  const o = { ...row, created_date: row.created_at };

  if (PAYMENTS.includes(entity)) {
    o.is_initial_balance = row.kind === "initial_balance";
  }
  if (entity === "RefineryMovement") {
    o.destination = row.buyer_id ?? "";
  }
  if (entity === "PurchaseAgreement") {
    o.party_id = row.supplier_id ?? row.buyer_id ?? "";
    o.supplier_id = row.supplier_id ?? "";
  }
  if (entity === "TruckPurchase") {
    o.is_direct_sale = !!row.buyer_id;
  }
  return o;
}

/** Payload de las pantallas -> columnas reales de la base. */
function toDb(entity, data) {
  const o = { ...data };

  // Columnas que no existen o que calcula la base.
  delete o.id;
  delete o.created_date;
  delete o.created_at;
  delete o.net_tons;

  if (PAYMENTS.includes(entity)) {
    // Un `kind` explícito (ej: "adjustment") manda sobre el booleano viejo.
    if ("kind" in o) {
      delete o.is_initial_balance;
    } else if ("is_initial_balance" in o) {
      o.kind = o.is_initial_balance ? "initial_balance" : "payment";
      delete o.is_initial_balance;
    }
  }

  if (entity === "RefineryMovement") {
    if ("destination" in o) {
      o.buyer_id = o.destination;
      delete o.destination;
    }
  }

  if (entity === "PurchaseAgreement") {
    if ("party_id" in o) {
      const esProveedor = (o.party_type || "supplier") === "supplier";
      o.supplier_id = esProveedor ? o.party_id : null;
      o.buyer_id = esProveedor ? null : o.party_id;
      delete o.party_id;
    }
  }

  if (entity === "TruckPurchase" && "is_direct_sale" in o) {
    // El destino es excluyente: o refinería o comprador, nunca los dos.
    // Hay que anular el otro explícitamente, porque al editar una compra que
    // cambia de tipo el formulario no manda el campo que dejó de mostrarse.
    if (o.is_direct_sale) o.refinery_id = null;
    else o.buyer_id = null;
  }

  // Al final, cuando ya se leyó lo que había que leer de ellos.
  for (const campo of SOLO_FORMULARIO[entity] || []) delete o[campo];

  // Los <select> vacíos mandan "", que Postgres no acepta en uuid ni en date.
  for (const k of Object.keys(o)) {
    if (o[k] === "") o[k] = null;
  }
  return o;
}

// ------------------------------------------------------------------ helpers

function fail(error) {
  // Token vencido o inválido: misma reacción que tenía el cliente anterior.
  if (error.code === "PGRST301" || error.code === "42501") {
    sessionStorage.removeItem("currentUser");
    sessionStorage.removeItem("sessionToken");
    window.location.href = "/login";
  }
  throw new Error(error.message || "Error de base de datos");
}

const PAGE = 1000; // tope por pedido de PostgREST

/**
 * Trae TODAS las filas, paginando.
 * El backend viejo cortaba en 500 sin avisar; esa clase de error no se repite:
 * acá se pide de a 1000 hasta que no viene más.
 */
async function fetchAll(table, filters) {
  const out = [];
  for (let desde = 0; ; desde += PAGE) {
    let q = supabase.from(table).select("*").range(desde, desde + PAGE - 1);
    if (filters) {
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    }
    const { data, error } = await q;
    if (error) fail(error);
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

function makeEntity(entity) {
  const table = TABLES[entity];
  return {
    async list(filters) {
      const rows = await fetchAll(table, filters);
      return rows.map((r) => fromDb(entity, r));
    },
    async get(id) {
      const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
      if (error) fail(error);
      return fromDb(entity, data);
    },
    async create(values) {
      const { data, error } = await supabase
        .from(table).insert(toDb(entity, values)).select().single();
      if (error) fail(error);
      return fromDb(entity, data);
    },
    async update(id, values) {
      const { data, error } = await supabase
        .from(table).update(toDb(entity, values)).eq("id", id).select().single();
      if (error) fail(error);
      return fromDb(entity, data);
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) fail(error);
      return { success: true, id };
    },
  };
}

/**
 * El registro de auditoría.
 *
 * Sólo lectura: la base no le da permiso de escritura a nadie, lo único que
 * escribe es el trigger. No usa makeEntity() porque no se pagina — el log
 * crece sin techo y siempre se mira lo último.
 */
async function auditLog({ limit = 300, table, action, actor } = {}) {
  let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(limit);
  if (table) q = q.eq("table_name", table);
  if (action) q = q.eq("action", action);
  if (actor) q = q.eq("actor_email", actor);
  const { data, error } = await q;
  if (error) fail(error);
  return data;
}

/** Todas las entidades de una, en paralelo. Reemplaza al "bulk" del script. */
async function listMultiple(names) {
  const res = await Promise.all(names.map((n) => makeEntity(n).list()));
  return Object.fromEntries(names.map((n, i) => [n, res[i]]));
}

// --------------------------------------------------------------------- auth

const auth = {
  async login(email, password) {
    const r = await fetch(`${URL}/functions/v1/login`, {
      method: "POST",
      // El portón de Edge Functions exige Authorization ANTES de llegar al
      // código de la función; sin este header devuelve 401 sin ejecutarla.
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: JSON.stringify({ email, password }),
    });
    const result = await r.json();
    if (result.success) {
      sessionStorage.setItem("currentUser", JSON.stringify(result.user));
      sessionStorage.setItem("sessionToken", result.session);
    }
    return result;
  },
  logout() {
    sessionStorage.removeItem("currentUser");
    sessionStorage.removeItem("sessionToken");
  },
  me() {
    // El token vencido no se avisa solo: sin esto la app seguía mostrando todo
    // como si nada y recién fallaba al guardar.
    if (sessionExpired()) {
      auth.logout();
      return null;
    }
    const raw = sessionStorage.getItem("currentUser");
    return raw ? JSON.parse(raw) : null;
  },
};

export const db = {
  entities: Object.fromEntries(Object.keys(TABLES).map((n) => [n, makeEntity(n)])),
  auth,
  listMultiple,
  auditLog,
};
