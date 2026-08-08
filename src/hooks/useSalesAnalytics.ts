// Datos analíticos de ventas para Dashboard / Analytics / Reportes / BI.
// Un único origen para KPIs, series temporales y rankings, con comparación
// contra el período anterior y filtros por tienda / empleado / cliente.

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { bucketKey, bucketLabel, type AnalyticsRange } from "@/hooks/useAnalyticsRange";

const ALL = "__all__";

export interface AnalyticsFilters {
  storeId?: string;
  employeeId?: string;
  customerId?: string;
}

export interface SaleRow {
  id: string;
  total: number;
  subtotal: number;
  tax: number;
  amount_paid: number | null;
  currency: string | null;
  status: string;
  created_at: string;
  store_id: string | null;
  customer_id: string | null;
  employee_id: string | null;
}

export interface ItemRow {
  sale_id: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  price: number;
  total: number;
}

const SALE_COLS = "id,total,subtotal,tax,amount_paid,currency,status,created_at,store_id,customer_id,employee_id";
const VALID_STATUS = ["completed", "paid", "partial"];

async function fetchSales(tenantId: string, fromIso: string, toIso: string, f: AnalyticsFilters) {
  let q = supabase
    .from("sales")
    .select(SALE_COLS)
    .eq("tenant_id", tenantId)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .in("status", VALID_STATUS)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (f.storeId && f.storeId !== ALL) q = q.eq("store_id", f.storeId);
  if (f.employeeId && f.employeeId !== ALL) q = q.eq("employee_id", f.employeeId);
  if (f.customerId && f.customerId !== ALL) q = q.eq("customer_id", f.customerId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SaleRow[];
}

async function fetchItems(saleIds: string[]) {
  if (!saleIds.length) return [] as ItemRow[];
  const chunks: ItemRow[] = [];
  for (let i = 0; i < saleIds.length; i += 400) {
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id,product_id,product_name,qty,price,total")
      .in("sale_id", saleIds.slice(i, i + 400));
    if (error) throw new Error(error.message);
    chunks.push(...((data ?? []) as unknown as ItemRow[]));
  }
  return chunks;
}

export function useSalesAnalytics(range: AnalyticsRange, filters: AnalyticsFilters = {}) {
  const { tenantId } = useTenantContext();
  const enabled = !!tenantId;
  const key = [tenantId, range.fromIso, range.toIso, filters.storeId ?? ALL, filters.employeeId ?? ALL, filters.customerId ?? ALL];

  const current = useQuery({
    queryKey: ["analytics-sales", ...key],
    enabled,
    staleTime: 30_000,
    queryFn: () => fetchSales(tenantId!, range.fromIso, range.toIso, filters),
  });

  const previous = useQuery({
    queryKey: ["analytics-sales-prev", tenantId, range.prevFromIso, range.prevToIso, filters.storeId ?? ALL, filters.employeeId ?? ALL, filters.customerId ?? ALL],
    enabled: enabled && range.compare,
    staleTime: 30_000,
    queryFn: () => fetchSales(tenantId!, range.prevFromIso, range.prevToIso, filters),
  });

  const saleIds = useMemo(() => (current.data ?? []).map((s) => s.id), [current.data]);

  const items = useQuery({
    queryKey: ["analytics-items", tenantId, saleIds.length, saleIds[0] ?? null, saleIds[saleIds.length - 1] ?? null],
    enabled: enabled && saleIds.length > 0,
    staleTime: 30_000,
    queryFn: () => fetchItems(saleIds),
  });

  const payments = useQuery({
    queryKey: ["analytics-payments", tenantId, range.fromIso, range.toIso],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_payments")
        .select("sale_id,method,amount,amount_in_base,currency")
        .gte("created_at", range.fromIso)
        .lte("created_at", range.toIso)
        .limit(5000);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as { sale_id: string; method: string; amount_in_base: number; currency: string }[];
    },
  });

  const [stores, employees, customers, products, purchases] = useQueries({
    queries: [
      {
        queryKey: ["analytics-stores", tenantId],
        enabled,
        staleTime: 300_000,
        queryFn: async () => {
          const { data } = await supabase.from("stores").select("id,name").eq("tenant_id", tenantId!).order("name");
          return (data ?? []) as { id: string; name: string }[];
        },
      },
      {
        queryKey: ["analytics-employees", tenantId],
        enabled,
        staleTime: 300_000,
        queryFn: async () => {
          const { data } = await supabase.from("employees").select("id,name").eq("tenant_id", tenantId!).order("name");
          return (data ?? []) as { id: string; name: string }[];
        },
      },
      {
        queryKey: ["analytics-customers", tenantId],
        enabled,
        staleTime: 300_000,
        queryFn: async () => {
          const { data } = await supabase
            .from("customers")
            .select("id,name,total_spent,visits_count,loyalty_tier,balance")
            .eq("tenant_id", tenantId!)
            .order("name")
            .limit(2000);
          return (data ?? []) as { id: string; name: string; total_spent: number; visits_count: number; loyalty_tier: string; balance: number }[];
        },
      },
      {
        queryKey: ["analytics-products", tenantId],
        enabled,
        staleTime: 300_000,
        queryFn: async () => {
          const { data } = await supabase
            .from("products")
            .select("id,name,sku,cost,price,category,stock,min_stock")
            .eq("tenant_id", tenantId!)
            .limit(3000);
          return (data ?? []) as { id: string; name: string; sku: string; cost: number; price: number; category: string | null; stock: number; min_stock: number }[];
        },
      },
      {
        queryKey: ["analytics-purchases", tenantId, range.fromIso, range.toIso],
        enabled,
        staleTime: 60_000,
        queryFn: async () => {
          const { data } = await supabase
            .from("purchases")
            .select("total,status,created_at,supplier_id")
            .eq("tenant_id", tenantId!)
            .gte("created_at", range.fromIso)
            .lte("created_at", range.toIso)
            .limit(3000);
          return (data ?? []) as { total: number; status: string; created_at: string; supplier_id: string | null }[];
        },
      },
    ],
  });

  const sales = current.data ?? [];
  const prevSales = previous.data ?? [];
  const saleItems = items.data ?? [];
  const productMap = useMemo(
    () => new Map((products.data ?? []).map((p) => [p.id, p])),
    [products.data],
  );

  const kpis = useMemo(() => {
    const revenue = sales.reduce((a, s) => a + Number(s.total || 0), 0);
    const prevRevenue = prevSales.reduce((a, s) => a + Number(s.total || 0), 0);
    const tax = sales.reduce((a, s) => a + Number(s.tax || 0), 0);
    const pendingCollection = sales.reduce((a, s) => a + Math.max(0, Number(s.total || 0) - Number(s.amount_paid ?? s.total ?? 0)), 0);
    const units = saleItems.reduce((a, i) => a + Number(i.qty || 0), 0);
    const cogs = saleItems.reduce((a, i) => a + Number(i.qty || 0) * Number(productMap.get(i.product_id ?? "")?.cost || 0), 0);
    const grossProfit = revenue - cogs;
    return {
      revenue,
      prevRevenue,
      tx: sales.length,
      prevTx: prevSales.length,
      avgTicket: sales.length ? revenue / sales.length : 0,
      prevAvgTicket: prevSales.length ? prevRevenue / prevSales.length : 0,
      units,
      tax,
      pendingCollection,
      cogs,
      grossProfit,
      margin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      uniqueCustomers: new Set(sales.filter((s) => s.customer_id).map((s) => s.customer_id)).size,
      prevUniqueCustomers: new Set(prevSales.filter((s) => s.customer_id).map((s) => s.customer_id)).size,
      skus: new Set(saleItems.map((i) => i.product_name)).size,
    };
  }, [sales, prevSales, saleItems, productMap]);

  const timeseries = useMemo(() => {
    const g = range.granularity;
    const map = new Map<string, { key: string; revenue: number; tx: number; prevRevenue: number }>();
    sales.forEach((s) => {
      const k = bucketKey(s.created_at, g);
      const cur = map.get(k) ?? { key: k, revenue: 0, tx: 0, prevRevenue: 0 };
      cur.revenue += Number(s.total || 0);
      cur.tx += 1;
      map.set(k, cur);
    });
    const ordered = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
    // Comparación: alinea el bucket n del período anterior con el bucket n actual
    if (range.compare && prevSales.length) {
      const prevMap = new Map<string, number>();
      prevSales.forEach((s) => {
        const k = bucketKey(s.created_at, g);
        prevMap.set(k, (prevMap.get(k) ?? 0) + Number(s.total || 0));
      });
      const prevOrdered = [...prevMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      ordered.forEach((row, i) => { row.prevRevenue = prevOrdered[i]?.[1] ?? 0; });
    }
    let acc = 0;
    return ordered.map((r) => {
      acc += r.revenue;
      return { ...r, label: bucketLabel(r.key, g), cumulative: acc, avgTicket: r.tx ? r.revenue / r.tx : 0 };
    });
  }, [sales, prevSales, range.granularity, range.compare]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
    saleItems.forEach((i) => {
      const cur = map.get(i.product_name) ?? { name: i.product_name, qty: 0, revenue: 0, cost: 0 };
      cur.qty += Number(i.qty || 0);
      cur.revenue += Number(i.total || 0);
      cur.cost += Number(i.qty || 0) * Number(productMap.get(i.product_id ?? "")?.cost || 0);
      map.set(i.product_name, cur);
    });
    return [...map.values()]
      .map((p) => ({ ...p, profit: p.revenue - p.cost, margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [saleItems, productMap]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    saleItems.forEach((i) => {
      const cat = productMap.get(i.product_id ?? "")?.category || "Sin categoría";
      map.set(cat, (map.get(cat) ?? 0) + Number(i.total || 0));
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [saleItems, productMap]);

  const byStore = useMemo(() => {
    const names = new Map((stores.data ?? []).map((s) => [s.id, s.name]));
    const map = new Map<string, { name: string; revenue: number; tx: number }>();
    sales.forEach((s) => {
      const id = s.store_id ?? "none";
      const name = names.get(id) ?? "Sin tienda";
      const cur = map.get(id) ?? { name, revenue: 0, tx: 0 };
      cur.revenue += Number(s.total || 0);
      cur.tx += 1;
      map.set(id, cur);
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [sales, stores.data]);

  const byEmployee = useMemo(() => {
    const names = new Map((employees.data ?? []).map((e) => [e.id, e.name]));
    const map = new Map<string, { name: string; revenue: number; tx: number }>();
    sales.forEach((s) => {
      const id = s.employee_id ?? "none";
      const name = names.get(id) ?? "Sin asignar";
      const cur = map.get(id) ?? { name, revenue: 0, tx: 0 };
      cur.revenue += Number(s.total || 0);
      cur.tx += 1;
      map.set(id, cur);
    });
    return [...map.values()]
      .map((e) => ({ ...e, avgTicket: e.tx ? e.revenue / e.tx : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [sales, employees.data]);

  const byCustomer = useMemo(() => {
    const names = new Map((customers.data ?? []).map((c) => [c.id, c.name]));
    const map = new Map<string, { id: string; name: string; revenue: number; tx: number; last: string }>();
    sales.forEach((s) => {
      if (!s.customer_id) return;
      const cur = map.get(s.customer_id) ?? { id: s.customer_id, name: names.get(s.customer_id) ?? "—", revenue: 0, tx: 0, last: s.created_at };
      cur.revenue += Number(s.total || 0);
      cur.tx += 1;
      if (s.created_at > cur.last) cur.last = s.created_at;
      map.set(s.customer_id, cur);
    });
    return [...map.values()]
      .map((c) => ({ ...c, avgTicket: c.tx ? c.revenue / c.tx : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [sales, customers.data]);

  const byMethod = useMemo(() => {
    const ids = new Set(saleIds);
    const map = new Map<string, number>();
    (payments.data ?? [])
      .filter((p) => ids.has(p.sale_id))
      .forEach((p) => map.set(p.method, (map.get(p.method) ?? 0) + Number(p.amount_in_base || 0)));
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [payments.data, saleIds]);

  const byHour = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, "0")}h`, revenue: 0, tx: 0 }));
    sales.forEach((s) => {
      const h = new Date(s.created_at).getHours();
      buckets[h].revenue += Number(s.total || 0);
      buckets[h].tx += 1;
    });
    return buckets;
  }, [sales]);

  const byWeekday = useMemo(() => {
    const names = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const buckets = names.map((label) => ({ label, revenue: 0, tx: 0 }));
    sales.forEach((s) => {
      const d = new Date(s.created_at).getDay();
      buckets[d].revenue += Number(s.total || 0);
      buckets[d].tx += 1;
    });
    return [...buckets.slice(1), buckets[0]];
  }, [sales]);

  const abc = useMemo(() => {
    const total = topProducts.reduce((a, p) => a + p.revenue, 0);
    let acc = 0;
    return topProducts.map((p) => {
      acc += p.revenue;
      const cum = total > 0 ? (acc / total) * 100 : 0;
      return { ...p, cumulative: cum, klass: cum <= 80 ? "A" : cum <= 95 ? "B" : "C" };
    });
  }, [topProducts]);

  const inventory = useMemo(() => {
    const list = products.data ?? [];
    const soldIds = new Set(saleItems.map((i) => i.product_id));
    const value = list.reduce((a, p) => a + Number(p.stock || 0) * Number(p.cost || 0), 0);
    const low = list.filter((p) => Number(p.min_stock || 0) > 0 && Number(p.stock || 0) <= Number(p.min_stock));
    const out = list.filter((p) => Number(p.stock || 0) <= 0);
    const idle = list.filter((p) => !soldIds.has(p.id) && Number(p.stock || 0) > 0)
      .map((p) => ({ ...p, value: Number(p.stock || 0) * Number(p.cost || 0) }))
      .sort((a, b) => b.value - a.value);
    const rotation = kpis.cogs > 0 && value > 0 ? kpis.cogs / value : 0;
    return { list, value, low, out, idle, rotation };
  }, [products.data, saleItems, kpis.cogs]);

  const purchaseTotals = useMemo(() => {
    const rows = purchases.data ?? [];
    const received = rows.filter((p) => p.status === "received");
    return {
      count: rows.length,
      total: rows.reduce((a, p) => a + Number(p.total || 0), 0),
      received: received.reduce((a, p) => a + Number(p.total || 0), 0),
      pending: rows.filter((p) => p.status !== "received").reduce((a, p) => a + Number(p.total || 0), 0),
    };
  }, [purchases.data]);

  const refetchAll = () => {
    current.refetch();
    if (range.compare) previous.refetch();
    items.refetch();
    payments.refetch();
    purchases.refetch();
  };

  return {
    loading: current.isPending || (saleIds.length > 0 && items.isPending),
    fetching: current.isFetching || items.isFetching,
    error: (current.error ?? items.error ?? payments.error) as Error | null,
    refetch: refetchAll,
    sales,
    prevSales,
    saleItems,
    kpis,
    timeseries,
    topProducts,
    byCategory,
    byStore,
    byEmployee,
    byCustomer,
    byMethod,
    byHour,
    byWeekday,
    abc,
    inventory,
    purchaseTotals,
    stores: stores.data ?? [],
    employees: employees.data ?? [],
    customers: customers.data ?? [],
  };
}
