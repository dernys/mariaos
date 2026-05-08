import { AppLayout } from "@/components/AppLayout";
import { motion } from "framer-motion";
import { Search, Filter, Plus, ArrowUpDown, ArrowRightLeft, Package, Edit2, Trash2, Globe, AlertTriangle, DollarSign, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/hooks/useTenant";
import { logActivity } from "@/hooks/useActivityLog";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useTableState } from "@/hooks/useTableState";
import { TableToolbar } from "@/components/data/TableToolbar";
import { ExportButton } from "@/components/data/ExportButton";
import { TablePagination } from "@/components/data/TablePagination";
import { MiniStatCard, StatRow } from "@/components/data/MiniStatCard";

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  category: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  warehouse_id: string | null;
  is_active: boolean;
  is_online?: boolean;
  online_stock?: number;
  image_url?: string | null;
}

interface Warehouse {
  id: string;
  name: string;
}

interface Store {
  id: string;
  name: string;
}

interface LocationStock {
  id: string;
  product_id: string;
  location_type: string;
  location_id: string;
  stock: number;
}

interface Movement {
  id: string;
  movement_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
  created_at: string;
  product_id: string;
  location_type?: string | null;
  location_id?: string | null;
}

const statusConfig = (stock: number, min: number) => {
  if (stock <= 0) return { label: "Sin stock", className: "bg-destructive/10 text-destructive" };
  if (stock <= min) return { label: "Stock bajo", className: "bg-warning/10 text-warning" };
  return { label: "En stock", className: "bg-success/10 text-success" };
};

