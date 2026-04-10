import { useState, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { FloorMap } from "@/components/pos/FloorMap";
import { TableManageDialog } from "@/components/pos/TableManageDialog";
import { TableOrdersPanel } from "@/components/pos/TableOrdersPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Plus, Edit2, UserCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useEffect } from "react";

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
  waiter_id: string | null;
}

interface Employee {
  id: string;
  name: string;
  position: string | null;
}

const Mesas = () => {
  const { tenantId } = useTenantContext();
  const { toast } = useToast();
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [editTable, setEditTable] = useState<RestaurantTable | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("employees").select("id, name, position").eq("tenant_id", tenantId).eq("is_active", true).order("name").then(({ data }) => {
      if (data) setEmployees(data as Employee[]);
    });
  }, [tenantId]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const updateTableStatus = async (tableId: string, status: string) => {
    const updates: Record<string, any> = { status };
    if (status === "occupied") updates.occupied_at = new Date().toISOString();
    if (status === "free") {
      updates.occupied_at = null;
      updates.current_order_id = null;
      updates.waiter_id = null;
    }
    await supabase.from("restaurant_tables").update(updates as any).eq("id", tableId);
    toast({ title: "Mesa actualizada", description: `Estado: ${status}` });
    setSelectedTable(null);
    refresh();
  };

  const assignWaiter = async (tableId: string, waiterId: string) => {
    await supabase.from("restaurant_tables").update({ waiter_id: waiterId }).eq("id", tableId);
    toast({ title: "Mesero asignado" });
    setSelectedTable((prev) => prev ? { ...prev, waiter_id: waiterId } : null);
  };

  const statusActions: Record<string, { label: string; next: string; variant?: "default" | "outline" }[]> = {
    free: [{ label: "Ocupar mesa", next: "occupied" }],
    occupied: [
      { label: "Marcar servida", next: "served" },
      { label: "Liberar mesa", next: "free", variant: "outline" },
    ],
    served: [
      { label: "Esperando cuenta", next: "waiting_bill" },
      { label: "Liberar mesa", next: "free", variant: "outline" },
    ],
    waiting_bill: [{ label: "Liberar mesa", next: "free" }],
  };

  const statusLabels: Record<string, string> = {
    free: "🟢 Libre",
    occupied: "🟡 Ocupada",
    served: "🔵 Servida",
    waiting_bill: "🟣 Esperando cuenta",
  };

  return (
    <AppLayout title="Mapa de Mesas">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h2 className="font-heading font-bold text-sm">Salón del Restaurante</h2>
          </div>
          <Button size="sm" className="gap-1 text-xs" onClick={() => { setEditTable(null); setManageOpen(true); }}>
            <Plus className="h-3 w-3" /> Nueva Mesa
          </Button>
        </div>

        <FloorMap
          key={refreshKey}
          onTableSelect={(t) => setSelectedTable(t as RestaurantTable)}
          selectedTableId={selectedTable?.id}
        />

        {selectedTable && (
          <div className="bg-card rounded-xl border shadow-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading font-bold text-sm">{selectedTable.name}</h3>
                <p className="text-[10px] text-muted-foreground">
                  Capacidad: {selectedTable.capacity} personas
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {statusLabels[selectedTable.status] || selectedTable.status}
                </Badge>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditTable(selectedTable); setManageOpen(true); }}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Waiter assignment */}
            <div className="flex items-center gap-2">
              <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
              <Select
                value={selectedTable.waiter_id || ""}
                onValueChange={(v) => assignWaiter(selectedTable.id, v)}
              >
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Asignar mesero..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-xs">
                      {e.name} {e.position ? `(${e.position})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status actions */}
            <div className="flex gap-2 flex-wrap">
              {(statusActions[selectedTable.status] || []).map((action) => (
                <Button
                  key={action.next}
                  size="sm"
                  variant={action.variant || "default"}
                  className="text-xs"
                  onClick={() => updateTableStatus(selectedTable.id, action.next)}
                >
                  {action.label}
                </Button>
              ))}
            </div>

            {/* Active orders for this table */}
            <TableOrdersPanel tableId={selectedTable.id} tableName={selectedTable.name} />
          </div>
        )}

        <TableManageDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          table={editTable}
          onSaved={refresh}
        />
      </div>
    </AppLayout>
  );
};

export default Mesas;
