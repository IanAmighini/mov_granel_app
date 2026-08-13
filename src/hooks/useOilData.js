import { useState, useEffect, useCallback } from "react";
import { sheetsClient } from "@/api/sheetsClient";

function sortByDateDesc(list) {
  return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
}

const ENTITY_NAMES = [
  "Supplier",
  "Refinery",
  "TruckPurchase",
  "SupplierPayment",
  "RefineryMovement",
  "RefineryPayment",
  "PurchaseAgreement",
];

export function useOilData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      try {
        const result = await sheetsClient.listMultiple(ENTITY_NAMES);
        if (!cancelled) {
          setData({
            suppliers: result.Supplier || [],
            refineries: result.Refinery || [],
            truckPurchases: sortByDateDesc(result.TruckPurchase || []).slice(0, 500),
            supplierPayments: sortByDateDesc(result.SupplierPayment || []).slice(0, 500),
            refineryMovements: sortByDateDesc(result.RefineryMovement || []).slice(0, 500),
            refineryPayments: sortByDateDesc(result.RefineryPayment || []).slice(0, 500),
            purchaseAgreements: sortByDateDesc(result.PurchaseAgreement || []).slice(0, 500),
          });
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { data, loading, refetch };
}