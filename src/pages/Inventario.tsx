import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Search, Filter, Plus, ArrowUpDown, ArrowRightLeft, Package, Edit2, Trash2, Globe, AlertTriangle, DollarSign, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
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
// Fase 3 (Strangler) — esta página ya no habla con la base de datos:
// consume el módulo de Inventario (dominio + casos de uso + repositorio).
import {
  useInventory, useSaveProduct, useDeleteProduct, useRegisterMovement, useUploadProductImage, useInventoryDeps,
  stockStatus, type Product, type Warehouse, type Store, type LocationStock, type Movement,
} from "@/modules/inventory";

const statusConfig = (stock: number, min: number) => {
  const status = stockStatus(stock, min);
  const className =
    status === "outOfStock" ? "bg-destructive/10 text-destructive"
    : status === "lowStock" ? "bg-warning/10 text-warning"
    : "bg-success/10 text-success";
  return { label: status, className };
};

/** Traduce los códigos de error del dominio a mensajes de usuario. */
const domainMessage = (e: any, t: (k: string) => string) => {
  const code = e?.code ?? e?.message;
  const map: Record<string, string> = {
    nameSkuRequired: "modules.inventory.errors.nameSkuRequired",
    negativeAmounts: "modules.inventory.errors.qtyGtZero",
    qtyGtZero: "modules.inventory.errors.qtyGtZero",
    notEnoughStock: "modules.inventory.errors.notEnoughStock",
  };
  return map[code] ? t(map[code]) : String(e?.message ?? e);
};


