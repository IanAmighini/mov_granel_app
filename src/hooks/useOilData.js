import { useQuery } from "@tanstack/react-query";
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
  "DirectSale",
  "Buyer",
  "BuyerPayment",
];

async function fetchOilData() {
  const result = await sheetsClient.listMultiple(ENTITY_NAMES);
  return {
    suppliers: result.Supplier || [],
    refineries: result.Refinery || [],
    truckPurchases: sortByDateDesc(result.TruckPurchase || []).slice(0, 500),
    supplierPayments: sortByDateDesc(result.SupplierPayment || []).slice(0, 500),
    refineryMovements: sortByDateDesc(result.RefineryMovement || []).slice(0, 500),
    refineryPayments: sortByDateDesc(result.RefineryPayment || []).slice(0, 500),
    purchaseAgreements: sortByDateDesc(result.PurchaseAgreement || []).slice(0, 500),
    directSales: sortByDateDesc(result.DirectSale || []).slice(0, 500),
    buyers: result.Buyer || [],
    buyerPayments: sortByDateDesc(result.BuyerPayment || []).slice(0, 500),
  };
}

export function useOilData() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["oilData"],
    queryFn: fetchOilData,
    staleTime: 30000, // 30 segundos: al volver a una pantalla ya vista, no vuelve a pedir todo
    refetchOnWindowFocus: false,
  });

  return { data, loading: isLoading, refetch };
}