import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, RadialBar, RadialBarChart,
} from "recharts";
import {
  DollarSign, ShoppingCart, Package, TrendingUp, Users, Percent, Clock, Store, AlertCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAnalyticsRange } from "@/hooks/useAnalyticsRange";
import { useSalesAnalytics } from "@/hooks/useSalesAnalytics";
import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import { ChartCard } from "@/components/analytics/ChartCard";
import { KpiGrid, KpiTile } from "@/components/analytics/KpiTile";
import { AnalyticsTable } from "@/components/analytics/AnalyticsTable";
import {
  AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE, colorAt, compactMoney, formatMoney,
} from "@/lib/analytics/chartTheme";

const ALL = "__all__";

const Analytics = () => {
  const { t } = useTranslation();
  const range = useAnalyticsRange("30d");
  const [storeId, setStoreId] = useState(ALL);
  const [employeeId, setEmployeeId] = useState(ALL);
  const a = useSalesAnalytics(range, { storeId, employeeId });
  const money = (n: number) => formatMoney(n);
  const revenueSeries = a.timeseries.map((p) => p.revenue);

  return (
    <AppLayout title={t("nav.items.analytics")}>
      <div className="space-y-4">
        <AnalyticsFilterBar
          range={range}
          onRefresh={a.refetch}
          refreshing={a.fetching}
          filters={[
            { key: "store", label: "Tienda", value: storeId, onChange: setStoreId, options: a.stores.map((s) => ({ value: s.id, label: s.name })) },
            { key: "employee", label: "Empleado", value: employeeId, onChange: setEmployeeId, options: a.employees.map((e) => ({ value: e.id, label: e.name })) },
          ]}
        />

        {a.error && (
          <div className="flex items-center gap-2 text-xs text-destructive border border-destructive/30 bg-destructive/5 rounded-lg p-3">
            <AlertCircle className="h-4 w-4" /> {a.error.message}
          </div>
        )}

        <KpiGrid>
          <KpiTile label="Ingresos" value={money(a.kpis.revenue)} icon={DollarSign} accentIndex={0}
            current={a.kpis.revenue} previous={range.compare ? a.kpis.prevRevenue : undefined}
            hint={range.compare ? "vs período anterior" : range.label} series={revenueSeries} />
          <KpiTile label="Transacciones" value={String(a.kpis.tx)} icon={ShoppingCart} accentIndex={1}
            current={a.kpis.tx} previous={range.compare ? a.kpis.prevTx : undefined}
            hint={`${a.kpis.skus} SKU distintos`} series={a.timeseries.map((p) => p.tx)} />
          <KpiTile label="Ticket promedio" value={money(a.kpis.avgTicket)} icon={TrendingUp} accentIndex={2}
            current={a.kpis.avgTicket} previous={range.compare ? a.kpis.prevAvgTicket : undefined}
            series={a.timeseries.map((p) => p.avgTicket)} />
          <KpiTile label="Margen bruto" value={`${a.kpis.margin.toFixed(1)}%`} icon={Percent} accentIndex={4}
            hint={`${money(a.kpis.grossProfit)} de utilidad`} />
        </KpiGrid>

        <KpiGrid>
          <KpiTile label="Unidades vendidas" value={String(a.kpis.units)} icon={Package} accentIndex={1} />
          <KpiTile label="Clientes únicos" value={String(a.kpis.uniqueCustomers)} icon={Users} accentIndex={3}
            current={a.kpis.uniqueCustomers} previous={range.compare ? a.kpis.prevUniqueCustomers : undefined} />
          <KpiTile label="Impuestos" value={money(a.kpis.tax)} icon={Percent} accentIndex={2} />
          <KpiTile label="Pendiente de cobro" value={money(a.kpis.pendingCollection)} icon={AlertCircle} accentIndex={5} invertDelta />
        </KpiGrid>

        <Tabs defaultValue="tendencia" className="space-y-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="tendencia">Tendencia</TabsTrigger>
            <TabsTrigger value="mix">Mix de venta</TabsTrigger>
            <TabsTrigger value="patrones">Patrones</TabsTrigger>
            <TabsTrigger value="ranking">Rankings</TabsTrigger>
          </TabsList>

          <TabsContent value="tendencia" className="space-y-4">
            <ChartCard
              title="Ingresos y transacciones"
              subtitle={`${range.label} · granularidad ${range.granularity === "day" ? "diaria" : range.granularity === "week" ? "semanal" : "mensual"}`}
              loading={a.loading}
              empty={a.timeseries.length === 0}
              height={300}
            >
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={a.timeseries}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} />
                  <YAxis yAxisId="left" tick={AXIS_TICK} tickFormatter={compactMoney} />
                  <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, n: any) => (n === "Tickets" ? v : money(Number(v)))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" name="Ingresos" dataKey="revenue" fill={colorAt(0)} radius={[4, 4, 0, 0]} />
                  {range.compare && (
                    <Line yAxisId="left" name="Período anterior" type="monotone" dataKey="prevRevenue" stroke={colorAt(3)} strokeWidth={2} strokeDasharray="4 4" dot={false} />
                  )}
                  <Line yAxisId="right" name="Tickets" type="monotone" dataKey="tx" stroke={colorAt(1)} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Ingresos acumulados" subtitle="Curva de crecimiento del período" loading={a.loading} empty={a.timeseries.length === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={a.timeseries}>
                    <defs>
                      <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colorAt(0)} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={colorAt(0)} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="label" tick={AXIS_TICK} />
                    <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                    <Area type="monotone" dataKey="cumulative" stroke={colorAt(0)} strokeWidth={2} fill="url(#cumGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Ticket promedio por período" loading={a.loading} empty={a.timeseries.length === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={a.timeseries}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="label" tick={AXIS_TICK} />
                    <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                    <Area type="monotone" dataKey="avgTicket" stroke={colorAt(2)} fill={colorAt(2)} fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </TabsContent>

          <TabsContent value="mix" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ChartCard title="Por categoría" subtitle="Participación en ingresos" loading={a.loading} empty={a.byCategory.length === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={a.byCategory.slice(0, 6)} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
                      {a.byCategory.slice(0, 6).map((_, i) => <Cell key={i} fill={colorAt(i)} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Métodos de pago" subtitle="Importe en moneda base" loading={a.loading} empty={a.byMethod.length === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <RadialBarChart data={a.byMethod.slice(0, 6).map((m, i) => ({ ...m, fill: colorAt(i) }))} innerRadius="30%" outerRadius="100%">
                    <RadialBar dataKey="value" background cornerRadius={4} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Por tienda" subtitle="Ingresos del período" loading={a.loading} empty={a.byStore.length === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={a.byStore.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis type="number" tick={AXIS_TICK} tickFormatter={compactMoney} />
                    <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={90} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                    <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                      {a.byStore.slice(0, 8).map((_, i) => <Cell key={i} fill={colorAt(i)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <AnalyticsTable
              title="Rentabilidad por producto"
              rows={a.topProducts}
              loading={a.loading}
              filename="rentabilidad-productos"
              searchKeys={(r) => r.name}
              initialSort={{ key: "revenue", desc: true }}
              columns={[
                { key: "name", label: "Producto", sortValue: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span>, exportValue: (r) => r.name },
                { key: "qty", label: "Unidades", align: "right", sortValue: (r) => r.qty, render: (r) => r.qty, exportValue: (r) => r.qty },
                { key: "revenue", label: "Ingresos", align: "right", sortValue: (r) => r.revenue, render: (r) => <span className="font-semibold">{money(r.revenue)}</span>, exportValue: (r) => r.revenue.toFixed(2) },
                { key: "cost", label: "Costo", align: "right", sortValue: (r) => r.cost, render: (r) => money(r.cost), exportValue: (r) => r.cost.toFixed(2) },
                { key: "profit", label: "Utilidad", align: "right", sortValue: (r) => r.profit, render: (r) => <span className={r.profit >= 0 ? "text-success font-semibold" : "text-destructive font-semibold"}>{money(r.profit)}</span>, exportValue: (r) => r.profit.toFixed(2) },
                { key: "margin", label: "Margen", align: "right", sortValue: (r) => r.margin, render: (r) => <Badge variant={r.margin >= 30 ? "default" : r.margin >= 10 ? "secondary" : "destructive"}>{r.margin.toFixed(1)}%</Badge>, exportValue: (r) => r.margin.toFixed(1) },
              ]}
            />
          </TabsContent>

          <TabsContent value="patrones" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Ventas por hora" subtitle="Identifica las horas punta" loading={a.loading} empty={a.kpis.tx === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={a.byHour}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 9 }} interval={1} />
                    <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                    <Bar dataKey="revenue" fill={colorAt(1)} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Ventas por día de la semana" loading={a.loading} empty={a.kpis.tx === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={a.byWeekday}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="label" tick={AXIS_TICK} />
                    <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                    <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                      {a.byWeekday.map((_, i) => <Cell key={i} fill={colorAt(i)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <AnalyticsTable
              title="Detalle por hora"
              rows={a.byHour.filter((h) => h.tx > 0)}
              loading={a.loading}
              filename="ventas-por-hora"
              initialSort={{ key: "revenue", desc: true }}
              columns={[
                { key: "label", label: "Hora", sortValue: (r) => r.hour, render: (r) => <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" />{r.label}</span>, exportValue: (r) => r.label },
                { key: "tx", label: "Tickets", align: "right", sortValue: (r) => r.tx, render: (r) => r.tx, exportValue: (r) => r.tx },
                { key: "revenue", label: "Ingresos", align: "right", sortValue: (r) => r.revenue, render: (r) => <span className="font-semibold">{money(r.revenue)}</span>, exportValue: (r) => r.revenue.toFixed(2) },
                { key: "avg", label: "Ticket medio", align: "right", sortValue: (r) => (r.tx ? r.revenue / r.tx : 0), render: (r) => money(r.tx ? r.revenue / r.tx : 0), exportValue: (r) => (r.tx ? r.revenue / r.tx : 0).toFixed(2) },
              ]}
            />
          </TabsContent>

          <TabsContent value="ranking" className="space-y-4">
            <AnalyticsTable
              title="Desempeño por empleado"
              rows={a.byEmployee}
              loading={a.loading}
              filename="ventas-empleado"
              searchKeys={(r) => r.name}
              initialSort={{ key: "revenue", desc: true }}
              columns={[
                { key: "name", label: "Empleado", sortValue: (r) => r.name, render: (r) => r.name, exportValue: (r) => r.name },
                { key: "tx", label: "Tickets", align: "right", sortValue: (r) => r.tx, render: (r) => r.tx, exportValue: (r) => r.tx },
                { key: "revenue", label: "Ingresos", align: "right", sortValue: (r) => r.revenue, render: (r) => <span className="font-semibold">{money(r.revenue)}</span>, exportValue: (r) => r.revenue.toFixed(2) },
                { key: "avgTicket", label: "Ticket medio", align: "right", sortValue: (r) => r.avgTicket, render: (r) => money(r.avgTicket), exportValue: (r) => r.avgTicket.toFixed(2) },
              ]}
            />

            <AnalyticsTable
              title="Mejores clientes"
              rows={a.byCustomer}
              loading={a.loading}
              filename="top-clientes"
              searchKeys={(r) => r.name}
              initialSort={{ key: "revenue", desc: true }}
              columns={[
                { key: "name", label: "Cliente", sortValue: (r) => r.name, render: (r) => r.name, exportValue: (r) => r.name },
                { key: "tx", label: "Compras", align: "right", sortValue: (r) => r.tx, render: (r) => r.tx, exportValue: (r) => r.tx },
                { key: "revenue", label: "Total", align: "right", sortValue: (r) => r.revenue, render: (r) => <span className="font-semibold">{money(r.revenue)}</span>, exportValue: (r) => r.revenue.toFixed(2) },
                { key: "avgTicket", label: "Ticket medio", align: "right", sortValue: (r) => r.avgTicket, render: (r) => money(r.avgTicket), exportValue: (r) => r.avgTicket.toFixed(2) },
                { key: "last", label: "Última compra", sortValue: (r) => r.last, render: (r) => new Date(r.last).toLocaleDateString("es"), exportValue: (r) => new Date(r.last).toLocaleDateString("es") },
              ]}
            />

            <AnalyticsTable
              title="Ingresos por tienda"
              rows={a.byStore}
              loading={a.loading}
              filename="ventas-tienda"
              searchKeys={(r) => r.name}
              initialSort={{ key: "revenue", desc: true }}
              columns={[
                { key: "name", label: "Tienda", sortValue: (r) => r.name, render: (r) => <span className="inline-flex items-center gap-1"><Store className="h-3 w-3 text-muted-foreground" />{r.name}</span>, exportValue: (r) => r.name },
                { key: "tx", label: "Tickets", align: "right", sortValue: (r) => r.tx, render: (r) => r.tx, exportValue: (r) => r.tx },
                { key: "revenue", label: "Ingresos", align: "right", sortValue: (r) => r.revenue, render: (r) => <span className="font-semibold">{money(r.revenue)}</span>, exportValue: (r) => r.revenue.toFixed(2) },
              ]}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Analytics;
