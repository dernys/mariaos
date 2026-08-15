import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableToolbar } from "@/components/data/TableToolbar";
import { useTableState } from "@/hooks/useTableState";
import { Utensils, Plus, Trash2, ChefHat, Package, DollarSign } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  cost: number;
  category: string | null;
  product_type: string | null;
  recipe_yield: number | null;
  recipe_notes: string | null;
  is_active: boolean;
}

interface RecipeLine {
  id: string;
  product_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
}

const UNITS = ["unidad", "g", "kg", "ml", "L", "oz", "tbsp", "tsp", "porción"];

interface DraftHeader {
  name: string;
  sku: string;
  description: string;
  price: string;
  category: string;
  recipe_yield: string;
  recipe_notes: string;
}

const emptyHeader: DraftHeader = {
  name: "", sku: "", description: "", price: "", category: "", recipe_yield: "1", recipe_notes: "",
};

export default function Recetas() {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<RecipeLine[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [newParentId, setNewParentId] = useState("");
  const [header, setHeader] = useState<DraftHeader>(emptyHeader);
  const [draftLines, setDraftLines] = useState<{ ingredient_id: string; quantity: string; unit: string }[]>([]);

  const fetchAll = async () => {
    if (!tenantId) return;
    const [pRes, rRes] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,sku,description,price,cost,category,product_type,recipe_yield,recipe_notes,is_active")
        .eq("is_active", true)
        .order("name"),
      supabase.from("product_recipes").select("*"),
    ]);
    if (pRes.data) setProducts(pRes.data as Product[]);
    if (rRes.data) setRecipes(rRes.data as RecipeLine[]);
  };
  useEffect(() => { fetchAll(); }, [tenantId]);

  const recipesByProduct = useMemo(() => {
    const m = new Map<string, RecipeLine[]>();
    recipes.forEach((r) => {
      if (!m.has(r.product_id)) m.set(r.product_id, []);
      m.get(r.product_id)!.push(r);
    });
    return m;
  }, [recipes]);

  const productsWithRecipes = useMemo(
    () => products.filter((p) => recipesByProduct.has(p.id) || p.product_type === "prepared"),
    [products, recipesByProduct]
  );

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Los ingredientes son productos de stock (no preparados).
  const stockProducts = useMemo(
    () => products.filter((p) => p.product_type !== "prepared" && !recipesByProduct.has(p.id)),
    [products, recipesByProduct]
  );

  const tableState = useTableState<Product>({
    data: productsWithRecipes,
    searchKeys: ["name", "sku"],
    initialPageSize: 50,
  });

  const computeEscandallo = (productId: string): number => {
    const lines = recipesByProduct.get(productId) || [];
    return lines.reduce((sum, l) => {
      const ing = productMap.get(l.ingredient_id);
      return sum + (ing?.cost || 0) * Number(l.quantity || 0);
    }, 0);
  };

  const draftCost = useMemo(
    () =>
      draftLines.reduce((sum, l) => {
        const ing = productMap.get(l.ingredient_id);
        return sum + (ing?.cost || 0) * (parseFloat(l.quantity) || 0);
      }, 0),
    [draftLines, productMap]
  );
  const draftYield = Math.max(1, parseFloat(header.recipe_yield) || 1);
  const draftUnitCost = draftCost / draftYield;
  const draftPrice = parseFloat(header.price) || 0;
  const draftMargin = draftPrice > 0 ? ((draftPrice - draftUnitCost) / draftPrice) * 100 : 0;

  const openEditor = (p: Product) => {
    setEditingProduct(p);
    setMode("existing");
    setHeader({
      name: p.name,
      sku: p.sku || "",
      description: p.description || "",
      price: String(p.price ?? ""),
      category: p.category || "",
      recipe_yield: String(p.recipe_yield ?? 1),
      recipe_notes: p.recipe_notes || "",
    });
    const existing = recipesByProduct.get(p.id) || [];
    setDraftLines(
      existing.length > 0
        ? existing.map((l) => ({ ingredient_id: l.ingredient_id, quantity: String(l.quantity), unit: l.unit || "unidad" }))
        : [{ ingredient_id: "", quantity: "", unit: "unidad" }]
    );
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingProduct(null);
    setMode("new");
    setNewParentId("");
    setHeader(emptyHeader);
    setDraftLines([{ ingredient_id: "", quantity: "", unit: "unidad" }]);
    setDialogOpen(true);
  };

  const selectExistingParent = (id: string) => {
    setNewParentId(id);
    const p = productMap.get(id);
    if (p) {
      setHeader({
        name: p.name,
        sku: p.sku || "",
        description: p.description || "",
        price: String(p.price ?? ""),
        category: p.category || "",
        recipe_yield: String(p.recipe_yield ?? 1),
        recipe_notes: p.recipe_notes || "",
      });
    }
  };

  const addLine = () => setDraftLines([...draftLines, { ingredient_id: "", quantity: "", unit: "unidad" }]);
  const removeLine = (i: number) => setDraftLines(draftLines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, val: string) => {
    const next = [...draftLines];
    (next[i] as any)[field] = val;
    setDraftLines(next);
  };

  const saveRecipe = async () => {
    if (!tenantId) return;
    if (!header.name.trim()) {
      toast({ title: "Indica el nombre del producto preparado", variant: "destructive" });
      return;
    }
    const valid = draftLines.filter((l) => l.ingredient_id && parseFloat(l.quantity) > 0);
    if (valid.length === 0) {
      toast({ title: "Agrega al menos un ingrediente", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const headerPayload = {
        name: header.name.trim(),
        sku: header.sku.trim() || `PREP-${Date.now().toString().slice(-6)}`,
        description: header.description.trim() || null,
        price: parseFloat(header.price) || 0,
        category: header.category.trim() || null,
        product_type: "prepared",
        recipe_yield: draftYield,
        recipe_notes: header.recipe_notes.trim() || null,
        cost: Number(draftUnitCost.toFixed(4)),
      };

      let parentId = editingProduct?.id || (mode === "existing" ? newParentId : "");

      if (parentId) {
        const { error } = await supabase.from("products").update(headerPayload as any).eq("id", parentId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({ ...headerPayload, tenant_id: tenantId, stock: 0, min_stock: 0, is_active: true } as any)
          .select("id")
          .single();
        if (error) throw error;
        parentId = data!.id;
      }

      const { error: delErr } = await supabase.from("product_recipes").delete().eq("product_id", parentId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("product_recipes").insert(
        valid.map((l) => ({
          tenant_id: tenantId,
          product_id: parentId,
          ingredient_id: l.ingredient_id,
          quantity: parseFloat(l.quantity),
          unit: l.unit,
        }))
      );
      if (insErr) throw insErr;

      toast({ title: "Receta guardada", description: `${valid.length} ingredientes · costo unitario $${draftUnitCost.toFixed(2)}` });
      setDialogOpen(false);
      setNewParentId("");
      setHeader(emptyHeader);
      fetchAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipe = async (productId: string) => {
    if (!confirm("¿Eliminar la receta completa?")) return;
    const { error } = await supabase.from("product_recipes").delete().eq("product_id", productId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await supabase.from("products").update({ product_type: "simple" } as any).eq("id", productId);
    toast({ title: "Receta eliminada" });
    fetchAll();
  };

  const availableParents = products.filter((p) => !recipesByProduct.has(p.id));
  const parentIdInDialog = editingProduct?.id || newParentId;

  return (
    <AppLayout title={t("nav.items.recipes")}>
      <div className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><ChefHat className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">Productos preparados</p>
              <p className="font-heading font-bold text-lg">{productsWithRecipes.length}</p>
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center"><Package className="h-5 w-5 text-success" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">Líneas de receta</p>
              <p className="font-heading font-bold text-lg">{recipes.length}</p>
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center"><DollarSign className="h-5 w-5 text-warning" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">Insumos de stock</p>
              <p className="font-heading font-bold text-lg">{stockProducts.length}</p>
            </div>
          </CardContent></Card>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">
            Una receta es la mezcla de productos del stock. Define el nombre, la descripción y el rendimiento del plato o coctel; el stock de los insumos se descuenta al vender.
          </p>
          <Button size="sm" onClick={openNew} className="gap-1 text-xs gradient-brand text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> Nueva Receta
          </Button>
        </div>

        <TableToolbar
          search={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Buscar receta…"
        />

        <div className="bg-card rounded-xl shadow-card border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Producto preparado</TableHead>
                <TableHead className="text-xs">SKU</TableHead>
                <TableHead className="text-xs">Ingredientes</TableHead>
                <TableHead className="text-xs">Rend.</TableHead>
                <TableHead className="text-xs">Precio venta</TableHead>
                <TableHead className="text-xs">Costo unitario</TableHead>
                <TableHead className="text-xs">Margen</TableHead>
                <TableHead className="text-xs w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableState.paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                    <Utensils className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No hay recetas todavía. Crea la primera para automatizar el descuento de inventario.
                  </TableCell>
                </TableRow>
              ) : (
                tableState.paged.map((p) => {
                  const lines = recipesByProduct.get(p.id) || [];
                  const yieldQty = Math.max(1, Number(p.recipe_yield || 1));
                  const unitCost = computeEscandallo(p.id) / yieldQty;
                  const margin = p.price > 0 ? ((p.price - unitCost) / p.price) * 100 : 0;
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/20">
                      <TableCell className="text-xs font-heading font-semibold">
                        {p.name}
                        {p.description && <span className="block text-[10px] font-normal text-muted-foreground truncate max-w-[220px]">{p.description}</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.sku}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">{lines.length} ingred.</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{yieldQty}</TableCell>
                      <TableCell className="text-xs font-medium">${Number(p.price || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">${unitCost.toFixed(2)}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={margin > 50 ? "default" : margin > 20 ? "secondary" : "destructive"} className="text-[10px]">
                          {margin.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <button onClick={() => openEditor(p)} className="p-1.5 rounded hover:bg-muted text-xs">Editar</button>
                          <button onClick={() => deleteRecipe(p.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? `Receta: ${editingProduct.name}` : "Nueva receta"}</DialogTitle>
              <DialogDescription>
                Los ingredientes son productos del stock. Cada venta del producto preparado descuenta sus insumos.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {!editingProduct && (
                <div className="flex gap-2">
                  <Button size="sm" variant={mode === "new" ? "default" : "outline"} className="text-xs" onClick={() => { setMode("new"); setNewParentId(""); setHeader(emptyHeader); }}>
                    Crear producto nuevo
                  </Button>
                  <Button size="sm" variant={mode === "existing" ? "default" : "outline"} className="text-xs" onClick={() => setMode("existing")}>
                    Usar producto existente
                  </Button>
                </div>
              )}

              {!editingProduct && mode === "existing" && (
                <div>
                  <Label className="text-xs">Producto existente</Label>
                  <Select value={newParentId} onValueChange={selectExistingParent}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {availableParents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Cabecera del producto preparado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nombre del producto preparado *</Label>
                  <Input className="h-9 text-xs" value={header.name} onChange={(e) => setHeader({ ...header, name: e.target.value })} placeholder="Mojito clásico" />
                </div>
                <div>
                  <Label className="text-xs">SKU</Label>
                  <Input className="h-9 text-xs" value={header.sku} onChange={(e) => setHeader({ ...header, sku: e.target.value })} placeholder="Se genera automáticamente" />
                </div>
                <div>
                  <Label className="text-xs">Categoría</Label>
                  <Input className="h-9 text-xs" value={header.category} onChange={(e) => setHeader({ ...header, category: e.target.value })} placeholder="Cocteles" />
                </div>
                <div>
                  <Label className="text-xs">Precio de venta</Label>
                  <Input type="number" step="0.01" className="h-9 text-xs" value={header.price} onChange={(e) => setHeader({ ...header, price: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Rendimiento (porciones que produce)</Label>
                  <Input type="number" step="1" min="1" className="h-9 text-xs" value={header.recipe_yield} onChange={(e) => setHeader({ ...header, recipe_yield: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Descripción</Label>
                  <Textarea rows={2} className="text-xs" value={header.description} onChange={(e) => setHeader({ ...header, description: e.target.value })} placeholder="Descripción comercial que verá el cliente…" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Preparación / notas de cocina</Label>
                  <Textarea rows={3} className="text-xs" value={header.recipe_notes} onChange={(e) => setHeader({ ...header, recipe_notes: e.target.value })} placeholder="Pasos, tiempos, presentación, alérgenos…" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Ingredientes (productos del stock)</Label>
                {draftLines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_110px_36px] gap-2 items-center">
                    <Select value={l.ingredient_id} onValueChange={(v) => updateLine(i, "ingredient_id", v)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ingrediente…" /></SelectTrigger>
                      <SelectContent>
                        {stockProducts
                          .filter((p) => p.id !== parentIdInDialog)
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} — ${Number(p.cost || 0).toFixed(2)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" step="0.01" placeholder="Cantidad"
                      value={l.quantity}
                      onChange={(e) => updateLine(i, "quantity", e.target.value)}
                      className="h-9 text-xs"
                    />
                    <Select value={l.unit} onValueChange={(v) => updateLine(i, "unit", v)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <button onClick={() => removeLine(i)} className="p-2 rounded hover:bg-destructive/10 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addLine} className="text-xs gap-1">
                  <Plus className="h-3.5 w-3.5" /> Añadir ingrediente
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
                <div>
                  <p className="text-[10px] text-muted-foreground">Costo total receta</p>
                  <p className="font-heading font-bold">${draftCost.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Costo unitario</p>
                  <p className="font-heading font-bold">${draftUnitCost.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Margen</p>
                  <p className="font-heading font-bold">{draftMargin.toFixed(1)}%</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveRecipe} disabled={saving} className="gradient-brand text-primary-foreground">
                {saving ? "Guardando…" : "Guardar receta"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
