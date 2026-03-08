import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import {
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
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

const salesData = [
  { name: "Lun", ventas: 4200, gastos: 1800 },
  { name: "Mar", ventas: 3800, gastos: 1500 },
  { name: "Mié", ventas: 5100, gastos: 2100 },
  { name: "Jue", ventas: 4600, gastos: 1900 },
  { name: "Vie", ventas: 6200, gastos: 2400 },
  { name: "Sáb", ventas: 7800, gastos: 2800 },
  { name: "Dom", ventas: 5400, gastos: 2000 },
];

const hourlyData = [
  { hora: "8am", ventas: 800 },
  { hora: "9am", ventas: 1200 },
  { hora: "10am", ventas: 2100 },
  { hora: "11am", ventas: 3200 },
  { hora: "12pm", ventas: 4800 },
  { hora: "1pm", ventas: 5200 },
  { hora: "2pm", ventas: 4600 },
  { hora: "3pm", ventas: 3800 },
  { hora: "4pm", ventas: 3200 },
  { hora: "5pm", ventas: 4100 },
  { hora: "6pm", ventas: 5500 },
  { hora: "7pm", ventas: 4200 },
];

const categoryData = [
  { name: "Computadoras", value: 42, color: "hsl(160, 84%, 39%)" },
  { name: "Periféricos", value: 28, color: "hsl(170, 70%, 45%)" },
  { name: "Monitores", value: 18, color: "hsl(217, 91%, 60%)" },
  { name: "Accesorios", value: 12, color: "hsl(38, 92%, 50%)" },
];

const topProducts = [
  { name: 'Laptop HP 15.6"', cantidad: 24, ingreso: "$28,800", trend: "up" },
  { name: "Mouse Logitech G502", cantidad: 67, ingreso: "$4,690", trend: "up" },
  { name: 'Monitor Samsung 27"', cantidad: 18, ingreso: "$14,400", trend: "down" },
  { name: "Teclado Mecánico RGB", cantidad: 42, ingreso: "$3,360", trend: "up" },
  { name: "Webcam HD 1080p", cantidad: 31, ingreso: "$2,170", trend: "down" },
];

const recentSales = [
  { id: "#V-001", cliente: "Carlos Mendoza", total: "$1,250", hora: "Hace 8 min", estado: "Completada", metodo: "Tarjeta" },
  { id: "#V-002", cliente: "Ana García", total: "$890", hora: "Hace 25 min", estado: "Completada", metodo: "Efectivo" },
  { id: "#V-003", cliente: "Roberto Díaz", total: "$2,340", hora: "Hace 40 min", estado: "Pendiente", metodo: "QR" },
  { id: "#V-004", cliente: "María López", total: "$560", hora: "Hace 1h", estado: "Completada", metodo: "Tarjeta" },
  { id: "#V-005", cliente: "Jorge Ruiz", total: "$3,100", hora: "Hace 1h 20m", estado: "Completada", metodo: "Efectivo" },
];

const storePerformance = [
  { name: "Tienda Central", ventas: "$45,200", pct: 48 },
  { name: "Sucursal Norte", ventas: "$28,900", pct: 31 },
  { name: "Sucursal Sur", ventas: "$15,600", pct: 17 },
  { name: "Kiosko Mall", ventas: "$4,100", pct: 4 },
];

const alerts = [
  { text: "Webcam HD 1080p con stock crítico (2 uds)", type: "critical" },
  { text: "Monitor Samsung 27\" stock bajo (3 uds)", type: "warning" },
  { text: "SSD 1TB NVMe stock bajo (4 uds)", type: "warning" },
];

const Dashboard = () => {
  return (
    <AppLayout title="Dashboard">
      <div className="space-y-4 sm:space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Ventas del Día"
            value="$37,100"
            change="+12.5% vs ayer"
            changeType="positive"
            icon={DollarSign}
          />
          <StatCard
            title="Transacciones"
            value="142"
            change="+8.2% vs ayer"
            changeType="positive"
            icon={ShoppingCart}
          />
          <StatCard
            title="Productos Vendidos"
            value="328"
            change="-2.1% vs ayer"
            changeType="negative"
            icon={Package}
          />
          <StatCard
            title="Ticket Promedio"
            value="$261"
            change="+4.3% vs ayer"
            changeType="positive"
            icon={TrendingUp}
          />
        </div>

        {/* Alerts Banner */}
        {alerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-warning/5 border border-warning/20 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h3 className="font-heading font-semibold text-xs">Alertas de Inventario</h3>
            </div>
            <div className="space-y-1">
              {alerts.map((alert, i) => (
                <p key={i} className={`text-xs ${alert.type === "critical" ? "text-destructive font-medium" : "text-warning"}`}>
                  • {alert.text}
                </p>
              ))}
            </div>
          </motion.div>
        )}

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Weekly Sales */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="lg:col-span-2 bg-card rounded-xl p-4 sm:p-5 shadow-card border"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-heading font-semibold text-sm">Ventas vs Gastos</h2>
                <p className="text-[10px] text-muted-foreground">Últimos 7 días</p>
              </div>
              <div className="flex gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Ventas</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-info" /> Gastos</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salesData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fill: "hsl(220, 9%, 46%)", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(220, 9%, 46%)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(0, 0%, 100%)",
                    border: "1px solid hsl(220, 13%, 91%)",
                    borderRadius: "8px",
                    fontSize: "11px",
                  }}
                />
                <Bar dataKey="ventas" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gastos" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Category Breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card rounded-xl p-4 sm:p-5 shadow-card border"
          >
            <h2 className="font-heading font-semibold text-sm mb-4">Ventas por Categoría</h2>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {categoryData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {categoryData.map((cat) => (
                <div key={cat.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                  </span>
                  <span className="font-heading font-semibold">{cat.value}%</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Second Row: Hourly + Store Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Hourly Trend */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="bg-card rounded-xl p-4 sm:p-5 shadow-card border"
          >
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-heading font-semibold text-sm">Ventas por Hora (Hoy)</h2>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hora" tick={{ fill: "hsl(220, 9%, 46%)", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(220, 9%, 46%)", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(0, 0%, 100%)",
                    border: "1px solid hsl(220, 13%, 91%)",
                    borderRadius: "8px",
                    fontSize: "11px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="ventas"
                  stroke="hsl(160, 84%, 39%)"
                  strokeWidth={2}
                  fill="url(#areaGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Store Performance */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-card rounded-xl p-4 sm:p-5 shadow-card border"
          >
            <div className="flex items-center gap-2 mb-4">
              <Store className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-heading font-semibold text-sm">Rendimiento por Tienda</h2>
            </div>
            <div className="space-y-4">
              {storePerformance.map((store) => (
                <div key={store.name}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium">{store.name}</span>
                    <span className="font-heading font-semibold text-primary">{store.ventas}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${store.pct}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full rounded-full bg-primary"
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Bottom Row: Recent Sales + Top Products */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recent Sales */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="lg:col-span-2 bg-card rounded-xl shadow-card border overflow-hidden"
          >
            <div className="p-4 sm:p-5 border-b flex items-center justify-between">
              <h2 className="font-heading font-semibold text-sm">Ventas Recientes</h2>
              <button className="text-xs text-primary font-medium hover:underline">Ver todas</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground text-xs">ID</th>
                    <th className="text-left p-3 font-medium text-muted-foreground text-xs">Cliente</th>
                    <th className="text-left p-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Método</th>
                    <th className="text-left p-3 font-medium text-muted-foreground text-xs">Total</th>
                    <th className="text-left p-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Tiempo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground text-xs">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="p-3 font-heading font-semibold text-xs">
                        {sale.id}
                      </td>
                      <td className="p-3 text-xs">{sale.cliente}</td>
                      <td className="p-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {sale.metodo}
                      </td>
                      <td className="p-3 text-xs font-semibold">{sale.total}</td>
                      <td className="p-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {sale.hora}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            sale.estado === "Completada"
                              ? "bg-success/10 text-success"
                              : "bg-warning/10 text-warning"
                          }`}
                        >
                          {sale.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Top Products */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-xl p-4 sm:p-5 shadow-card border"
          >
            <h2 className="font-heading font-semibold text-sm mb-4">Top Productos</h2>
            <div className="space-y-3">
              {topProducts.map((product, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-5 font-heading shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">
                        {product.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {product.cantidad} uds vendidas
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {product.trend === "up" ? (
                      <ArrowUpRight className="h-3 w-3 text-success" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-destructive" />
                    )}
                    <span className="text-xs font-semibold font-heading text-primary">
                      {product.ingreso}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
