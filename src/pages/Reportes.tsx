import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MiniStatCard, StatRow } from "@/components/data/MiniStatCard";
import { ExportButton } from "@/components/data/ExportButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { DollarSign, TrendingUp, TrendingDown, Package, Users, ShoppingCart, AlertTriangle } from "lucide-react";

type Sale = { id: string; total: number; subtotal: number; tax: number; created_at: string; customer_id: string | null; employee_id: string | null; status: string };
type SaleItem = { sale_id: string; product_id: string | null; product_name: string; qty: number; price: number; total: number; created_at: string };
type SalePayment = { sale_id: string; method: string; amount_in_base: number };
type Purchase = { total: number; created_at: string; status: string };

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function Reportes() {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stockData, setStockData] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    const f = startOfDay(new Date(from)).toISOString();
    const t = endOfDay(new Date(to)).toISOString();
    (async () => {
      const [s, p, pu, st, cu, em] = await Promise.all([
        supabase.from("sales").select("id,total,subtotal,tax,created_at,customer_id,employee_id,status").eq("tenant_id", tenantId).gte("created_at", f).lte("created_at", t).in("status", ["paid", "partial"]),
        supabase.from("sale_payments").select("sale_id,method,amount_in_base,created_at").gte("created_at", f).lte("created_at", t),
        supabase.from("purchases").select("total,created_at,status").eq("tenant_id", tenantId).gte("created_at", f).lte("created_at", t),
        supabase.from("product_stock").select("product_id,stock,products(name,sku,price,cost,category,min_stock)").eq("tenant_id", tenantId),
        supabase.from("customers").select("id,name,total_spent,visits_count,loyalty_points,loyalty_tier,balance,updated_at").eq("tenant_id", tenantId),
        supabase.from("employees").select("id,name").eq("tenant_id", tenantId),
      ]);
      const saleIds = (s.data || []).map((x: any) => x.id);
      let it: any[] = [];
      if (saleIds.length) {
        const { data } = await supabase.from("sale_items").select("sale_id,product_id,product_name,qty,price,total,created_at").in("sale_id", saleIds);
        it = data || [];
      }
      setSales((s.data as any) || []);
      setItems(it);
      setPayments(((p.data as any) || []).filter((x: any) => saleIds.includes(x.sale_id)));
      setPurchases((pu.data as any) || []);
      setStockData((st.data as any) || []);
      setCustomers((cu.data as any) || []);
      setEmployees((em.data as any) || []);
    })();
  }, [tenantId, from, to]);

  // KPIs
  const totalSales = sales.reduce((a, s) => a + Number(s.total), 0);
  const totalTax = sales.reduce((a, s) => a + Number(s.tax || 0), 0);
  const txCount = sales.length;
  const avgTicket = txCount ? totalSales / txCount : 0;
  const totalPurchases = purchases.filter(p => p.status === "received").reduce((a, p) => a + Number(p.total), 0);
  const cogs = items.reduce((a, i) => {
    const sd = stockData.find((x: any) => x.product_id === i.product_id);
    return a + Number(i.qty) * Number(sd?.products?.cost || 0);
  }, 0);
  const grossProfit = totalSales - cogs;
  const margin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

  // Sales by day
  const salesByDay = useMemo(() => {
    const map: Record<string, { date: string; total: number; tx: number }> = {};
    sales.forEach((s) => {
      const d = format(new Date(s.created_at), "dd/MM");
      if (!map[d]) map[d] = { date: d, total: 0, tx: 0 };
      map[d].total += Number(s.total);
      map[d].tx += 1;
    });
    return Object.values(map);
  }, [sales]);

  // Top products
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; total: number }> = {};
    items.forEach((i) => {
      const k = i.product_name;
      if (!map[k]) map[k] = { name: k, qty: 0, total: 0 };
      map[k].qty += Number(i.qty);
      map[k].total += Number(i.total);
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 20);
  }, [items]);

  // Sales by employee
  const salesByEmployee = useMemo(() => {
    const map: Record<string, { name: string; total: number; tx: number }> = {};
    sales.forEach((s) => {
      const emp = employees.find((e) => e.id === s.employee_id);
      const name = emp?.name || "Sin asignar";
      if (!map[name]) map[name] = { name, total: 0, tx: 0 };
      map[name].total += Number(s.total);
      map[name].tx += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [sales, employees]);

  // Sales by payment method
  const byMethod = useMemo(() => {
    const map: Record<string, { method: string; total: number }> = {};
    payments.forEach((p) => {
      if (!map[p.method]) map[p.method] = { method: p.method, total: 0 };
      map[p.method].total += Number(p.amount_in_base);
    });
    return Object.values(map);
  }, [payments]);

  // Inventory
  const invValue = stockData.reduce((a: number, s: any) => a + Number(s.stock) * Number(s.products?.cost || 0), 0);
  const lowStock = stockData.filter((s: any) => Number(s.stock) <= Number(s.products?.min_stock || 0) && Number(s.products?.min_stock || 0) > 0);
  const outStock = stockData.filter((s: any) => Number(s.stock) <= 0);

  const productMovement = useMemo(() => {
    const sold = new Set(items.map((i) => i.product_id));
    return stockData.map((s: any) => ({
      sku: s.products?.sku, name: s.products?.name, stock: s.stock,
      cost: s.products?.cost, value: Number(s.stock) * Number(s.products?.cost || 0),
      moved: sold.has(s.product_id),
    }));
  }, [stockData, items]);

  // ABC analysis
  const abc = useMemo(() => {
    const sorted = [...topProducts].sort((a, b) => b.total - a.total);
    const total = sorted.reduce((a, p) => a + p.total, 0);
    let acc = 0;
    return sorted.map((p) => {
      acc += p.total;
      const pct = total > 0 ? (acc / total) * 100 : 0;
      const cls = pct <= 80 ? "A" : pct <= 95 ? "B" : "C";
      return { ...p, pct, class: cls };
    });
  }, [topProducts]);

  // Top customers
  const customerSales = useMemo(() => {
    const map: Record<string, { id: string; name: string; total: number; tx: number; lastDate: string }> = {};
    sales.forEach((s) => {
      if (!s.customer_id) return;
      const c = customers.find((x) => x.id === s.customer_id);
      const name = c?.name || "—";
      if (!map[s.customer_id]) map[s.customer_id] = { id: s.customer_id, name, total: 0, tx: 0, lastDate: s.created_at };
      map[s.customer_id].total += Number(s.total);
      map[s.customer_id].tx += 1;
      if (s.created_at > map[s.customer_id].lastDate) map[s.customer_id].lastDate = s.created_at;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [sales, customers]);

  const inactive = customers.filter((c) => !customerSales.find((cs) => cs.id === c.id));

  return (
    <AppLayout title={t("nav.items.reports")}>
      <div className="space-y-4">
        <Card className="p-3 flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-xs" />
          </div>
          <div className="flex gap-2 ml-auto">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => { setFrom(format(subDays(new Date(), d), "yyyy-MM-dd")); setTo(format(new Date(), "yyyy-MM-dd")); }}
                className="text-xs px-3 py-1 rounded border hover:bg-muted">Últimos {d}d</button>
            ))}
          </div>
        </Card>

        <Tabs defaultValue="ventas" className="space-y-4">
          <TabsList>
            <TabsTrigger value="ventas">Ventas</TabsTrigger>
            <TabsTrigger value="financiero">Financiero</TabsTrigger>
            <TabsTrigger value="inventario">Inventario</TabsTrigger>
            <TabsTrigger value="clientes">Clientes</TabsTrigger>
          </TabsList>

          <TabsContent value="ventas" className="space-y-4">
            <StatRow>
              <MiniStatCard label="Ventas totales" value={`$${totalSales.toLocaleString()}`} icon={DollarSign} tone="success" />
              <MiniStatCard label="Transacciones" value={txCount} icon={ShoppingCart} tone="primary" />
              <MiniStatCard label="Ticket promedio" value={`$${avgTicket.toFixed(2)}`} icon={TrendingUp} />
              <MiniStatCard label="Impuestos" value={`$${totalTax.toFixed(2)}`} />
            </StatRow>

            <Card className="p-4">
              <h3 className="font-heading font-semibold mb-3">Ventas por día</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={salesByDay}>
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-heading font-semibold">Top productos</h3>
                  <ExportButton rows={topProducts} filename="top-productos" title="Top productos"
                    columns={[{ key: "name", label: "Producto" }, { key: "qty", label: "Cantidad" }, { key: "total", label: "Total" }]} />
                </div>
                <Table>
                  <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {topProducts.slice(0, 10).map((p) => (
                      <TableRow key={p.name}><TableCell className="text-xs">{p.name}</TableCell><TableCell className="text-right text-xs">{p.qty}</TableCell><TableCell className="text-right text-xs font-bold">${p.total.toFixed(2)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
              <Card className="p-4">
                <h3 className="font-heading font-semibold mb-3">Por método de pago</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={byMethod} dataKey="total" nameKey="method" cx="50%" cy="50%" outerRadius={80} label={(e: any) => `${e.method}: $${e.total.toFixed(0)}`}>
                      {byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold">Por empleado</h3>
                <ExportButton rows={salesByEmployee} filename="ventas-empleado" title="Ventas por empleado"
                  columns={[{ key: "name", label: "Empleado" }, { key: "tx", label: "Tickets" }, { key: "total", label: "Total" }]} />
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Empleado</TableHead><TableHead className="text-right">Tickets</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>{salesByEmployee.map((e) => (
                  <TableRow key={e.name}><TableCell className="text-xs">{e.name}</TableCell><TableCell className="text-right text-xs">{e.tx}</TableCell><TableCell className="text-right text-xs font-bold">${e.total.toFixed(2)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="financiero" className="space-y-4">
            <StatRow>
              <MiniStatCard label="Ingresos" value={`$${totalSales.toLocaleString()}`} icon={DollarSign} tone="success" />
              <MiniStatCard label="COGS estimado" value={`$${cogs.toLocaleString()}`} icon={Package} />
              <MiniStatCard label="Margen bruto" value={`$${grossProfit.toLocaleString()}`} tone={grossProfit > 0 ? "success" : "destructive"} />
              <MiniStatCard label="% Margen" value={`${margin.toFixed(1)}%`} tone={margin > 30 ? "success" : margin > 10 ? "warning" : "destructive"} icon={TrendingUp} />
            </StatRow>
            <Card className="p-4">
              <h3 className="font-heading font-semibold mb-3">P&amp;L Simplificado</h3>
              <Table>
                <TableBody>
                  <TableRow><TableCell>Ingresos por ventas</TableCell><TableCell className="text-right font-bold">${totalSales.toFixed(2)}</TableCell></TableRow>
                  <TableRow><TableCell>(-) Costo de mercancía vendida</TableCell><TableCell className="text-right">${cogs.toFixed(2)}</TableCell></TableRow>
                  <TableRow className="border-t-2"><TableCell className="font-bold">= Margen bruto</TableCell><TableCell className="text-right font-bold text-emerald-500">${grossProfit.toFixed(2)}</TableCell></TableRow>
                  <TableRow><TableCell>(+) Compras del período</TableCell><TableCell className="text-right">${totalPurchases.toFixed(2)}</TableCell></TableRow>
                  <TableRow><TableCell>(+) Impuestos cobrados</TableCell><TableCell className="text-right">${totalTax.toFixed(2)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </Card>
            <Card className="p-4">
              <h3 className="font-heading font-semibold mb-3">Flujo de caja diario</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={salesByDay}>
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="inventario" className="space-y-4">
            <StatRow>
              <MiniStatCard label="Productos" value={stockData.length} icon={Package} tone="primary" />
              <MiniStatCard label="Valor inventario" value={`$${invValue.toLocaleString()}`} icon={DollarSign} tone="success" />
              <MiniStatCard label="Stock bajo" value={lowStock.length} icon={TrendingDown} tone={lowStock.length > 0 ? "warning" : "default"} />
              <MiniStatCard label="Sin stock" value={outStock.length} icon={AlertTriangle} tone={outStock.length > 0 ? "destructive" : "default"} />
            </StatRow>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold">Análisis ABC</h3>
                <ExportButton rows={abc} filename="abc" title="Análisis ABC" columns={[
                  { key: "name", label: "Producto" }, { key: "qty", label: "Qty" },
                  { key: "total", label: "Ventas" }, { key: "pct", label: "% acum", format: (r) => r.pct.toFixed(1) },
                  { key: "class", label: "Clase" }]} />
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Ventas</TableHead><TableHead className="text-right">% acum.</TableHead><TableHead>Clase</TableHead></TableRow></TableHeader>
                <TableBody>{abc.slice(0, 25).map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="text-xs">{p.name}</TableCell>
                    <TableCell className="text-right text-xs font-bold">${p.total.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-xs">{p.pct.toFixed(1)}%</TableCell>
                    <TableCell><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${p.class === "A" ? "bg-emerald-500/20 text-emerald-500" : p.class === "B" ? "bg-amber-500/20 text-amber-500" : "bg-muted"}`}>{p.class}</span></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold">Sin movimiento en período</h3>
                <ExportButton rows={productMovement.filter((p) => !p.moved && p.stock > 0)} filename="sin-movimiento" title="Productos sin movimiento"
                  columns={[{ key: "sku", label: "SKU" }, { key: "name", label: "Producto" }, { key: "stock", label: "Stock" }, { key: "value", label: "Valor" }]} />
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Producto</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Valor inmovilizado</TableHead></TableRow></TableHeader>
                <TableBody>{productMovement.filter((p) => !p.moved && p.stock > 0).slice(0, 25).map((p) => (
                  <TableRow key={p.sku}><TableCell className="text-xs">{p.sku}</TableCell><TableCell className="text-xs">{p.name}</TableCell><TableCell className="text-right text-xs">{p.stock}</TableCell><TableCell className="text-right text-xs">${p.value.toFixed(2)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="clientes" className="space-y-4">
            <StatRow>
              <MiniStatCard label="Clientes" value={customers.length} icon={Users} tone="primary" />
              <MiniStatCard label="Activos en período" value={customerSales.length} icon={TrendingUp} tone="success" />
              <MiniStatCard label="Inactivos" value={inactive.length} icon={TrendingDown} tone={inactive.length > 0 ? "warning" : "default"} />
              <MiniStatCard label="Ticket promedio" value={`$${avgTicket.toFixed(2)}`} icon={DollarSign} />
            </StatRow>
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold">Top clientes</h3>
                <ExportButton rows={customerSales} filename="top-clientes" title="Top clientes"
                  columns={[{ key: "name", label: "Cliente" }, { key: "tx", label: "Compras" }, { key: "total", label: "Total" }, { key: "lastDate", label: "Última compra", format: (r) => format(new Date(r.lastDate), "dd/MM/yyyy") }]} />
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Compras</TableHead><TableHead className="text-right">Total gastado</TableHead><TableHead>Última visita</TableHead></TableRow></TableHeader>
                <TableBody>{customerSales.slice(0, 25).map((c) => (
                  <TableRow key={c.id}><TableCell className="text-xs">{c.name}</TableCell><TableCell className="text-right text-xs">{c.tx}</TableCell><TableCell className="text-right text-xs font-bold">${c.total.toFixed(2)}</TableCell><TableCell className="text-xs text-muted-foreground">{format(new Date(c.lastDate), "dd/MM/yy")}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </Card>
            <Card className="p-4">
              <h3 className="font-heading font-semibold mb-3">Clientes inactivos en período</h3>
              <Table>
                <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Histórico</TableHead><TableHead>Nivel</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
                <TableBody>{inactive.slice(0, 25).map((c) => (
                  <TableRow key={c.id}><TableCell className="text-xs">{c.name}</TableCell><TableCell className="text-right text-xs">${Number(c.total_spent || 0).toFixed(2)}</TableCell><TableCell className="text-xs capitalize">{c.loyalty_tier}</TableCell><TableCell className="text-right text-xs">${Number(c.balance || 0).toFixed(2)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
