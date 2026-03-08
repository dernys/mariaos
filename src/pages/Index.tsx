import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import {
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  ArrowUpRight,
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
  LineChart,
  Line,
} from "recharts";

const salesData = [
  { name: "Lun", ventas: 4200 },
  { name: "Mar", ventas: 3800 },
  { name: "Mié", ventas: 5100 },
  { name: "Jue", ventas: 4600 },
  { name: "Vie", ventas: 6200 },
  { name: "Sáb", ventas: 7800 },
  { name: "Dom", ventas: 5400 },
];

const topProducts = [
  { name: "Laptop HP 15.6\"", cantidad: 24, ingreso: "$28,800" },
  { name: "Mouse Logitech G502", cantidad: 67, ingreso: "$4,690" },
  { name: "Monitor Samsung 27\"", cantidad: 18, ingreso: "$14,400" },
  { name: "Teclado Mecánico RGB", cantidad: 42, ingreso: "$3,360" },
  { name: "Webcam HD 1080p", cantidad: 31, ingreso: "$2,170" },
];

const recentSales = [
  { id: "#V-001", cliente: "Carlos Mendoza", total: "$1,250", hora: "14:32", estado: "Completada" },
  { id: "#V-002", cliente: "Ana García", total: "$890", hora: "14:15", estado: "Completada" },
  { id: "#V-003", cliente: "Roberto Díaz", total: "$2,340", hora: "13:50", estado: "Pendiente" },
  { id: "#V-004", cliente: "María López", total: "$560", hora: "13:22", estado: "Completada" },
];

const Dashboard = () => {
  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 bg-card rounded-xl p-5 shadow-card border"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-semibold text-sm">Ventas de la Semana</h2>
              <span className="text-xs text-muted-foreground">Últimos 7 días</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(220, 9%, 46%)' }} />
                <YAxis className="text-xs" tick={{ fill: 'hsl(220, 9%, 46%)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(0, 0%, 100%)',
                    border: '1px solid hsl(220, 13%, 91%)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="ventas" fill="hsl(160, 84%, 39%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Top Products */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-card rounded-xl p-5 shadow-card border"
          >
            <h2 className="font-heading font-semibold text-sm mb-4">Top Productos</h2>
            <div className="space-y-3">
              {topProducts.map((product, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-5 font-heading">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{product.name}</p>
                      <p className="text-[10px] text-muted-foreground">{product.cantidad} uds</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold font-heading text-primary shrink-0">
                    {product.ingreso}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Recent Sales */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-xl shadow-card border overflow-hidden"
        >
          <div className="p-5 border-b">
            <h2 className="font-heading font-semibold text-sm">Ventas Recientes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">ID</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Cliente</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Total</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Hora</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-heading font-semibold text-xs">{sale.id}</td>
                    <td className="p-3 text-xs">{sale.cliente}</td>
                    <td className="p-3 text-xs font-semibold">{sale.total}</td>
                    <td className="p-3 text-xs text-muted-foreground">{sale.hora}</td>
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
      </div>
    </AppLayout>
  );
};

export default Dashboard;
