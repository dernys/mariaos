import { AppLayout } from "@/components/AppLayout";
import { motion } from "framer-motion";
import { Warehouse, Package, AlertTriangle, Plus, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const warehouses = [
  { id: 1, name: "Almacén Central", location: "Nave Industrial 5, CDMX", products: 342, capacity: 85, alerts: 2 },
  { id: 2, name: "Almacén Norte", location: "Parque Ind. Monterrey", products: 187, capacity: 60, alerts: 0 },
  { id: 3, name: "Almacén Sur", location: "Zona Industrial Puebla", products: 95, capacity: 35, alerts: 5 },
];

const Almacenes = () => {
  return (
    <AppLayout title="Almacenes">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">{warehouses.length} almacenes registrados</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              <ArrowRightLeft className="h-3.5 w-3.5" /> Transferir
            </Button>
            <Button size="sm" className="gap-1 text-xs gradient-brand text-primary-foreground">
              <Plus className="h-3.5 w-3.5" /> Nuevo Almacén
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {warehouses.map((wh, i) => (
            <motion.div
              key={wh.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-xl p-5 shadow-card border hover:shadow-elevated transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Warehouse className="h-5 w-5 text-primary" />
                </div>
                {wh.alerts > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/10 text-warning">
                    <AlertTriangle className="h-3 w-3" /> {wh.alerts} alertas
                  </span>
                )}
              </div>

              <h3 className="font-heading font-semibold text-sm">{wh.name}</h3>
              <p className="text-[11px] text-muted-foreground mt-1">{wh.location}</p>

              <div className="mt-4 pt-4 border-t space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" /> Productos
                  </span>
                  <span className="font-heading font-semibold">{wh.products}</span>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Capacidad</span>
                    <span className="font-heading font-semibold">{wh.capacity}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${wh.capacity}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1 }}
                      className={`h-full rounded-full ${
                        wh.capacity > 80
                          ? "bg-warning"
                          : "bg-primary"
                      }`}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default Almacenes;