const Inventario = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenantId } = useInventoryDeps();
  const { toast } = useToast();
  const { products, warehouses, stores, locationStocks, movements, loading, refetch } = useInventory();
  const saveProductMutation = useSaveProduct();
  const deleteProductMutation = useDeleteProduct();
  const registerMovementMutation = useRegisterMovement();
  const uploadImageMutation = useUploadProductImage();
  const fetchData = () => { void refetch(); };
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
    const draft = {
      name: form.name,
      sku: form.sku,
      description: form.description,
      category: form.category,
      price: parseFloat(form.price) || 0,
      cost: parseFloat(form.cost) || 0,
      stock: parseInt(form.stock) || 0,
      min_stock: parseInt(form.min_stock) || 0,
      warehouse_id: form.warehouse_id,
      is_online: form.is_online,
      online_stock: parseInt(form.online_stock) || 0,
      image_url: form.image_url,
      is_deliverable: form.is_deliverable,
    };
    try {
      await saveProductMutation.mutateAsync({ id: editing?.id ?? null, draft });
      toast({ title: editing ? t("modules.inventory.toasts.productUpdated") : t("modules.inventory.toasts.productCreated") });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: t("common.error"), description: domainMessage(e, t), variant: "destructive" });
    }
  };


  const handleDelete = async (p: Product) => {
    try {
      await deleteProductMutation.mutateAsync(p);
      toast({ title: t("modules.inventory.toasts.productDeleted") });
    } catch (e: any) {
      toast({ title: "Error", description: domainMessage(e, t), variant: "destructive" });
    }
  };


  const openMovement = (p: Product) => {
    setSelectedProduct(p);
    setMovForm({ type: "entry", quantity: "0", reason: "" });
    setMovementDialogOpen(true);
  };

  const handleMovement = async () => {
    if (!selectedProduct) return;
    const qty = parseInt(movForm.quantity) || 0;
    const isEntry = movForm.type === "entry";
    try {
      const plan = await registerMovementMutation.mutateAsync({
        product: selectedProduct,
        type: movForm.type as "entry" | "exit",
        quantity: qty,
        reason: movForm.reason,
      });
      toast({ title: `${t("modules.inventory.toasts.movementRegistered")}: ${plan.delta > 0 ? "+" : ""}${plan.delta}` });
      setMovementDialogOpen(false);
    } catch (e: any) {
      toast({ title: t("common.error"), description: domainMessage(e, t), variant: "destructive" });
    }
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
    if (type === "warehouse") return warehouses.find((w) => w.id === id)?.name || t("modules.inventory.locationType.warehouse");
    if (type === "store") return stores.find((s) => s.id === id)?.name || t("modules.inventory.locationType.store");
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
    <AppLayout title={t("modules.inventory.title")}>
      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">{t("modules.inventory.tabs.products")}</TabsTrigger>
          <TabsTrigger value="stock">{t("modules.inventory.tabs.stock")}</TabsTrigger>
          <TabsTrigger value="kardex">{t("modules.inventory.tabs.kardex")}</TabsTrigger>
          <TabsTrigger value="movements">{t("modules.inventory.tabs.movements")}</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <StatRow>
            <MiniStatCard label={t("modules.inventory.products")} value={stats.total} icon={Package} tone="primary" />
            <MiniStatCard label={t("modules.inventory.outOfStock")} value={stats.out} icon={AlertTriangle} tone={stats.out > 0 ? "destructive" : "default"} />
            <MiniStatCard label={t("modules.inventory.lowStock")} value={stats.low} icon={Layers} tone={stats.low > 0 ? "warning" : "default"} />
            <MiniStatCard label={t("modules.inventory.inventoryValue")} value={`$${stats.value.toLocaleString()}`} icon={DollarSign} tone="success" />
          </StatRow>

          <TableToolbar
            search={productTable.search}
            onSearchChange={productTable.setSearch}
            searchPlaceholder={t("modules.inventory.searchPlaceholder")}
            filters={[
              { key: "status", label: t("modules.inventory.filterStatus"), value: productTable.filters.status || "__all__",
                onChange: (v) => productTable.setFilter("status", v),
                options: [
                  { value: "ok", label: t("modules.inventory.inStock") },
                  { value: "low", label: t("modules.inventory.lowStock") },
                  { value: "out", label: t("modules.inventory.outOfStock") },
                  { value: "online", label: t("modules.inventory.onlineBadge") },
                ]},
              { key: "category", label: t("modules.inventory.filterCategory"), value: productTable.filters.category || "__all__",
                onChange: (v) => productTable.setFilter("category", v),
                options: categoryOptions },
              { key: "warehouse", label: t("modules.inventory.filterWarehouse"), value: productTable.filters.warehouse || "__all__",
                onChange: (v) => productTable.setFilter("warehouse", v),
                options: warehouseOptions },
              { key: "price_range", label: t("modules.inventory.filterPrice"), value: productTable.filters.price_range || "__all__",
                onChange: (v) => productTable.setFilter("price_range", v),
                options: [
                  { value: "lt100", label: t("modules.inventory.priceRange.lt100") },
                  { value: "100_500", label: t("modules.inventory.priceRange.mid") },
                  { value: "gt500", label: t("modules.inventory.priceRange.gt500") },
                ]},
            ]}
            rightSlot={
              <>
                <ExportButton
                  rows={productTable.filtered}
                  filename="inventario"
                  title={t("modules.inventory.header")}
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
                  <Plus className="h-3.5 w-3.5" /> {t("modules.inventory.newProductBtn")}
                </Button>
              </>
            }
          />

          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("modules.inventory.table.sku")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.product")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.stock")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.min")}</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">{t("modules.inventory.table.price")}</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">{t("modules.inventory.table.cost")}</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">{t("modules.inventory.table.warehouse")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.status")}</TableHead>
                  <TableHead className="text-xs w-28">{t("modules.inventory.table.actions")}</TableHead>
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
                          {item.is_online && <Badge variant="outline" className="ml-1 text-[9px] bg-emerald-50 text-emerald-600 border-emerald-200"><Globe className="h-2.5 w-2.5 mr-0.5" />{t("modules.inventory.onlineBadge")}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-heading font-bold">{item.stock}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.min_stock}</TableCell>
                      <TableCell className="text-xs font-heading font-semibold hidden sm:table-cell">${item.price}</TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">${item.cost}</TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{getWarehouseName(item.warehouse_id)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${status.className}`}>{t(`modules.inventory.${status.label}`)}</Badge>
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
                      {loading ? t("common.loading") : t("modules.inventory.table.empty")}
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
                  <TableHead className="text-xs">{t("modules.inventory.table.date")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.product")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.type")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.qty")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.previousStock")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.newStock")}</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">{t("modules.inventory.table.reason")}</TableHead>
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
                        {m.movement_type === "entry" ? t("modules.inventory.movementType.entry") : m.movement_type === "exit" ? t("modules.inventory.movementType.exit") : m.movement_type}
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
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-xs">{t("modules.inventory.table.noMovements")}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("modules.inventory.searchProduct")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("modules.inventory.table.sku")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.product")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.type")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.location")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.stock")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-heading font-semibold">{r.sku}</TableCell>
                    <TableCell className="text-xs">{r.productName}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.location_type === "warehouse" ? t("modules.inventory.locationType.warehouse") : t("modules.inventory.locationType.store")}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.locationName}</TableCell>
                    <TableCell className="text-xs font-heading font-bold">{r.stock}</TableCell>
                  </TableRow>
                ))}
                {stockRows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">{t("modules.inventory.table.noStockLocation")}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="kardex" className="space-y-4">
          <div className="max-w-md">
            <Label className="text-xs">{t("modules.inventory.kardex.productLabel")}</Label>
            <Select value={kardexProductId} onValueChange={setKardexProductId}>
              <SelectTrigger><SelectValue placeholder={t("modules.inventory.kardex.selectProduct")} /></SelectTrigger>
              <SelectContent>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("modules.inventory.table.date")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.type")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.location")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.qty")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.previous")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.new")}</TableHead>
                  <TableHead className="text-xs">{t("modules.inventory.table.reason")}</TableHead>
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
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">{kardexProductId ? t("modules.inventory.table.noMovementsProduct") : t("modules.inventory.table.selectProductHistory")}</TableCell></TableRow>
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
            <DialogTitle>{editing ? t("modules.inventory.dialog.editProduct") : t("modules.inventory.dialog.newProduct")}</DialogTitle>
            <DialogDescription>{t("modules.inventory.dialog.enterData")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("modules.inventory.dialog.name")} *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>SKU *</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
            </div>
            <div><Label>{t("modules.inventory.dialog.description")}</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("modules.inventory.dialog.category")}</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
              <div>
                <Label>{t("modules.inventory.table.warehouse")}</Label>
                <Select value={form.warehouse_id} onValueChange={(v) => setForm({ ...form, warehouse_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("modules.inventory.dialog.warehouseSelect")} /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div><Label>{t("modules.inventory.table.price")}</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div><Label>{t("modules.inventory.table.cost")}</Label><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
              <div><Label>{t("modules.inventory.table.stock")}</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
              <div><Label>{t("modules.inventory.table.min")}</Label><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></div>
            </div>
            {/* Imagen del producto (siempre disponible para POS) */}
            <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <Label className="text-sm font-medium">{t("modules.inventory.dialog.image")}</Label>
              <p className="text-[11px] text-muted-foreground">{t("modules.inventory.dialog.imageHint")}</p>
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
                    placeholder={t("modules.inventory.dialog.imageUrlPlaceholder")}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="text-xs"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !tenantId) return;
                        try {
                          const publicUrl = await uploadImageMutation.mutateAsync(file);
                          setForm((f) => ({ ...f, image_url: publicUrl }));
                          toast({ title: t("modules.inventory.toasts.imageUploaded") });
                        } catch (err: any) {
                          toast({ title: t("modules.inventory.errors.uploadImage"), description: domainMessage(err, t), variant: "destructive" });
                        }
                      }}
                    />
                    {form.image_url && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, image_url: "" })}>
                        {t("modules.inventory.dialog.remove")}
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
                  <Label className="text-sm font-medium">{t("modules.inventory.dialog.onlineSale")}</Label>
                  <p className="text-[11px] text-muted-foreground">{t("modules.inventory.dialog.onlineSaleHint")}</p>
                </div>
                <Switch checked={form.is_online} onCheckedChange={(v) => setForm({ ...form, is_online: v })} />
              </div>
              {form.is_online && (
                <>
                  <div><Label>{t("modules.inventory.dialog.onlineStock")}</Label><Input type="number" value={form.online_stock} onChange={(e) => setForm({ ...form, online_stock: e.target.value })} /></div>
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <Label className="text-xs">{t("modules.inventory.dialog.deliverable")}</Label>
                      <p className="text-[10px] text-muted-foreground">{t("modules.inventory.dialog.deliverableHint")}</p>
                    </div>
                    <Switch checked={form.is_deliverable} onCheckedChange={(v) => setForm({ ...form, is_deliverable: v })} />
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("modules.inventory.dialog.cancel")}</Button>
            <Button onClick={handleSave} className="gradient-brand text-primary-foreground">{t("modules.inventory.dialog.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("modules.inventory.dialog.movement")}</DialogTitle>
            <DialogDescription>{selectedProduct?.name} — {t("modules.inventory.dialog.currentStock")}: {selectedProduct?.stock}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>{t("modules.inventory.table.type")}</Label>
              <Select value={movForm.type} onValueChange={(v) => setMovForm({ ...movForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">{t("modules.inventory.movementType.entry")}</SelectItem>
                  <SelectItem value="exit">{t("modules.inventory.movementType.exit")}</SelectItem>
                  <SelectItem value="adjustment">{t("modules.inventory.movementType.adjustment")}</SelectItem>
                  <SelectItem value="transfer">{t("modules.inventory.movementType.transfer")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("modules.inventory.table.qty")}</Label><Input type="number" value={movForm.quantity} onChange={(e) => setMovForm({ ...movForm, quantity: e.target.value })} /></div>
            <div><Label>{t("modules.inventory.table.reason")}</Label><Input value={movForm.reason} onChange={(e) => setMovForm({ ...movForm, reason: e.target.value })} placeholder={t("modules.inventory.dialog.movementReasonPh")} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementDialogOpen(false)}>{t("modules.inventory.dialog.cancel")}</Button>
            <Button onClick={handleMovement} className="gradient-brand text-primary-foreground">{t("modules.inventory.dialog.register")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Inventario;