const Inventario = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [locationStocks, setLocationStocks] = useState<LocationStock[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kardexProductId, setKardexProductId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: "", sku: "", description: "", category: "", price: "0", cost: "0",
    stock: "0", min_stock: "0", warehouse_id: "", is_online: false, online_stock: "0", image_url: "", is_deliverable: true,
  });
  const [movForm, setMovForm] = useState({ type: "entry", quantity: "0", reason: "" });

  const fetchData = async () => {
    const [prodRes, whRes, stRes, psRes, movRes] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("stores").select("id, name").order("name"),
      supabase.from("product_stock").select("*"),
      supabase.from("inventory_movements").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (prodRes.data) setProducts(prodRes.data as Product[]);
    if (whRes.data) setWarehouses(whRes.data);
    if (stRes.data) setStores(stRes.data);
    if (psRes.data) setLocationStocks(psRes.data as LocationStock[]);
    if (movRes.data) setMovements(movRes.data as Movement[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", sku: "", description: "", category: "", price: "0", cost: "0", stock: "0", min_stock: "0", warehouse_id: "", is_online: false, online_stock: "0", image_url: "", is_deliverable: true });
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, sku: p.sku, description: p.description || "", category: p.category || "",
      price: String(p.price), cost: String(p.cost), stock: String(p.stock), min_stock: String(p.min_stock),
      warehouse_id: p.warehouse_id || "", is_online: p.is_online || false, online_stock: String(p.online_stock || 0), image_url: p.image_url || "",
      is_deliverable: (p as any).is_deliverable ?? true,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.sku.trim()) {
      toast({ title: "Error", description: "Nombre y SKU son obligatorios", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(), sku: form.sku.trim(), description: form.description || null,
      category: form.category || null, price: parseFloat(form.price) || 0, cost: parseFloat(form.cost) || 0,
      stock: parseInt(form.stock) || 0, min_stock: parseInt(form.min_stock) || 0,
      warehouse_id: form.warehouse_id || null, tenant_id: tenantId,
      is_online: form.is_online, online_stock: form.is_online ? (parseInt(form.online_stock) || 0) : 0,
      image_url: form.image_url.trim() || null,
      is_deliverable: form.is_deliverable,
    };

    if (editing) {
      const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      await logActivity({ entity_type: "product", entity_id: editing.id, action: "Producto actualizado", description: `Se actualizó ${payload.name}`, tenant_id: tenantId, performed_by: user?.id });
      toast({ title: "Producto actualizado" });
    } else {
      const { data, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      if (data) {
        await logActivity({ entity_type: "product", entity_id: data.id, action: "Producto creado", description: `Se creó ${payload.name} (${payload.sku})`, tenant_id: tenantId, performed_by: user?.id });
        // Log initial stock as movement
        if (payload.stock > 0) {
          await supabase.from("inventory_movements").insert({
            product_id: data.id, warehouse_id: payload.warehouse_id, movement_type: "entry",
            quantity: payload.stock, previous_stock: 0, new_stock: payload.stock,
            reason: "Stock inicial", tenant_id: tenantId, performed_by: user?.id,
          });
        }
      }
      toast({ title: "Producto creado" });
    }
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (p: Product) => {
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await logActivity({ entity_type: "product", entity_id: p.id, action: "Producto eliminado", description: `Se eliminó ${p.name}`, tenant_id: tenantId, performed_by: user?.id });
    toast({ title: "Producto eliminado" });
    fetchData();
  };

  const openMovement = (p: Product) => {
    setSelectedProduct(p);
    setMovForm({ type: "entry", quantity: "0", reason: "" });
    setMovementDialogOpen(true);
  };

  const handleMovement = async () => {
    if (!selectedProduct) return;
    const qty = parseInt(movForm.quantity) || 0;
    if (qty <= 0) { toast({ title: "Error", description: "Cantidad debe ser mayor a 0", variant: "destructive" }); return; }

    const isEntry = movForm.type === "entry";
    const newStock = isEntry ? selectedProduct.stock + qty : selectedProduct.stock - qty;
    if (newStock < 0) { toast({ title: "Error", description: "No hay suficiente stock", variant: "destructive" }); return; }

    const { error: movErr } = await supabase.from("inventory_movements").insert({
      product_id: selectedProduct.id, warehouse_id: selectedProduct.warehouse_id,
      movement_type: movForm.type, quantity: qty, previous_stock: selectedProduct.stock,
      new_stock: newStock, reason: movForm.reason || null, tenant_id: tenantId, performed_by: user?.id,
    });
    if (movErr) { toast({ title: "Error", description: movErr.message, variant: "destructive" }); return; }

    await supabase.from("products").update({ stock: newStock }).eq("id", selectedProduct.id);
    await logActivity({
      entity_type: "product", entity_id: selectedProduct.id,
      action: isEntry ? "Entrada de inventario" : "Salida de inventario",
      description: `${isEntry ? "+" : "-"}${qty} unidades. ${movForm.reason || ""}`.trim(),
      tenant_id: tenantId, performed_by: user?.id,
    });

    toast({ title: `Movimiento registrado: ${isEntry ? "+" : "-"}${qty}` });
    setMovementDialogOpen(false);
    fetchData();
  };

  const productTable = useTableState({
    data: products,
    searchKeys: ["name", "sku", "category", "description"],
    filterFns: {
      status: (p, v) => {
        if (v === "out") return p.stock <= 0;
        if (v === "low") return p.stock > 0 && p.stock <= p.min_stock;
        if (v === "ok") return p.stock > p.min_stock;
        if (v === "online") return !!p.is_online;
        return true;
      },
      category: (p, v) => (p.category || "") === v,
      warehouse: (p, v) => (p.warehouse_id || "") === v,
      price_range: (p, v) => {
        if (v === "lt100") return p.price < 100;
        if (v === "100_500") return p.price >= 100 && p.price <= 500;
        if (v === "gt500") return p.price > 500;
        return true;
      },
    },
  });

  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: w.name })), [warehouses]);
  const categoryOptions = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean) as string[]);
    return Array.from(set).map((c) => ({ value: c, label: c }));
  }, [products]);

  const stats = useMemo(() => {
    const total = products.length;
    const out = products.filter((p) => p.stock <= 0).length;
    const low = products.filter((p) => p.stock > 0 && p.stock <= p.min_stock).length;
    const value = products.reduce((a, p) => a + (p.stock || 0) * (p.cost || 0), 0);
    return { total, out, low, value };
  }, [products]);

  const getProductName = (id: string) => products.find((p) => p.id === id)?.name || "—";
  const getWarehouseName = (id: string | null) => warehouses.find((w) => w.id === id)?.name || "—";
  const getLocationName = (type?: string | null, id?: string | null) => {
    if (!id) return "—";
    if (type === "warehouse") return warehouses.find((w) => w.id === id)?.name || "Almacén";
    if (type === "store") return stores.find((s) => s.id === id)?.name || "Tienda";
    return "—";
  };

  // Stock por ubicación: agrupa product_stock con producto y ubicación
  const stockRows = locationStocks
    .map((ls) => ({
      ...ls,
      productName: products.find((p) => p.id === ls.product_id)?.name || "—",
      sku: products.find((p) => p.id === ls.product_id)?.sku || "—",
      locationName: getLocationName(ls.location_type, ls.location_id),
    }))
    .filter((r) => r.productName.toLowerCase().includes(search.toLowerCase()) || r.sku.toLowerCase().includes(search.toLowerCase()));

  const kardexMovements = kardexProductId ? movements.filter((m) => m.product_id === kardexProductId) : [];

  return (
    <AppLayout title="Inventario">
      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">Productos</TabsTrigger>
          <TabsTrigger value="stock">Stock por ubicación</TabsTrigger>
          <TabsTrigger value="kardex">Kardex</TabsTrigger>
          <TabsTrigger value="movements">Movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <StatRow>
            <MiniStatCard label="Productos" value={stats.total} icon={Package} tone="primary" />
            <MiniStatCard label="Sin stock" value={stats.out} icon={AlertTriangle} tone={stats.out > 0 ? "destructive" : "default"} />
            <MiniStatCard label="Stock bajo" value={stats.low} icon={Layers} tone={stats.low > 0 ? "warning" : "default"} />
            <MiniStatCard label="Valor inventario" value={`$${stats.value.toLocaleString()}`} icon={DollarSign} tone="success" />
          </StatRow>

          <TableToolbar
            search={productTable.search}
            onSearchChange={productTable.setSearch}
            searchPlaceholder="Buscar producto o SKU..."
            filters={[
              { key: "status", label: "Estado", value: productTable.filters.status || "__all__",
                onChange: (v) => productTable.setFilter("status", v),
                options: [
                  { value: "ok", label: "En stock" },
                  { value: "low", label: "Stock bajo" },
                  { value: "out", label: "Sin stock" },
                  { value: "online", label: "Online" },
                ]},
              { key: "category", label: "Categoría", value: productTable.filters.category || "__all__",
                onChange: (v) => productTable.setFilter("category", v),
                options: categoryOptions },
              { key: "warehouse", label: "Almacén", value: productTable.filters.warehouse || "__all__",
                onChange: (v) => productTable.setFilter("warehouse", v),
                options: warehouseOptions },
              { key: "price_range", label: "Precio", value: productTable.filters.price_range || "__all__",
                onChange: (v) => productTable.setFilter("price_range", v),
                options: [
                  { value: "lt100", label: "< $100" },
                  { value: "100_500", label: "$100 - $500" },
                  { value: "gt500", label: "> $500" },
                ]},
            ]}
            rightSlot={
              <>
                <ExportButton
                  rows={productTable.filtered}
                  filename="inventario"
                  title="Inventario de productos"
                  columns={[
                    { key: "sku", label: "SKU" },
                    { key: "name", label: "Producto" },
                    { key: "category", label: "Categoría" },
                    { key: "stock", label: "Stock" },
                    { key: "min_stock", label: "Mínimo" },
                    { key: "price", label: "Precio" },
                    { key: "cost", label: "Costo" },
                  ]}
                />
                <Button size="sm" onClick={openNew} className="gap-1 text-xs gradient-brand text-primary-foreground h-9">
                  <Plus className="h-3.5 w-3.5" /> Nuevo Producto
                </Button>
              </>
            }
          />

          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Producto</TableHead>
                  <TableHead className="text-xs">Stock</TableHead>
                  <TableHead className="text-xs">Mínimo</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Precio</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Costo</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Almacén</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                  <TableHead className="text-xs w-28">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productTable.paged.map((item) => {
                  const status = statusConfig(item.stock, item.min_stock);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs font-heading font-semibold">{item.sku}</TableCell>
                      <TableCell className="text-xs font-medium">
                        <div className="flex items-center gap-2">
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="h-8 w-8 rounded object-cover border" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                              <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          )}
                          <span>{item.name}</span>
                          {item.is_online && <Badge variant="outline" className="ml-1 text-[9px] bg-emerald-50 text-emerald-600 border-emerald-200"><Globe className="h-2.5 w-2.5 mr-0.5" />Online</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-heading font-bold">{item.stock}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.min_stock}</TableCell>
                      <TableCell className="text-xs font-heading font-semibold hidden sm:table-cell">${item.price}</TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">${item.cost}</TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{getWarehouseName(item.warehouse_id)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${status.className}`}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <button onClick={() => openMovement(item)} className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors" title="Movimiento">
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-muted transition-colors">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(item)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {productTable.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      {loading ? "Cargando..." : "No hay productos"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination page={productTable.page} pageSize={productTable.pageSize} total={productTable.total}
              onPageChange={productTable.setPage} onPageSizeChange={productTable.setPageSize} />
          </div>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Producto</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Cantidad</TableHead>
                  <TableHead className="text-xs">Stock Anterior</TableHead>
                  <TableHead className="text-xs">Stock Nuevo</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Razón</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(m.created_at), "dd/MM/yy HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{getProductName(m.product_id)}</TableCell>
                    <TableCell>
                      <Badge variant={m.movement_type === "entry" ? "default" : "destructive"} className="text-[10px]">
                        {m.movement_type === "entry" ? "Entrada" : m.movement_type === "exit" ? "Salida" : m.movement_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-heading font-bold">
                      {m.movement_type === "entry" ? "+" : "-"}{m.quantity}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.previous_stock}</TableCell>
                    <TableCell className="text-xs font-heading font-semibold">{m.new_stock}</TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{m.reason || "—"}</TableCell>
                  </TableRow>
                ))}
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-xs">Sin movimientos</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Producto</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Ubicación</TableHead>
                  <TableHead className="text-xs">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-heading font-semibold">{r.sku}</TableCell>
                    <TableCell className="text-xs">{r.productName}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.location_type === "warehouse" ? "Almacén" : "Tienda"}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.locationName}</TableCell>
                    <TableCell className="text-xs font-heading font-bold">{r.stock}</TableCell>
                  </TableRow>
                ))}
                {stockRows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">Sin stock registrado por ubicación</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="kardex" className="space-y-4">
          <div className="max-w-md">
            <Label className="text-xs">Producto</Label>
            <Select value={kardexProductId} onValueChange={setKardexProductId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un producto" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Ubicación</TableHead>
                  <TableHead className="text-xs">Cantidad</TableHead>
                  <TableHead className="text-xs">Anterior</TableHead>
                  <TableHead className="text-xs">Nuevo</TableHead>
                  <TableHead className="text-xs">Razón</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kardexMovements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(m.created_at), "dd/MM/yy HH:mm")}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{m.movement_type}</Badge></TableCell>
                    <TableCell className="text-xs">{getLocationName(m.location_type, m.location_id)}</TableCell>
                    <TableCell className="text-xs font-heading font-bold">{m.quantity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.previous_stock}</TableCell>
                    <TableCell className="text-xs font-heading font-semibold">{m.new_stock}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.reason || "—"}</TableCell>
                  </TableRow>
                ))}
                {(!kardexProductId || kardexMovements.length === 0) && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">{kardexProductId ? "Sin movimientos para este producto" : "Selecciona un producto para ver su historial"}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
            <DialogDescription>Ingresa los datos del producto</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>SKU *</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
            </div>
            <div><Label>Descripción</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Categoría</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
              <div>
                <Label>Almacén</Label>
                <Select value={form.warehouse_id} onValueChange={(v) => setForm({ ...form, warehouse_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div><Label>Precio</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div><Label>Costo</Label><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
              <div><Label>Stock</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
              <div><Label>Mínimo</Label><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></div>
            </div>
            {/* Imagen del producto (siempre disponible para POS) */}
            <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <Label className="text-sm font-medium">Imagen del producto</Label>
              <p className="text-[11px] text-muted-foreground">Se muestra en el POS y en el marketplace</p>
              <div className="flex items-start gap-3">
                {form.image_url ? (
                  <img src={form.image_url} alt="preview" className="h-20 w-20 rounded-lg object-cover border" />
                ) : (
                  <div className="h-20 w-20 rounded-lg bg-muted border flex items-center justify-center text-muted-foreground">
                    <Package className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <Input
                    value={form.image_url}
                    onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                    placeholder="https://... o sube un archivo"
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="text-xs"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !tenantId) return;
                        const ext = file.name.split(".").pop() || "jpg";
                        const path = `${tenantId}/${Date.now()}.${ext}`;
                        const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
                        if (error) { toast({ title: "Error subiendo imagen", description: error.message, variant: "destructive" }); return; }
                        const { data } = supabase.storage.from("product-images").getPublicUrl(path);
                        setForm((f) => ({ ...f, image_url: data.publicUrl }));
                        toast({ title: "Imagen subida" });
                      }}
                    />
                    {form.image_url && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, image_url: "" })}>
                        Quitar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Online sale section */}
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Venta Online</Label>
                  <p className="text-[11px] text-muted-foreground">Publicar este producto en el marketplace</p>
                </div>
                <Switch checked={form.is_online} onCheckedChange={(v) => setForm({ ...form, is_online: v })} />
              </div>
              {form.is_online && (
                <div><Label>Stock Online</Label><Input type="number" value={form.online_stock} onChange={(e) => setForm({ ...form, online_stock: e.target.value })} /></div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Movimiento de Inventario</DialogTitle>
            <DialogDescription>{selectedProduct?.name} — Stock actual: {selectedProduct?.stock}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={movForm.type} onValueChange={(v) => setMovForm({ ...movForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">Entrada</SelectItem>
                  <SelectItem value="exit">Salida</SelectItem>
                  <SelectItem value="adjustment">Ajuste</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Cantidad</Label><Input type="number" value={movForm.quantity} onChange={(e) => setMovForm({ ...movForm, quantity: e.target.value })} /></div>
            <div><Label>Razón</Label><Input value={movForm.reason} onChange={(e) => setMovForm({ ...movForm, reason: e.target.value })} placeholder="Motivo del movimiento" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleMovement} className="gradient-brand text-primary-foreground">Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Inventario;
