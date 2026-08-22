import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, ArrowUpRight, Clock, DollarSign, Package, Percent, ShoppingCart, Store, TrendingUp, Users,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useAnalyticsRange } from "@/hooks/useAnalyticsRange";
import { useSalesAnalytics } from "@/hooks/useSalesAnalytics";
import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import { ChartCard } from "@/components/analytics/ChartCard";
import { KpiGrid, KpiTile } from "@/components/analytics/KpiTile";
import { AnalyticsTable } from "@/components/analytics/AnalyticsTable";
import { DailyFinancialSummary } from "@/components/accounting/DailyFinancialSummary";
import {
  AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE, colorAt, compactMoney, formatMoney,
} from "@/lib/analytics/chartTheme";

const Dashboard = () => {
  const { t } = useTranslation();
  const { tenantId } = useTenantContext();
  const qc = useQueryClient();
  const range = useAnalyticsRange("7d");
  const a = useSalesAnalytics(range);
  const money = (n: number) => formatMoney(n);

  // Realtime: ventas, pagos e inventario invalidan la caché analítica
  useEffect(() => {
    if (!tenantId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["analytics-sales"] });
        qc.invalidateQueries({ queryKey: ["analytics-items"] });
        qc.invalidateQueries({ queryKey: ["analytics-payments"] });
        qc.invalidateQueries({ queryKey: ["analytics-products"] });
      }, 500);
    };
    const channel = supabase
      .channel(`dashboard:${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "account_payments", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_movements", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tenantId, qc]);

  const recentSales = useMemo(() => a.sales.slice(0, 8), [a.sales]);
  const customerNames = useMemo(() => new Map(a.customers.map((c) => [c.id, c.name])), [a.customers]);
  const storeNames = useMemo(() => new Map(a.stores.map((s) => [s.id, s.name])), [a.stores]);
  const lowStock = a.inventory.low.slice(0, 6);
  const storeTotal = a.byStore.reduce((s, x) => s + x.revenue, 0);

  return (
    <AppLayout title={t("nav.items.dashboard")}>
      <div className="space-y-4">
        <AnalyticsFilterBar range={range} onRefresh={a.refetch} refreshing={a.fetching} />

        <DailyFinancialSummary />


        <KpiGrid>
          <KpiTile label="Ventas" value={money(a.kpis.revenue)} icon={DollarSign} accentIndex={0}
            current={a.kpis.revenue} previous={range.compare ? a.kpis.prevRevenue : undefined}
            hint={range.compare ? "vs período anterior" : range.label}
            series={a.timeseries.map((p) => p.revenue)} />
          <KpiTile label="Transacciones" value={String(a.kpis.tx)} icon={ShoppingCart} accentIndex={1}
            current={a.kpis.tx} previous={range.compare ? a.kpis.prevTx : undefined}
            series={a.timeseries.map((p) => p.tx)} />
          <KpiTile label="Productos vendidos" value={String(a.kpis.units)} icon={Package} accentIndex={2}
            hint={`${a.kpis.skus} SKU distintos`} />
          <KpiTile label="Ticket promedio" value={money(a.kpis.avgTicket)} icon={TrendingUp} accentIndex={3}
            current={a.kpis.avgTicket} previous={range.compare ? a.kpis.prevAvgTicket : undefined}
            series={a.timeseries.map((p) => p.avgTicket)} />
        </KpiGrid>

        <KpiGrid>
          <KpiTile label="Margen bruto" value={`${a.kpis.margin.toFixed(1)}%`} icon={Percent} accentIndex={4}
            hint={`${money(a.kpis.grossProfit)} de utilidad`} />
          <KpiTile label="Clientes atendidos" value={String(a.kpis.uniqueCustomers)} icon={Users} accentIndex={5}
            current={a.kpis.uniqueCustomers} previous={range.compare ? a.kpis.prevUniqueCustomers : undefined} />
          <KpiTile label="Valor inventario" value={money(a.inventory.value)} icon={Package} accentIndex={1}
            hint={`${a.inventory.list.length} productos`} />
          <KpiTile label="Pendiente de cobro" value={money(a.kpis.pendingCollection)} icon={AlertTriangle} accentIndex={2} invertDelta />
        </KpiGrid>

        {lowStock.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-warning/5 border border-warning/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <h3 className="font-heading font-semibold text-xs">
                  Alertas de inventario · {a.inventory.low.length} productos por reponer
                </h3>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-7 text-[10px]">
                <Link to="/inventario">Ver inventario →</Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {lowStock.map((p) => (
                <p key={p.id} className={`text-xs ${Number(p.stock) <= 0 ? "text-destructive font-medium" : "text-warning"}`}>
                  • {p.name} — stock {p.stock} (mín. {p.min_stock})
                </p>
              ))}
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard
            className="lg:col-span-2"
            title="Evolución de ventas"
            subtitle={`${range.label} · total ${money(a.kpis.revenue)}`}
            loading={a.loading}
            empty={a.timeseries.length === 0}
            height={260}
          >
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={a.timeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="label" tick={AXIS_TICK} />
                <YAxis yAxisId="l" tick={AXIS_TICK} tickFormatter={compactMoney} />
                <YAxis yAxisId="r" orientation="right" tick={AXIS_TICK} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, n: any) => (n === "Tickets" ? v : money(Number(v)))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" name="Ingresos" dataKey="revenue" fill={colorAt(0)} radius={[4, 4, 0, 0]} />
                {range.compare && (
                  <Line yAxisId="l" name="Período anterior" type="monotone" dataKey="prevRevenue" stroke={colorAt(3)} strokeDasharray="4 4" strokeWidth={2} dot={false} />
                )}
                <Line yAxisId="r" name="Tickets" type="monotone" dataKey="tx" stroke={colorAt(1)} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Mix por categoría" subtitle="Participación en ingresos" loading={a.loading} empty={a.byCategory.length === 0}>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={a.byCategory.slice(0, 5)} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {a.byCategory.slice(0, 5).map((_, i) => <Cell key={i} fill={colorAt(i)} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {a.byCategory.slice(0, 5).map((c, i) => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 truncate">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colorAt(i) }} />
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="font-heading font-semibold shrink-0 ml-2">{money(c.value)}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Ventas por hora" subtitle="Detección de horas punta" loading={a.loading} empty={a.kpis.tx === 0}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={a.byHour}>
                <defs>
                  <linearGradient id="dashHour" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorAt(0)} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={colorAt(0)} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 9 }} interval={1} />
                <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                <Area type="monotone" dataKey="revenue" stroke={colorAt(0)} strokeWidth={2} fill="url(#dashHour)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Rendimiento por tienda"
            subtitle={range.label}
            loading={a.loading}
            empty={a.byStore.length === 0}
            height={220}
            actions={<Badge variant="secondary" className="text-[10px]">{a.byStore.length} tiendas</Badge>}
          >
            <div className="space-y-3.5">
              {a.byStore.slice(0, 6).map((s, i) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium truncate inline-flex items-center gap-1">
                      <Store className="h-3 w-3 text-muted-foreground" />{s.name}
                    </span>
                    <span className="font-heading font-semibold" style={{ color: colorAt(i) }}>{money(s.revenue)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${storeTotal > 0 ? (s.revenue / storeTotal) * 100 : 0}%` }}
                      transition={{ duration: 0.7 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: colorAt(i) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AnalyticsTable
            title="Ventas recientes"
            rows={recentSales}
            loading={a.loading}
            pageSizeDefault={8}
            filename="ventas-recientes"
            initialSort={{ key: "created_at", desc: true }}
            actions={<Button asChild variant="ghost" size="sm" className="h-7 text-[10px]"><Link to="/pos">Ir al POS <ArrowUpRight className="h-3 w-3 ml-1" /></Link></Button>}
            columns={[
              { key: "created_at", label: "Fecha", sortValue: (r) => r.created_at, render: (r) => <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{new Date(r.created_at).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>, exportValue: (r) => new Date(r.created_at).toLocaleString("es") },
              { key: "customer", label: "Cliente", sortValue: (r) => customerNames.get(r.customer_id ?? "") ?? "", render: (r) => customerNames.get(r.customer_id ?? "") ?? "Consumidor final", exportValue: (r) => customerNames.get(r.customer_id ?? "") ?? "Consumidor final" },
              { key: "store", label: "Tienda", sortValue: (r) => storeNames.get(r.store_id ?? "") ?? "", render: (r) => storeNames.get(r.store_id ?? "") ?? "—", exportValue: (r) => storeNames.get(r.store_id ?? "") ?? "" },
              { key: "total", label: "Total", align: "right", sortValue: (r) => Number(r.total), render: (r) => <span className="font-semibold">{money(Number(r.total))}</span>, exportValue: (r) => Number(r.total).toFixed(2) },
              { key: "status", label: "Estado", sortValue: (r) => r.status, render: (r) => <Badge variant={r.status === "partial" ? "secondary" : "default"} className="capitalize">{r.status}</Badge>, exportValue: (r) => r.status },
            ]}
          />

          <AnalyticsTable
            title="Top productos"
            rows={a.topProducts.slice(0, 20)}
            loading={a.loading}
            pageSizeDefault={8}
            filename="top-productos-dashboard"
            searchKeys={(r) => r.name}
            initialSort={{ key: "revenue", desc: true }}
            columns={[
              { key: "name", label: "Producto", sortValue: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span>, exportValue: (r) => r.name },
              { key: "qty", label: "Uds", align: "right", sortValue: (r) => r.qty, render: (r) => r.qty, exportValue: (r) => r.qty },
              { key: "revenue", label: "Ingresos", align: "right", sortValue: (r) => r.revenue, render: (r) => <span className="font-semibold">{money(r.revenue)}</span>, exportValue: (r) => r.revenue.toFixed(2) },
              { key: "margin", label: "Margen", align: "right", sortValue: (r) => r.margin, render: (r) => <Badge variant={r.margin >= 30 ? "default" : r.margin >= 10 ? "secondary" : "destructive"}>{r.margin.toFixed(0)}%</Badge>, exportValue: (r) => r.margin.toFixed(1) },
            ]}
          />
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
