/**
 * CLIENTE PARA REEMPLAZAR AL SDK DE BASE44
 * ------------------------------------------
 * Imita la forma en que se usaba `base44.entities.X` para que tengas que
 * tocar lo menos posible del código de las páginas ya generadas.
 *
 * DÓNDE VA: guardá este archivo como src/api/sheetsClient.js en tu proyecto.
 *
 * CÓMO SE USABA ANTES (Base44):
 *   import { base44 } from "@/api/base44Client";
 *   const refinerias = await base44.entities.Refinery.list();
 *
 * CÓMO SE USA AHORA:
 *   import { sheetsClient as base44 } from "@/api/sheetsClient";
 *   const refinerias = await base44.entities.Refinery.list();
 *
 * (El resto del código de la página no debería necesitar cambios grandes,
 * más allá de esa línea de import. Revisar igual cada página por las dudas,
 * sobre todo si usaba filtros o el sistema de auth de Base44.)
 */

// ============ CONFIGURACIÓN ============
// Pegá acá la URL que te dio Apps Script al hacer "Implementar como app web"
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_0UnJyuF7c9FzOpuCHrRHJkBunMqScZpKrb2UXg9gYMYO6RpIvezbK2GvPx8_fqrW/exec";
// El mismo token secreto que pusiste en Code.gs (API_TOKEN)
const API_TOKEN = "refineria2026xk92";

// ============ LLAMADA BASE ============
async function apiCall(entity, action, { id, data, filters } = {}) {
  const params = new URLSearchParams({ entity, action, token: API_TOKEN });
  if (id) params.append("id", id);
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => params.append(k, v));
  }

  const isWrite = ["create", "update", "delete", "login"].includes(action);
  const url = `${SCRIPT_URL}?${params.toString()}`;

  const res = await fetch(url, {
    method: isWrite ? "POST" : "GET",
    body: isWrite ? JSON.stringify(data || {}) : undefined,
  });

  const json = await res.json();
  if (json && json.error) throw new Error(json.error);
  return json;
}

// ============ CARGA MASIVA (varias hojas en una sola llamada) ============
async function listMultiple(entityNames) {
  const params = new URLSearchParams({
    action: "bulk",
    token: API_TOKEN,
    entities: entityNames.join(","),
  });
  const url = `${SCRIPT_URL}?${params.toString()}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json && json.error) throw new Error(json.error);
  return json;
}

// ============ FÁBRICA DE ENTIDADES ============
function makeEntity(name) {
  return {
    list: (filters) => apiCall(name, "list", { filters }),
    get: (id) => apiCall(name, "get", { id }),
    create: (data) => apiCall(name, "create", { data }),
    update: (id, data) => apiCall(name, "update", { id, data }),
    delete: (id) => apiCall(name, "delete", { id }),
  };
}

// ============ AUTENTICACIÓN ============
const auth = {
  async login(email, password) {
    const result = await apiCall(null, "login", { data: { email, password } });
    if (result.success) {
      sessionStorage.setItem("currentUser", JSON.stringify(result.user));
    }
    return result;
  },
  logout() {
    sessionStorage.removeItem("currentUser");
  },
  me() {
    const raw = sessionStorage.getItem("currentUser");
    return raw ? JSON.parse(raw) : null;
  },
};

// ============ EXPORT ============
export const sheetsClient = {
  entities: {
    ExchangeRate: makeEntity("ExchangeRate"),
    PurchaseAgreement: makeEntity("PurchaseAgreement"),
    Refinery: makeEntity("Refinery"),
    RefineryMovement: makeEntity("RefineryMovement"),
    RefineryPayment: makeEntity("RefineryPayment"),
    Supplier: makeEntity("Supplier"),
    SupplierPayment: makeEntity("SupplierPayment"),
    TruckPurchase: makeEntity("TruckPurchase"),
    User: makeEntity("User"),
    Buyer: makeEntity("Buyer"),
    DirectSale: makeEntity("DirectSale"),
    BuyerPayment: makeEntity("BuyerPayment")
  },
  auth,
  listMultiple,
};