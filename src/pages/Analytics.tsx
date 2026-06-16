import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
} from "recharts";
import { motion } from "framer-motion";
import { StatCard } from "@/components/StatCard";
import {
  DollarSign, ShoppingCart, Package, TrendingUp, Users, ArrowUpRight, ArrowDownRight, Calendar,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COLORS = [
  "hsl(160, 84%, 39%)", "hsl(217, 91%, 60%)", "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)", "hsl(280, 67%, 55%)", "hsl(170, 70%, 45%)",
];

const Analytics = () => {
  const { t } = useTranslation();
  const { tenantId } = useTenantContext();
  const [sales, setSales] = useState<any[]>([]);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [period, setPeriod] = useState("7d");

  useEffect(() => {
    if (!tenantId) return;
    const fetchData = async () => {
      const daysAgo = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const since = new Date(Date.now() - daysAgo * 86400000).toISOString();

      const [salesRes, itemsRes] = await Promise.all([
        supabase.from("sales").select("*").eq("tenant_id", tenantId).gte("created_at", since).order("created_at"),
        supabase.from("sale_items").select("*, sales!inner(tenant_id, created_at)").eq("sales.tenant_id", tenantId).gte("sales.created_at", since),
      ]);
      if (salesRes.data) setSales(salesRes.data);
      if (itemsRes.data) setSaleItems(itemsRes.data);
    };
    fetchData();
  }, [tenantId, period]);

  const totalRevenue = sales.reduce((s, sale) => s + (sale.total || 0), 0);
  const totalTransactions = sales.length;
  const avgTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
  const totalProducts = saleItems.reduce((s, i) => s + (i.qty || 0), 0);

  // Sales by day
  const salesByDay = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach((s) => {
      const day = new Date(s.created_at).toLocaleDateString("es", { weekday: "short" });
      map[day] = (map[day] || 0) + (s.total || 0);
    });
    return Object.entries(map).map(([name, ventas]) => ({ name, ventas }));
  }, [sales]);

  // Top products
  const topProducts = useMemo(() => {
    const map: Record<string, { qty: number; revenue: number }> = {};
    saleItems.forEach((i) => {
      const key = i.product_name;
      if (!map[key]) map[key] = { qty: 0, revenue: 0 };
      map[key].qty += i.qty || 0;
      map[key].revenue += i.total || 0;
    });
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [saleItems]);

  // Sales by category (from product_name patterns)
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    saleItems.forEach((i) => {
      const cat = i.sku?.split("-")[0] || "Otros";
      map[cat] = (map[cat] || 0) + (i.total || 0);
    });
    return Object.entries(map).map(([name, value], idx) => ({
      name, value, color: COLORS[idx % COLORS.length],
    }));
  }, [saleItems]);

  // Payment methods breakdown
  const paymentBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach((s) => {
      const method = s.status === "partial" ? "Fiado" : "Completo";
      map[method] = (map[method] || 0) + 1;
    });
    return Object.entries(map).map(([name, value], idx) => ({
      name, value, color: COLORS[idx % COLORS.length],
    }));
  }, [sales]);

  return (
    <AppLayout title={t("nav.items.analytics")}>
      <div className="space-y-4">
        {/* Period selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Periodo:</span>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 días</SelectItem>
              <SelectItem value="30d">Últimos 30 días</SelectItem>
              <SelectItem value="90d">Últimos 90 días</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="Ingresos Totales" value={`$${totalRevenue.toLocaleString()}`} change={`${totalTransactions} ventas`} changeType="positive" icon={DollarSign} />
          <StatCard title="Transacciones" value={String(totalTransactions)} change="periodo seleccionado" changeType="positive" icon={ShoppingCart} />
          <StatCard title="Productos Vendidos" value={String(totalProducts)} change={`${topProducts.length} diferentes`} changeType="positive" icon={Package} />
          <StatCard title="Ticket Promedio" value={`$${avgTicket.toFixed(0)}`} change="por venta" changeType="positive" icon={TrendingUp} />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-2 bg-card rounded-xl p-4 shadow-card border">
            <h2 className="font-heading font-semibold text-sm mb-4">Ventas por Día</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fill: "hsl(220, 9%, 46%)", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(220, 9%, 46%)", fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,13%,91%)", borderRadius: "8px", fontSize: "11px" }} />
                <Bar dataKey="ventas" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-xl p-4 shadow-card border">
            <h2 className="font-heading font-semibold text-sm mb-4">Por Estado de Pago</h2>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={paymentBreakdown} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
                  {paymentBreakdown.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {paymentBreakdown.map((cat) => (
                <div key={cat.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />{cat.name}</span>
                  <span className="font-heading font-semibold">{cat.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Top products */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl p-4 shadow-card border">
          <h2 className="font-heading font-semibold text-sm mb-4">Top Productos por Ingreso</h2>
          <div className="space-y-3">
            {topProducts.map((product, i) => (
              <div key={product.name} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-5 font-heading shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{product.name}</p>
                  <p className="text-[10px] text-muted-foreground">{product.qty} uds vendidas</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                  <span className="text-xs font-semibold font-heading text-primary">${product.revenue.toLocaleString()}</span>
                </div>
              </div>
            ))}
            {topProducts.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No hay datos de ventas en este periodo</p>
            )}
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default Analytics;
