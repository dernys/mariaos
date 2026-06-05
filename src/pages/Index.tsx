import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import {
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  ArrowUpRight,
  Clock,
  Store,
  AlertTriangle,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

interface SaleRow {
  id: string;
  total: number;
  status: string;
  created_at: string;
  store_id: string | null;
  customer_id: string | null;
}
interface ItemRow { product_id: string | null; product_name: string; qty: number; total: number; created_at: string; }
interface ProductLow { id: string; name: string; stock: number; min_stock: number; }
interface StoreRow { id: string; name: string; }
interface CustomerRow { id: string; name: string; }

const PIE_COLORS = ["hsl(160,84%,39%)", "hsl(170,70%,45%)", "hsl(217,91%,60%)", "hsl(38,92%,50%)", "hsl(280,70%,55%)"];

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtCurrency(n: number) { return `$${(n||0).toLocaleString("es-CU", { maximumFractionDigits: 2 })}`; }
function pct(part: number, total: number) { return total > 0 ? Math.round((part/total)*100) : 0; }

const Dashboard = () => {
  const tenantId = useTenant();
  const [loading, setLoading] = useState(true);
  const [salesToday, setSalesToday] = useState<SaleRow[]>([]);
  const [salesYesterday, setSalesYesterday] = useState<SaleRow[]>([]);
  const [sales7d, setSales7d] = useState<SaleRow[]>([]);
  const [items30d, setItems30d] = useState<ItemRow[]>([]);
  const [itemsToday, setItemsToday] = useState<ItemRow[]>([]);
  const [lowStock, setLowStock] = useState<ProductLow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [recent, setRecent] = useState<SaleRow[]>([]);

  const loadData = useMemo(() => async (tid: string) => {
    const today = startOfDay();
    const yesterday = addDays(today, -1);
    const sevenAgo = addDays(today, -6);
    const thirtyAgo = addDays(today, -29);

    const [salesRes, items30Res, lowRes, storesRes, custRes, recentRes] = await Promise.all([
      supabase.from("sales").select("id,total,status,created_at,store_id,customer_id")
        .eq("tenant_id", tid).gte("created_at", sevenAgo.toISOString())
        .neq("status","cancelled").order("created_at",{ascending:false}),
      supabase.from("sale_items").select("product_id,product_name,qty,total,created_at,sale:sales!inner(tenant_id,status,created_at)")
        .gte("created_at", thirtyAgo.toISOString()),
      supabase.from("products").select("id,name,stock,min_stock").eq("tenant_id", tid)
        .eq("is_active", true).gt("min_stock", 0).limit(200),
      supabase.from("stores").select("id,name").eq("tenant_id", tid),
      supabase.from("customers").select("id,name").eq("tenant_id", tid).limit(500),
      supabase.from("sales").select("id,total,status,created_at,store_id,customer_id")
        .eq("tenant_id", tid).order("created_at",{ascending:false}).limit(8),
    ]);

    const sales = (salesRes.data ?? []) as SaleRow[];
    const yest = sales.filter(s => new Date(s.created_at) >= yesterday && new Date(s.created_at) < today);
    const tod = sales.filter(s => new Date(s.created_at) >= today);
    setSales7d(sales);
    setSalesToday(tod);
    setSalesYesterday(yest);

    const allItems = ((items30Res.data ?? []) as any[]).filter(r => r.sale?.tenant_id === tid && r.sale?.status !== "cancelled");
    setItems30d(allItems);
    setItemsToday(allItems.filter(r => new Date(r.created_at) >= today));

    const low = ((lowRes.data ?? []) as ProductLow[]).filter(p => p.stock <= p.min_stock).slice(0, 6);
    setLowStock(low);
    setStores((storesRes.data ?? []) as StoreRow[]);
    setCustomers((custRes.data ?? []) as CustomerRow[]);
    setRecent((recentRes.data ?? []) as SaleRow[]);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (!alive) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { if (alive) loadData(tenantId); }, 400);
    };

    setLoading(true);
    loadData(tenantId).finally(() => { if (alive) setLoading(false); });

    // Realtime: cualquier venta, pago o movimiento de inventario refresca el dashboard
    const channel = supabase
      .channel(`dashboard:${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "account_payments", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_movements", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .subscribe();

    return () => {
      alive = false;
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [tenantId, loadData]);

  // KPIs
  const totalToday = useMemo(() => salesToday.reduce((s,x)=>s+Number(x.total||0),0), [salesToday]);
  const totalYest = useMemo(() => salesYesterday.reduce((s,x)=>s+Number(x.total||0),0), [salesYesterday]);
  const txToday = salesToday.length;
  const txYest = salesYesterday.length;
  const itemsCountToday = useMemo(() => itemsToday.reduce((s,x)=>s+Number(x.qty||0),0), [itemsToday]);
  const itemsCountYest = useMemo(() => items30d.filter(i => {
    const d = new Date(i.created_at); return d >= addDays(startOfDay(),-1) && d < startOfDay();
  }).reduce((s,x)=>s+Number(x.qty||0),0), [items30d]);
  const avgTicket = txToday > 0 ? totalToday/txToday : 0;
  const avgTicketYest = txYest > 0 ? totalYest/txYest : 0;
  const change = (a: number, b: number) => b === 0 ? (a>0?"+100%":"0%") : `${a>=b?"+":""}${(((a-b)/b)*100).toFixed(1)}%`;

  // Charts
  const weeklyData = useMemo(() => {
    const days = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
    const buckets: Record<string, number> = {};
    for (let i=6;i>=0;i--){ const d=addDays(startOfDay(),-i); buckets[d.toISOString().slice(0,10)] = 0; }
    sales7d.forEach(s => {
      const k = startOfDay(new Date(s.created_at)).toISOString().slice(0,10);
      if (k in buckets) buckets[k] += Number(s.total||0);
    });
    return Object.entries(buckets).map(([k,v]) => ({ name: days[new Date(k).getDay()], ventas: Math.round(v) }));
  }, [sales7d]);

  const hourlyData = useMemo(() => {
    const buckets = Array.from({length: 24}, (_,h) => ({ hora: `${h}h`, ventas: 0 }));
    salesToday.forEach(s => { const h = new Date(s.created_at).getHours(); buckets[h].ventas += Number(s.total||0); });
    // Trim to active range
    const first = buckets.findIndex(b => b.ventas > 0);
    const last = 23 - [...buckets].reverse().findIndex(b => b.ventas > 0);
    if (first === -1) return buckets.filter((_,i)=>i>=8 && i<=20);
    return buckets.slice(Math.max(0,first-1), Math.min(24,last+2));
  }, [salesToday]);

  const storeData = useMemo(() => {
    const m = new Map<string, number>();
    sales7d.forEach(s => { const k = s.store_id || "sin"; m.set(k, (m.get(k)||0) + Number(s.total||0)); });
    const total = [...m.values()].reduce((a,b)=>a+b,0);
    return [...m.entries()].map(([sid, val]) => ({
      name: stores.find(s=>s.id===sid)?.name || (sid==="sin"?"Sin tienda":"—"),
      ventas: val, pct: pct(val, total),
    })).sort((a,b)=>b.ventas-a.ventas).slice(0,5);
  }, [sales7d, stores]);

  const categoryData = useMemo(() => {
    const m = new Map<string, number>();
    items30d.forEach(i => { m.set(i.product_name, (m.get(i.product_name)||0) + Number(i.total||0)); });
    const total = [...m.values()].reduce((a,b)=>a+b,0);
    return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,v],i) => ({
      name, value: pct(v,total), color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [items30d]);

  const topProducts = useMemo(() => {
    const m = new Map<string, { qty: number; total: number }>();
    items30d.forEach(i => {
      const k = i.product_name;
      const cur = m.get(k) || { qty: 0, total: 0 };
      cur.qty += Number(i.qty||0); cur.total += Number(i.total||0);
      m.set(k, cur);
    });
    return [...m.entries()].sort((a,b)=>b[1].total-a[1].total).slice(0,5)
      .map(([name, v]) => ({ name, cantidad: v.qty, ingreso: fmtCurrency(v.total) }));
  }, [items30d]);

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-4 sm:space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard title="Ventas del Día" value={fmtCurrency(totalToday)}
            change={`${change(totalToday,totalYest)} vs ayer`}
            changeType={totalToday>=totalYest?"positive":"negative"} icon={DollarSign} />
          <StatCard title="Transacciones" value={String(txToday)}
            change={`${change(txToday,txYest)} vs ayer`}
            changeType={txToday>=txYest?"positive":"negative"} icon={ShoppingCart} />
          <StatCard title="Productos Vendidos" value={String(itemsCountToday)}
            change={`${change(itemsCountToday,itemsCountYest)} vs ayer`}
            changeType={itemsCountToday>=itemsCountYest?"positive":"negative"} icon={Package} />
          <StatCard title="Ticket Promedio" value={fmtCurrency(avgTicket)}
            change={`${change(avgTicket,avgTicketYest)} vs ayer`}
            changeType={avgTicket>=avgTicketYest?"positive":"negative"} icon={TrendingUp} />
        </div>

        {/* Alerts */}
        {lowStock.length > 0 && (
          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
            className="bg-warning/5 border border-warning/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <h3 className="font-heading font-semibold text-xs">Alertas de Inventario</h3>
              </div>
              <Link to="/inventario" className="text-[10px] text-primary hover:underline">Ver inventario →</Link>
            </div>
            <div className="space-y-1">
              {lowStock.map((p) => (
                <p key={p.id} className={`text-xs ${p.stock===0 ? "text-destructive font-medium" : "text-warning"}`}>
                  • {p.name} — stock {p.stock} (mín. {p.min_stock})
                </p>
              ))}
            </div>
          </motion.div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
            className="lg:col-span-2 bg-card rounded-xl p-4 sm:p-5 shadow-card border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-heading font-semibold text-sm">Ventas Últimos 7 Días</h2>
                <p className="text-[10px] text-muted-foreground">Total: {fmtCurrency(sales7d.reduce((s,x)=>s+Number(x.total||0),0))}</p>
              </div>
            </div>
            {loading ? <Skeleton className="h-[220px] w-full" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{fill:"hsl(220,9%,46%)",fontSize:11}} />
                  <YAxis tick={{fill:"hsl(220,9%,46%)",fontSize:11}} />
                  <Tooltip contentStyle={{backgroundColor:"hsl(0,0%,100%)",border:"1px solid hsl(220,13%,91%)",borderRadius:"8px",fontSize:"11px"}} formatter={(v:any)=>fmtCurrency(Number(v))} />
                  <Bar dataKey="ventas" fill="hsl(160,84%,39%)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
            className="bg-card rounded-xl p-4 sm:p-5 shadow-card border">
            <h2 className="font-heading font-semibold text-sm mb-4">Top Productos (30d)</h2>
            {categoryData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-12 text-center">Sin datos aún</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                      {categoryData.map((e,i)=><Cell key={i} fill={e.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {categoryData.map((cat) => (
                    <div key={cat.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 truncate">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{backgroundColor: cat.color}} />
                        <span className="truncate">{cat.name}</span>
                      </span>
                      <span className="font-heading font-semibold shrink-0 ml-2">{cat.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
            className="bg-card rounded-xl p-4 sm:p-5 shadow-card border">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-heading font-semibold text-sm">Ventas por Hora (Hoy)</h2>
            </div>
            {loading ? <Skeleton className="h-[180px] w-full" /> : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={hourlyData}>
                  <defs>
                    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(160,84%,39%)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(160,84%,39%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hora" tick={{fill:"hsl(220,9%,46%)",fontSize:10}} />
                  <YAxis tick={{fill:"hsl(220,9%,46%)",fontSize:10}} />
                  <Tooltip formatter={(v:any)=>fmtCurrency(Number(v))} contentStyle={{backgroundColor:"hsl(0,0%,100%)",border:"1px solid hsl(220,13%,91%)",borderRadius:"8px",fontSize:"11px"}} />
                  <Area type="monotone" dataKey="ventas" stroke="hsl(160,84%,39%)" strokeWidth={2} fill="url(#ag)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
            className="bg-card rounded-xl p-4 sm:p-5 shadow-card border">
            <div className="flex items-center gap-2 mb-4">
              <Store className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-heading font-semibold text-sm">Rendimiento por Tienda (7d)</h2>
            </div>
            {storeData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-12 text-center">Sin ventas en los últimos 7 días</p>
            ) : (
              <div className="space-y-4">
                {storeData.map((store) => (
                  <div key={store.name}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium truncate">{store.name}</span>
                      <span className="font-heading font-semibold text-primary">{fmtCurrency(store.ventas)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div initial={{width:0}} animate={{width:`${store.pct}%`}} transition={{duration:0.8}}
                        className="h-full rounded-full bg-primary" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
            className="lg:col-span-2 bg-card rounded-xl shadow-card border overflow-hidden">
            <div className="p-4 sm:p-5 border-b flex items-center justify-between">
              <h2 className="font-heading font-semibold text-sm">Ventas Recientes</h2>
              <Link to="/pos" className="text-xs text-primary font-medium hover:underline">Ir al POS →</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground text-xs">ID</th>
                    <th className="text-left p-3 font-medium text-muted-foreground text-xs">Cliente</th>
                    <th className="text-left p-3 font-medium text-muted-foreground text-xs">Total</th>
                    <th className="text-left p-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Hora</th>
                    <th className="text-left p-3 font-medium text-muted-foreground text-xs">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-xs text-muted-foreground">Sin ventas registradas</td></tr>
                  ) : recent.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-3 font-heading font-semibold text-xs">#{s.id.slice(0,6)}</td>
                      <td className="p-3 text-xs">{customers.find(c=>c.id===s.customer_id)?.name || "—"}</td>
                      <td className="p-3 text-xs font-semibold">{fmtCurrency(Number(s.total))}</td>
                      <td className="p-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {new Date(s.created_at).toLocaleTimeString("es-CU",{hour:"2-digit",minute:"2-digit"})}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          s.status === "completed" || s.status === "paid" ? "bg-success/10 text-success" :
                          s.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                          "bg-warning/10 text-warning"
                        }`}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
            className="bg-card rounded-xl p-4 sm:p-5 shadow-card border">
            <h2 className="font-heading font-semibold text-sm mb-4">Top Productos</h2>
            {topProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-12 text-center">Sin datos aún</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-muted-foreground w-5 font-heading shrink-0">{i+1}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{product.name}</p>
                        <p className="text-[10px] text-muted-foreground">{product.cantidad} uds vendidas</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <ArrowUpRight className="h-3 w-3 text-success" />
                      <span className="text-xs font-semibold font-heading text-primary">{product.ingreso}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
