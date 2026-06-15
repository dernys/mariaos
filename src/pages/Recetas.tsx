import { AppLayout } from "@/components/AppLayout";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  price: number;
  cost: number;
  category: string | null;
  product_type: string | null;
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

export default function Recetas() {
  const tenantId = useTenant();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<RecipeLine[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftLines, setDraftLines] = useState<{ ingredient_id: string; quantity: string; unit: string }[]>([]);

  const fetchAll = async () => {
    if (!tenantId) return;
    const [pRes, rRes] = await Promise.all([
      supabase.from("products").select("id,name,sku,price,cost,category,product_type,is_active").eq("is_active", true).order("name"),
      supabase.from("product_recipes").select("*"),
    ]);
    if (pRes.data) setProducts(pRes.data as Product[]);
    if (rRes.data) setRecipes(rRes.data as RecipeLine[]);
  };
  useEffect(() => { fetchAll(); }, [tenantId]);

  // Group recipes by product
  const recipesByProduct = useMemo(() => {
    const m = new Map<string, RecipeLine[]>();
    recipes.forEach((r) => {
      if (!m.has(r.product_id)) m.set(r.product_id, []);
      m.get(r.product_id)!.push(r);
    });
    return m;
  }, [recipes]);

  // Products that act as parents (have at least one recipe) OR are marked prepared
  const productsWithRecipes = useMemo(
    () => products.filter((p) => recipesByProduct.has(p.id) || p.product_type === "prepared"),
    [products, recipesByProduct]
  );

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

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

  const openEditor = (p: Product) => {
    setEditingProduct(p);
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
    setDraftLines([{ ingredient_id: "", quantity: "", unit: "unidad" }]);
    setDialogOpen(true);
  };

  const [newParentId, setNewParentId] = useState("");

  const addLine = () => setDraftLines([...draftLines, { ingredient_id: "", quantity: "", unit: "unidad" }]);
  const removeLine = (i: number) => setDraftLines(draftLines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, val: string) => {
    const next = [...draftLines];
    (next[i] as any)[field] = val;
    setDraftLines(next);
  };

  const saveRecipe = async () => {
    const parentId = editingProduct?.id || newParentId;
    if (!parentId) {
      toast({ title: "Selecciona el producto preparado", variant: "destructive" });
      return;
    }
    const valid = draftLines.filter((l) => l.ingredient_id && parseFloat(l.quantity) > 0);
    if (valid.length === 0) {
      toast({ title: "Agrega al menos un ingrediente", variant: "destructive" });
      return;
    }
    // Replace recipe atomically
    const { error: delErr } = await supabase.from("product_recipes").delete().eq("product_id", parentId);
    if (delErr) { toast({ title: "Error", description: delErr.message, variant: "destructive" }); return; }
    const { error: insErr } = await supabase.from("product_recipes").insert(
      valid.map((l) => ({
        tenant_id: tenantId,
        product_id: parentId,
        ingredient_id: l.ingredient_id,
        quantity: parseFloat(l.quantity),
        unit: l.unit,
      }))
    );
    if (insErr) { toast({ title: "Error", description: insErr.message, variant: "destructive" }); return; }
    // Mark parent as prepared
    await supabase.from("products").update({ product_type: "prepared" }).eq("id", parentId);
    toast({ title: "Receta guardada", description: `${valid.length} ingredientes` });
    setDialogOpen(false);
    setNewParentId("");
    fetchAll();
  };

  const deleteRecipe = async (productId: string) => {
    if (!confirm("¿Eliminar la receta completa?")) return;
    const { error } = await supabase.from("product_recipes").delete().eq("product_id", productId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await supabase.from("products").update({ product_type: null }).eq("id", productId);
    toast({ title: "Receta eliminada" });
    fetchAll();
  };

  const availableParents = products.filter((p) => !recipesByProduct.has(p.id));

  return (
    <AppLayout title="Recetas / Escandallos">
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
              <p className="text-[10px] text-muted-foreground">Insumos disponibles</p>
              <p className="font-heading font-bold text-lg">{products.length - productsWithRecipes.length}</p>
            </div>
          </CardContent></Card>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">
            Define los ingredientes de tus platos y cocteles. El stock se descuenta automáticamente al vender.
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
                <TableHead className="text-xs">Precio venta</TableHead>
                <TableHead className="text-xs">Costo (escandallo)</TableHead>
                <TableHead className="text-xs">Margen</TableHead>
                <TableHead className="text-xs w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableState.paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-xs">
                    <Utensils className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No hay recetas todavía. Crea la primera para automatizar el descuento de inventario.
                  </TableCell>
                </TableRow>
              ) : (
                tableState.paged.map((p) => {
                  const lines = recipesByProduct.get(p.id) || [];
                  const escandallo = computeEscandallo(p.id);
                  const margin = p.price > 0 ? ((p.price - escandallo) / p.price) * 100 : 0;
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/20">
                      <TableCell className="text-xs font-heading font-semibold">{p.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.sku}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">{lines.length} ingred.</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">${Number(p.price || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">${escandallo.toFixed(2)}</TableCell>
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
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingProduct ? `Receta: ${editingProduct.name}` : "Nueva receta"}</DialogTitle>
              <DialogDescription>
                Cada ingrediente descuenta stock automáticamente al vender el producto preparado.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {!editingProduct && (
                <div>
                  <Label className="text-xs">Producto preparado (plato / coctel)</Label>
                  <Select value={newParentId} onValueChange={setNewParentId}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {availableParents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Ingredientes</Label>
                {draftLines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_110px_36px] gap-2 items-center">
                    <Select value={l.ingredient_id} onValueChange={(v) => updateLine(i, "ingredient_id", v)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ingrediente…" /></SelectTrigger>
                      <SelectContent>
                        {products
                          .filter((p) => p.id !== (editingProduct?.id || newParentId))
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
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
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveRecipe} className="gradient-brand text-primary-foreground">Guardar receta</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
