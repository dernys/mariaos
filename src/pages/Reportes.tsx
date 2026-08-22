import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, DollarSign, Package, Percent, ShoppingCart, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import { useAnalyticsRange } from "@/hooks/useAnalyticsRange";
import { useSalesAnalytics } from "@/hooks/useSalesAnalytics";
import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import { ChartCard } from "@/components/analytics/ChartCard";
import { KpiGrid, KpiTile } from "@/components/analytics/KpiTile";
import { AnalyticsTable } from "@/components/analytics/AnalyticsTable";
import { PaymentMethodsPanel } from "@/components/reports/PaymentMethodsPanel";

import {
  AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE, colorAt, compactMoney, formatMoney,
} from "@/lib/analytics/chartTheme";

const ALL = "__all__";

export default function Reportes() {
  const { t } = useTranslation();
  const range = useAnalyticsRange("30d");
  const [storeId, setStoreId] = useState(ALL);
  const [employeeId, setEmployeeId] = useState(ALL);
  const [customerId, setCustomerId] = useState(ALL);
  const a = useSalesAnalytics(range, { storeId, employeeId, customerId });
  const money = (n: number) => formatMoney(n);

  const inactiveCustomers = a.customers.filter((c) => !a.byCustomer.some((cs) => cs.id === c.id));

  return (
    <AppLayout title={t("nav.items.reports")}>
      <div className="space-y-4">
        <AnalyticsFilterBar
          range={range}
          onRefresh={a.refetch}
          refreshing={a.fetching}
          filters={[
            { key: "store", label: "Tienda", value: storeId, onChange: setStoreId, options: a.stores.map((s) => ({ value: s.id, label: s.name })) },
            { key: "employee", label: "Empleado", value: employeeId, onChange: setEmployeeId, options: a.employees.map((e) => ({ value: e.id, label: e.name })) },
            { key: "customer", label: "Cliente", value: customerId, onChange: setCustomerId, options: a.customers.map((c) => ({ value: c.id, label: c.name })) },
          ]}
        />

        <Tabs defaultValue="ventas" className="space-y-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="ventas">Ventas</TabsTrigger>
            <TabsTrigger value="pagos">Medios de pago</TabsTrigger>
            <TabsTrigger value="financiero">Financiero</TabsTrigger>
            <TabsTrigger value="inventario">Inventario</TabsTrigger>
            <TabsTrigger value="clientes">Clientes</TabsTrigger>

          </TabsList>

          {/* ---------------- VENTAS ---------------- */}
          <TabsContent value="ventas" className="space-y-4">
            <KpiGrid>
              <KpiTile label="Ventas totales" value={money(a.kpis.revenue)} icon={DollarSign} accentIndex={0}
                current={a.kpis.revenue} previous={range.compare ? a.kpis.prevRevenue : undefined}
                series={a.timeseries.map((p) => p.revenue)} />
              <KpiTile label="Transacciones" value={String(a.kpis.tx)} icon={ShoppingCart} accentIndex={1}
                current={a.kpis.tx} previous={range.compare ? a.kpis.prevTx : undefined} />
              <KpiTile label="Ticket promedio" value={money(a.kpis.avgTicket)} icon={TrendingUp} accentIndex={2}
                current={a.kpis.avgTicket} previous={range.compare ? a.kpis.prevAvgTicket : undefined} />
              <KpiTile label="Impuestos" value={money(a.kpis.tax)} icon={Percent} accentIndex={3} />
            </KpiGrid>

            <ChartCard title="Evolución de ventas" subtitle={`${range.label} · ${a.kpis.tx} tickets`} loading={a.loading} empty={a.timeseries.length === 0} height={280}>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={a.timeseries}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area name="Ingresos" type="monotone" dataKey="revenue" stroke={colorAt(0)} fill={colorAt(0)} fillOpacity={0.15} strokeWidth={2} />
                  {range.compare && (
                    <Line name="Período anterior" type="monotone" dataKey="prevRevenue" stroke={colorAt(3)} strokeDasharray="4 4" strokeWidth={2} dot={false} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Métodos de pago" subtitle="Importes en moneda base" loading={a.loading} empty={a.byMethod.length === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={a.byMethod} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
                      {a.byMethod.map((_, i) => <Cell key={i} fill={colorAt(i)} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
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
              title="Top productos"
              rows={a.topProducts}
              loading={a.loading}
              filename="top-productos"
              searchKeys={(r) => r.name}
              initialSort={{ key: "revenue", desc: true }}
              columns={[
                { key: "name", label: "Producto", sortValue: (r) => r.name, render: (r) => r.name, exportValue: (r) => r.name },
                { key: "qty", label: "Unidades", align: "right", sortValue: (r) => r.qty, render: (r) => r.qty, exportValue: (r) => r.qty },
                { key: "revenue", label: "Ingresos", align: "right", sortValue: (r) => r.revenue, render: (r) => <span className="font-semibold">{money(r.revenue)}</span>, exportValue: (r) => r.revenue.toFixed(2) },
                { key: "margin", label: "Margen", align: "right", sortValue: (r) => r.margin, render: (r) => `${r.margin.toFixed(1)}%`, exportValue: (r) => r.margin.toFixed(1) },
              ]}
            />

            <AnalyticsTable
              title="Ventas por empleado"
              rows={a.byEmployee}
              loading={a.loading}
              filename="ventas-empleado"
              searchKeys={(r) => r.name}
              initialSort={{ key: "revenue", desc: true }}
              columns={[
                { key: "name", label: "Empleado", sortValue: (r) => r.name, render: (r) => r.name, exportValue: (r) => r.name },
                { key: "tx", label: "Tickets", align: "right", sortValue: (r) => r.tx, render: (r) => r.tx, exportValue: (r) => r.tx },
                { key: "revenue", label: "Total", align: "right", sortValue: (r) => r.revenue, render: (r) => <span className="font-semibold">{money(r.revenue)}</span>, exportValue: (r) => r.revenue.toFixed(2) },
                { key: "avgTicket", label: "Ticket medio", align: "right", sortValue: (r) => r.avgTicket, render: (r) => money(r.avgTicket), exportValue: (r) => r.avgTicket.toFixed(2) },
              ]}
            />
          </TabsContent>

          {/* ---------------- MEDIOS DE PAGO ---------------- */}
          <TabsContent value="pagos" className="space-y-4">
            <PaymentMethodsPanel from={range.from} to={range.to} />
          </TabsContent>



          {/* ---------------- FINANCIERO ---------------- */}
          <TabsContent value="financiero" className="space-y-4">
            <KpiGrid>
              <KpiTile label="Ingresos" value={money(a.kpis.revenue)} icon={DollarSign} accentIndex={0}
                current={a.kpis.revenue} previous={range.compare ? a.kpis.prevRevenue : undefined} />
              <KpiTile label="COGS estimado" value={money(a.kpis.cogs)} icon={Package} accentIndex={2} />
              <KpiTile label="Utilidad bruta" value={money(a.kpis.grossProfit)} icon={TrendingUp} accentIndex={4} />
              <KpiTile label="% Margen" value={`${a.kpis.margin.toFixed(1)}%`} icon={Percent} accentIndex={1} />
            </KpiGrid>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Estado de resultados simplificado" subtitle="Derivado de ventas e inventario del período" loading={a.loading} height={220}>
                <Table>
                  <TableBody className="text-xs">
                    <TableRow><TableCell>Ingresos por ventas</TableCell><TableCell className="text-right font-semibold">{money(a.kpis.revenue)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground">(-) Impuestos incluidos</TableCell><TableCell className="text-right">{money(a.kpis.tax)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground">(-) Costo de mercancía vendida</TableCell><TableCell className="text-right">{money(a.kpis.cogs)}</TableCell></TableRow>
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold">= Utilidad bruta</TableCell>
                      <TableCell className={`text-right font-bold ${a.kpis.grossProfit >= 0 ? "text-success" : "text-destructive"}`}>{money(a.kpis.grossProfit)}</TableCell>
                    </TableRow>
                    <TableRow><TableCell className="text-muted-foreground">Compras recibidas del período</TableCell><TableCell className="text-right">{money(a.purchaseTotals.received)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground">Compras pendientes</TableCell><TableCell className="text-right">{money(a.purchaseTotals.pending)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground">Pendiente de cobro (fiado)</TableCell><TableCell className="text-right">{money(a.kpis.pendingCollection)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </ChartCard>

              <ChartCard title="Flujo de ingresos" subtitle="Acumulado del período" loading={a.loading} empty={a.timeseries.length === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={a.timeseries}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="label" tick={AXIS_TICK} />
                    <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                    <Area type="monotone" dataKey="cumulative" stroke={colorAt(0)} fill={colorAt(0)} fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <AnalyticsTable
              title="Margen por producto"
              rows={a.topProducts}
              loading={a.loading}
              filename="margen-producto"
              searchKeys={(r) => r.name}
              initialSort={{ key: "profit", desc: true }}
              columns={[
                { key: "name", label: "Producto", sortValue: (r) => r.name, render: (r) => r.name, exportValue: (r) => r.name },
                { key: "revenue", label: "Ingresos", align: "right", sortValue: (r) => r.revenue, render: (r) => money(r.revenue), exportValue: (r) => r.revenue.toFixed(2) },
                { key: "cost", label: "Costo", align: "right", sortValue: (r) => r.cost, render: (r) => money(r.cost), exportValue: (r) => r.cost.toFixed(2) },
                { key: "profit", label: "Utilidad", align: "right", sortValue: (r) => r.profit, render: (r) => <span className={r.profit >= 0 ? "text-success font-semibold" : "text-destructive font-semibold"}>{money(r.profit)}</span>, exportValue: (r) => r.profit.toFixed(2) },
                { key: "margin", label: "Margen", align: "right", sortValue: (r) => r.margin, render: (r) => <Badge variant={r.margin >= 30 ? "default" : r.margin >= 10 ? "secondary" : "destructive"}>{r.margin.toFixed(1)}%</Badge>, exportValue: (r) => r.margin.toFixed(1) },
              ]}
            />
          </TabsContent>

          {/* ---------------- INVENTARIO ---------------- */}
          <TabsContent value="inventario" className="space-y-4">
            <KpiGrid>
              <KpiTile label="Productos" value={String(a.inventory.list.length)} icon={Package} accentIndex={1} />
              <KpiTile label="Valor inventario" value={money(a.inventory.value)} icon={DollarSign} accentIndex={0} />
              <KpiTile label="Stock bajo" value={String(a.inventory.low.length)} icon={TrendingDown} accentIndex={2} />
              <KpiTile label="Sin stock" value={String(a.inventory.out.length)} icon={AlertTriangle} accentIndex={5} />
            </KpiGrid>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Clasificación ABC" subtitle="Concentración de ingresos por producto" loading={a.loading} empty={a.abc.length === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={a.abc.slice(0, 20)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 9 }} hide />
                    <YAxis yAxisId="l" tick={AXIS_TICK} tickFormatter={compactMoney} />
                    <YAxis yAxisId="r" orientation="right" tick={AXIS_TICK} unit="%" domain={[0, 100]} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, n: any) => (n === "% acumulado" ? `${Number(v).toFixed(1)}%` : money(Number(v)))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="l" name="Ingresos" dataKey="revenue" fill={colorAt(0)} radius={[3, 3, 0, 0]} />
                    <Line yAxisId="r" name="% acumulado" type="monotone" dataKey="cumulative" stroke={colorAt(2)} strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Rotación e inmovilizado" subtitle="Indicadores clave de inventario" loading={a.loading} height={240}>
                <div className="grid grid-cols-2 gap-3 h-full content-center">
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Rotación estimada</p>
                    <p className="text-xl font-heading font-bold">{a.inventory.rotation.toFixed(2)}x</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Valor inmovilizado</p>
                    <p className="text-xl font-heading font-bold">{money(a.inventory.idle.reduce((s, p) => s + p.value, 0))}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Sin movimiento</p>
                    <p className="text-xl font-heading font-bold">{a.inventory.idle.length}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] uppercase text-muted-foreground">Unidades vendidas</p>
                    <p className="text-xl font-heading font-bold">{a.kpis.units}</p>
                  </div>
                </div>
              </ChartCard>
            </div>

            <AnalyticsTable
              title="Análisis ABC detallado"
              rows={a.abc}
              loading={a.loading}
              filename="analisis-abc"
              searchKeys={(r) => r.name}
              initialSort={{ key: "revenue", desc: true }}
              columns={[
                { key: "name", label: "Producto", sortValue: (r) => r.name, render: (r) => r.name, exportValue: (r) => r.name },
                { key: "qty", label: "Unidades", align: "right", sortValue: (r) => r.qty, render: (r) => r.qty, exportValue: (r) => r.qty },
                { key: "revenue", label: "Ingresos", align: "right", sortValue: (r) => r.revenue, render: (r) => <span className="font-semibold">{money(r.revenue)}</span>, exportValue: (r) => r.revenue.toFixed(2) },
                { key: "cumulative", label: "% acum.", align: "right", sortValue: (r) => r.cumulative, render: (r) => `${r.cumulative.toFixed(1)}%`, exportValue: (r) => r.cumulative.toFixed(1) },
                { key: "klass", label: "Clase", sortValue: (r) => r.klass, render: (r) => <Badge variant={r.klass === "A" ? "default" : r.klass === "B" ? "secondary" : "outline"}>{r.klass}</Badge>, exportValue: (r) => r.klass },
              ]}
            />

            <AnalyticsTable
              title="Productos sin movimiento en el período"
              rows={a.inventory.idle}
              loading={a.loading}
              filename="sin-movimiento"
              searchKeys={(r) => `${r.sku} ${r.name}`}
              initialSort={{ key: "value", desc: true }}
              columns={[
                { key: "sku", label: "SKU", sortValue: (r) => r.sku ?? "", render: (r) => r.sku, exportValue: (r) => r.sku ?? "" },
                { key: "name", label: "Producto", sortValue: (r) => r.name, render: (r) => r.name, exportValue: (r) => r.name },
                { key: "stock", label: "Stock", align: "right", sortValue: (r) => Number(r.stock), render: (r) => r.stock, exportValue: (r) => r.stock },
                { key: "value", label: "Valor inmovilizado", align: "right", sortValue: (r) => r.value, render: (r) => <span className="font-semibold">{money(r.value)}</span>, exportValue: (r) => r.value.toFixed(2) },
              ]}
            />

            <AnalyticsTable
              title="Alertas de reposición"
              rows={a.inventory.low}
              loading={a.loading}
              filename="stock-bajo"
              searchKeys={(r) => `${r.sku} ${r.name}`}
              initialSort={{ key: "stock", desc: false }}
              columns={[
                { key: "sku", label: "SKU", sortValue: (r) => r.sku ?? "", render: (r) => r.sku, exportValue: (r) => r.sku ?? "" },
                { key: "name", label: "Producto", sortValue: (r) => r.name, render: (r) => r.name, exportValue: (r) => r.name },
                { key: "stock", label: "Stock", align: "right", sortValue: (r) => Number(r.stock), render: (r) => <span className={Number(r.stock) <= 0 ? "text-destructive font-semibold" : "text-warning font-semibold"}>{r.stock}</span>, exportValue: (r) => r.stock },
                { key: "min_stock", label: "Mínimo", align: "right", sortValue: (r) => Number(r.min_stock), render: (r) => r.min_stock, exportValue: (r) => r.min_stock },
              ]}
            />
          </TabsContent>

          {/* ---------------- CLIENTES ---------------- */}
          <TabsContent value="clientes" className="space-y-4">
            <KpiGrid>
              <KpiTile label="Clientes registrados" value={String(a.customers.length)} icon={Users} accentIndex={1} />
              <KpiTile label="Activos en período" value={String(a.byCustomer.length)} icon={TrendingUp} accentIndex={0}
                current={a.kpis.uniqueCustomers} previous={range.compare ? a.kpis.prevUniqueCustomers : undefined} />
              <KpiTile label="Inactivos" value={String(inactiveCustomers.length)} icon={TrendingDown} accentIndex={2} invertDelta />
              <KpiTile label="Ticket promedio" value={money(a.kpis.avgTicket)} icon={DollarSign} accentIndex={3} />
            </KpiGrid>

            <ChartCard title="Concentración de clientes" subtitle="Top 10 por ingresos del período" loading={a.loading} empty={a.byCustomer.length === 0}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={a.byCustomer.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis type="number" tick={AXIS_TICK} tickFormatter={compactMoney} />
                  <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={110} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => money(Number(v))} />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                    {a.byCustomer.slice(0, 10).map((_, i) => <Cell key={i} fill={colorAt(i)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <AnalyticsTable
              title="Clientes activos"
              rows={a.byCustomer}
              loading={a.loading}
              filename="clientes-activos"
              searchKeys={(r) => r.name}
              initialSort={{ key: "revenue", desc: true }}
              columns={[
                { key: "name", label: "Cliente", sortValue: (r) => r.name, render: (r) => r.name, exportValue: (r) => r.name },
                { key: "tx", label: "Compras", align: "right", sortValue: (r) => r.tx, render: (r) => r.tx, exportValue: (r) => r.tx },
                { key: "revenue", label: "Total gastado", align: "right", sortValue: (r) => r.revenue, render: (r) => <span className="font-semibold">{money(r.revenue)}</span>, exportValue: (r) => r.revenue.toFixed(2) },
                { key: "avgTicket", label: "Ticket medio", align: "right", sortValue: (r) => r.avgTicket, render: (r) => money(r.avgTicket), exportValue: (r) => r.avgTicket.toFixed(2) },
                { key: "last", label: "Última visita", sortValue: (r) => r.last, render: (r) => new Date(r.last).toLocaleDateString("es"), exportValue: (r) => new Date(r.last).toLocaleDateString("es") },
              ]}
            />

            <AnalyticsTable
              title="Clientes inactivos en el período"
              rows={inactiveCustomers}
              loading={a.loading}
              filename="clientes-inactivos"
              searchKeys={(r) => r.name}
              initialSort={{ key: "total_spent", desc: true }}
              columns={[
                { key: "name", label: "Cliente", sortValue: (r) => r.name, render: (r) => r.name, exportValue: (r) => r.name },
                { key: "total_spent", label: "Histórico", align: "right", sortValue: (r) => Number(r.total_spent || 0), render: (r) => money(Number(r.total_spent || 0)), exportValue: (r) => Number(r.total_spent || 0).toFixed(2) },
                { key: "visits_count", label: "Visitas", align: "right", sortValue: (r) => Number(r.visits_count || 0), render: (r) => r.visits_count ?? 0, exportValue: (r) => r.visits_count ?? 0 },
                { key: "loyalty_tier", label: "Nivel", sortValue: (r) => r.loyalty_tier ?? "", render: (r) => <Badge variant="outline" className="capitalize">{r.loyalty_tier ?? "—"}</Badge>, exportValue: (r) => r.loyalty_tier ?? "" },
                { key: "balance", label: "Saldo", align: "right", sortValue: (r) => Number(r.balance || 0), render: (r) => <span className={Number(r.balance || 0) > 0 ? "text-warning font-semibold" : ""}>{money(Number(r.balance || 0))}</span>, exportValue: (r) => Number(r.balance || 0).toFixed(2) },
              ]}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
