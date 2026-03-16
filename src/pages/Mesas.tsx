import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { FloorMap } from "@/components/pos/FloorMap";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useToast } from "@/hooks/use-toast";
import { MapPin, RefreshCw } from "lucide-react";

interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
  status: string;
  position_x: number;
  position_y: number;
  shape: string;
  current_order_id: string | null;
  occupied_at: string | null;
}

const Mesas = () => {
  const { tenantId } = useTenantContext();
  const { toast } = useToast();
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);

  const updateTableStatus = async (tableId: string, status: string) => {
    const updates: Record<string, any> = { status };
    if (status === "occupied") updates.occupied_at = new Date().toISOString();
    if (status === "free") {
      updates.occupied_at = null;
      updates.current_order_id = null;
    }
    await supabase.from("restaurant_tables").update(updates).eq("id", tableId);
    toast({ title: "Mesa actualizada", description: `Estado: ${status}` });
    setSelectedTable(null);
  };

  const statusActions: Record<string, { label: string; next: string }[]> = {
    free: [{ label: "Ocupar mesa", next: "occupied" }],
    occupied: [
      { label: "Marcar servida", next: "served" },
      { label: "Liberar mesa", next: "free" },
    ],
    served: [
      { label: "Esperando cuenta", next: "waiting_bill" },
      { label: "Liberar mesa", next: "free" },
    ],
    waiting_bill: [{ label: "Liberar mesa", next: "free" }],
  };

  return (
    <AppLayout title="Mapa de Mesas">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="font-heading font-bold text-sm">Salón del Restaurante</h2>
        </div>

        <FloorMap
          onTableSelect={(t) => setSelectedTable(t)}
          selectedTableId={selectedTable?.id}
        />

        {/* Selected table panel */}
        {selectedTable && (
          <div className="bg-card rounded-xl border shadow-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading font-bold text-sm">{selectedTable.name}</h3>
                <p className="text-[10px] text-muted-foreground">Capacidad: {selectedTable.capacity} personas</p>
              </div>
              <Badge variant="outline" className="text-xs">{selectedTable.status}</Badge>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(statusActions[selectedTable.status] || []).map((action) => (
                <Button
                  key={action.next}
                  size="sm"
                  variant={action.next === "free" ? "outline" : "default"}
                  className="text-xs"
                  onClick={() => updateTableStatus(selectedTable.id, action.next)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Mesas;
