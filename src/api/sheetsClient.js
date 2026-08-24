/**
 * CLIENTE PARA REEMPLAZAR AL SDK DE BASE44
 * La autorización ahora es por sesión (se obtiene al hacer login),
 * no por un token fijo — el backend sabe quién sos en cada pedido.
 */

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_0UnJyuF7c9FzOpuCHrRHJkBunMqScZpKrb2UXg9gYMYO6RpIvezbK2GvPx8_fqrW/exec";

function getSessionToken() {
  return sessionStorage.getItem("sessionToken") || "";
}

function handleSessionError(json) {
  if (json && json.error === "SESSION_INVALID") {
    sessionStorage.removeItem("currentUser");
    sessionStorage.removeItem("sessionToken");
    window.location.href = "/login";
  }
}

async function apiCall(entity, action, { id, data, filters } = {}) {
  const params = new URLSearchParams({ action, session: getSessionToken() });
  if (entity) params.append("entity", entity);
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
  if (json && json.error) {
    handleSessionError(json);
    throw new Error(json.error);
  }
  return json;
}

async function listMultiple(entityNames) {
  const params = new URLSearchParams({
    action: "bulk",
    session: getSessionToken(),
    entities: entityNames.join(","),
  });
  const url = `${SCRIPT_URL}?${params.toString()}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json && json.error) {
    handleSessionError(json);
    throw new Error(json.error);
  }
  return json;
}

function makeEntity(name) {
  return {
    list: (filters) => apiCall(name, "list", { filters }),
    get: (id) => apiCall(name, "get", { id }),
    create: (data) => apiCall(name, "create", { data }),
    update: (id, data) => apiCall(name, "update", { id, data }),
    delete: (id) => apiCall(name, "delete", { id }),
  };
}

const auth = {
  async login(email, password) {
    const result = await apiCall(null, "login", { data: { email, password } });
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
    const raw = sessionStorage.getItem("currentUser");
    return raw ? JSON.parse(raw) : null;
  },
};

export const sheetsClient = {
  entities: {
    Buyer: makeEntity("Buyer"),
    BuyerPayment: makeEntity("BuyerPayment"),
    DirectSale: makeEntity("DirectSale"),
    ExchangeRate: makeEntity("ExchangeRate"),
    PurchaseAgreement: makeEntity("PurchaseAgreement"),
    Refinery: makeEntity("Refinery"),
    RefineryMovement: makeEntity("RefineryMovement"),
    RefineryPayment: makeEntity("RefineryPayment"),
    Supplier: makeEntity("Supplier"),
    SupplierPayment: makeEntity("SupplierPayment"),
    TruckPurchase: makeEntity("TruckPurchase"),
    User: makeEntity("User"),
  },
  auth,
  listMultiple,
};