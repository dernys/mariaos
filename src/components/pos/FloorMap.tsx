import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Clock, CircleDot, Square, RectangleHorizontal, ChefHat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

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

interface FloorMapProps {
  onTableSelect: (table: RestaurantTable) => void;
  selectedTableId?: string | null;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  free: { label: "Libre", color: "text-emerald-400", bg: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30" },
  occupied: { label: "Ocupada", color: "text-amber-400", bg: "from-amber-500/20 to-amber-500/5 border-amber-500/30" },
  served: { label: "Servida", color: "text-blue-400", bg: "from-blue-500/20 to-blue-500/5 border-blue-500/30" },
  waiting_bill: { label: "Esperando cuenta", color: "text-purple-400", bg: "from-purple-500/20 to-purple-500/5 border-purple-500/30" },
};

const shapeIcons: Record<string, typeof Square> = {
  square: Square,
  round: CircleDot,
  rectangle: RectangleHorizontal,
};

export function FloorMap({ onTableSelect, selectedTableId }: FloorMapProps) {
  const { tenantId } = useTenantContext();
  const [tables, setTables] = useState<RestaurantTable[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    const fetchTables = async () => {
      const { data } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("position_y")
        .order("position_x");
      if (data) setTables(data as RestaurantTable[]);
    };
    fetchTables();

    const channel = supabase
      .channel("restaurant_tables_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables" }, () => {
        fetchTables();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  const getElapsedTime = (occupiedAt: string | null) => {
    if (!occupiedAt) return null;
    const diff = Math.floor((Date.now() - new Date(occupiedAt).getTime()) / 60000);
    if (diff < 60) return `${diff}min`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  const statusCounts = tables.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-3">
      {/* Status summary */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <Badge key={key} variant="outline" className={`text-[10px] ${cfg.color} border-current/30`}>
            {cfg.label}: {statusCounts[key] || 0}
          </Badge>
        ))}
      </div>

      {/* Table grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
        {tables.map((table) => {
          const config = statusConfig[table.status] || statusConfig.free;
          const ShapeIcon = shapeIcons[table.shape] || Square;
          const isSelected = selectedTableId === table.id;
          const elapsed = getElapsedTime(table.occupied_at);

          return (
            <motion.button
              key={table.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onTableSelect(table)}
              className={`relative bg-gradient-to-br ${config.bg} rounded-xl p-3 border text-left transition-all ${
                isSelected ? "ring-2 ring-primary shadow-elevated" : "hover:shadow-elevated"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <ShapeIcon className={`h-4 w-4 ${config.color}`} />
                {table.status !== "free" && elapsed && (
                  <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {elapsed}
                  </span>
                )}
              </div>
              <p className="text-xs font-heading font-bold truncate">{table.name}</p>
              <div className="flex items-center gap-1 mt-1">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{table.capacity}</span>
              </div>
              <Badge
                variant="outline"
                className={`mt-1.5 text-[8px] px-1 h-4 ${config.color} border-current/20`}
              >
                {config.label}
              </Badge>
            </motion.button>
          );
        })}
      </div>

      {tables.length === 0 && (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
          <ChefHat className="h-10 w-10 mb-2 opacity-20" />
          <p className="text-sm">No hay mesas configuradas</p>
        </div>
      )}
    </div>
  );
}
