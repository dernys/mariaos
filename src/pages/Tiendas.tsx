import { AppLayout } from "@/components/AppLayout";
import { motion } from "framer-motion";
import { Store, MapPin, Users, TrendingUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const stores = [
  { id: 1, name: "Tienda Central", address: "Av. Reforma 250, CDMX", employees: 12, dailySales: "$45,200", status: "active" },
  { id: 2, name: "Sucursal Norte", address: "Blvd. Monterrey 180, MTY", employees: 8, dailySales: "$28,900", status: "active" },
  { id: 3, name: "Sucursal Sur", address: "Calle 5 de Mayo 90, Puebla", employees: 6, dailySales: "$15,600", status: "active" },
  { id: 4, name: "Kiosko Mall Plaza", address: "Centro Comercial Plaza, GDL", employees: 3, dailySales: "$8,300", status: "inactive" },
];

const Tiendas = () => {
  return (
    <AppLayout title="Tiendas">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{stores.length} tiendas registradas</p>
          <Button size="sm" className="gap-1 text-xs gradient-brand text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> Nueva Tienda
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {stores.map((store, i) => (
            <motion.div
              key={store.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-xl p-5 shadow-card border hover:shadow-elevated transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    store.status === "active"
                      ? "bg-success/10 text-success"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {store.status === "active" ? "Activa" : "Inactiva"}
                </span>
              </div>

              <h3 className="font-heading font-semibold text-sm">{store.name}</h3>
              <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span className="text-[11px]">{store.address}</span>
              </div>

              <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs">{store.employees} empleados</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-heading font-semibold">{store.dailySales}/día</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default Tiendas;
