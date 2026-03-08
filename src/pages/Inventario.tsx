import { AppLayout } from "@/components/AppLayout";
import { motion } from "framer-motion";
import { Search, Filter, Plus, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const inventoryData = [
  { id: 1, name: "Laptop HP 15.6\"", sku: "LAP-001", stock: 15, min: 5, price: 1200, almacen: "Central", estado: "ok" },
  { id: 2, name: "Mouse Logitech G502", sku: "MOU-002", stock: 45, min: 10, price: 70, almacen: "Central", estado: "ok" },
  { id: 3, name: "Monitor Samsung 27\"", sku: "MON-003", stock: 3, min: 5, price: 800, almacen: "Sucursal Norte", estado: "bajo" },
  { id: 4, name: "Teclado Mecánico RGB", sku: "TEC-004", stock: 32, min: 10, price: 80, almacen: "Central", estado: "ok" },
  { id: 5, name: "Webcam HD 1080p", sku: "WEB-005", stock: 2, min: 5, price: 70, almacen: "Sucursal Sur", estado: "critico" },
  { id: 6, name: "Audífonos Bluetooth", sku: "AUD-006", stock: 28, min: 8, price: 55, almacen: "Central", estado: "ok" },
  { id: 7, name: "Hub USB-C 7 en 1", sku: "HUB-007", stock: 50, min: 15, price: 45, almacen: "Central", estado: "ok" },
  { id: 8, name: "SSD 1TB NVMe", sku: "SSD-008", stock: 4, min: 5, price: 120, almacen: "Sucursal Norte", estado: "bajo" },
];

const statusConfig = {
  ok: { label: "En stock", className: "bg-success/10 text-success" },
  bajo: { label: "Stock bajo", className: "bg-warning/10 text-warning" },
  critico: { label: "Crítico", className: "bg-destructive/10 text-destructive" },
};

const Inventario = () => {
  const [search, setSearch] = useState("");

  const filtered = inventoryData.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout title="Inventario">
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" className="gap-1 text-xs">
            <Filter className="h-3.5 w-3.5" /> Filtrar
          </Button>
          <Button size="sm" className="gap-1 text-xs gradient-brand text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> Nuevo Producto
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl shadow-card border overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">SKU</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Producto</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Stock</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Mínimo</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Precio</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Almacén</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const status = statusConfig[item.estado as keyof typeof statusConfig];
                  return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-heading font-semibold text-xs">{item.sku}</td>
                      <td className="p-3 text-xs font-medium">{item.name}</td>
                      <td className="p-3 text-xs font-heading font-bold">{item.stock}</td>
                      <td className="p-3 text-xs text-muted-foreground">{item.min}</td>
                      <td className="p-3 text-xs font-heading font-semibold">${item.price}</td>
                      <td className="p-3 text-xs text-muted-foreground">{item.almacen}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default Inventario;
