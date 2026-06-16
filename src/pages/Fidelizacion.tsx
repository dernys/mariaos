import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MiniStatCard, StatRow } from "@/components/data/MiniStatCard";
import { Award, Ticket, Tag, Plus, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const tierColor: Record<string, string> = { bronze: "bg-orange-500/20 text-orange-500", silver: "bg-slate-400/20 text-slate-400", gold: "bg-amber-500/20 text-amber-500", platinum: "bg-purple-500/20 text-purple-500" };

export default function Fidelizacion() {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const [settings, setSettings] = useState<any>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [promos, setPromos] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [openCoupon, setOpenCoupon] = useState(false);
  const [openPromo, setOpenPromo] = useState(false);
  const [coupon, setCoupon] = useState<any>({ code: "", discount_type: "percent", discount_value: 10, min_amount: 0, valid_until: "", max_uses: null });
  const [promo, setPromo] = useState<any>({ name: "", promo_type: "percent_off", discount_value: 10, scope: "all", valid_until: "" });

  const load = async () => {
    if (!tenantId) return;
    const [s, c, p, cu, mv] = await Promise.all([
      supabase.from("loyalty_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
      supabase.from("coupons").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("promotions").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("customers").select("id,name,loyalty_points,loyalty_tier,total_spent,visits_count").eq("tenant_id", tenantId).order("loyalty_points", { ascending: false }),
      supabase.from("loyalty_movements").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50),
    ]);
    setSettings(s.data);
    setCoupons(c.data || []);
    setPromos(p.data || []);
    setCustomers(cu.data || []);
    setMovements(mv.data || []);
  };

  useEffect(() => { load(); }, [tenantId]);

  const saveSettings = async (patch: any) => {
    if (!tenantId) return;
    if (settings?.id) {
      await supabase.from("loyalty_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", settings.id);
    } else {
      await supabase.from("loyalty_settings").insert({ tenant_id: tenantId, ...patch });
    }
    toast.success("Configuración guardada");
    load();
  };

  const createCoupon = async () => {
    if (!tenantId || !coupon.code) { toast.error("Código requerido"); return; }
    const payload = { ...coupon, tenant_id: tenantId, code: coupon.code.toUpperCase(), valid_until: coupon.valid_until || null, max_uses: coupon.max_uses || null };
    const { error } = await supabase.from("coupons").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Cupón creado");
    setOpenCoupon(false);
    setCoupon({ code: "", discount_type: "percent", discount_value: 10, min_amount: 0, valid_until: "", max_uses: null });
    load();
  };

  const createPromo = async () => {
    if (!tenantId || !promo.name) { toast.error("Nombre requerido"); return; }
    const { error } = await supabase.from("promotions").insert({ ...promo, tenant_id: tenantId, valid_until: promo.valid_until || null });
    if (error) { toast.error(error.message); return; }
    toast.success("Promoción creada");
    setOpenPromo(false);
    setPromo({ name: "", promo_type: "percent_off", discount_value: 10, scope: "all", valid_until: "" });
    load();
  };

  const totalPoints = customers.reduce((a, c) => a + Number(c.loyalty_points || 0), 0);
  const activeCoupons = coupons.filter((c) => c.is_active).length;
  const activePromos = promos.filter((p) => p.is_active).length;

  return (
    <AppLayout title={t("nav.items.loyalty")}>
      <Tabs defaultValue="loyalty" className="space-y-4">
        <TabsList>
          <TabsTrigger value="loyalty">Fidelización</TabsTrigger>
          <TabsTrigger value="coupons">Cupones</TabsTrigger>
          <TabsTrigger value="promos">Promociones</TabsTrigger>
        </TabsList>

        <TabsContent value="loyalty" className="space-y-4">
          <StatRow>
            <MiniStatCard label="Clientes con puntos" value={customers.filter(c => Number(c.loyalty_points) > 0).length} icon={Award} tone="primary" />
            <MiniStatCard label="Puntos en circulación" value={totalPoints.toLocaleString()} icon={Star} tone="success" />
            <MiniStatCard label="Clientes Oro/Platino" value={customers.filter(c => ["gold","platinum"].includes(c.loyalty_tier)).length} icon={Award} tone="warning" />
          </StatRow>

          <Card className="p-4">
            <h3 className="font-heading font-semibold mb-3">Configuración del programa</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <Label>Programa activo</Label>
                <Switch checked={settings?.enabled ?? true} onCheckedChange={(v) => saveSettings({ enabled: v })} />
              </div>
              <div>
                <Label className="text-xs">Puntos por unidad gastada</Label>
                <Input type="number" step="0.01" defaultValue={settings?.points_per_unit ?? 1} onBlur={(e) => saveSettings({ points_per_unit: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Valor por punto al canjear</Label>
                <Input type="number" step="0.01" defaultValue={settings?.value_per_point ?? 0.01} onBlur={(e) => saveSettings({ value_per_point: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Umbral Plata</Label>
                <Input type="number" defaultValue={settings?.silver_threshold ?? 1000} onBlur={(e) => saveSettings({ silver_threshold: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Umbral Oro</Label>
                <Input type="number" defaultValue={settings?.gold_threshold ?? 5000} onBlur={(e) => saveSettings({ gold_threshold: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Umbral Platino</Label>
                <Input type="number" defaultValue={settings?.platinum_threshold ?? 20000} onBlur={(e) => saveSettings({ platinum_threshold: Number(e.target.value) })} />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-heading font-semibold mb-3">Top clientes por puntos</h3>
            <Table>
              <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Nivel</TableHead><TableHead className="text-right">Puntos</TableHead><TableHead className="text-right">Total gastado</TableHead><TableHead className="text-right">Visitas</TableHead></TableRow></TableHeader>
              <TableBody>{customers.slice(0, 20).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs">{c.name}</TableCell>
                  <TableCell><Badge className={`text-[10px] capitalize ${tierColor[c.loyalty_tier] || ""}`}>{c.loyalty_tier}</Badge></TableCell>
                  <TableCell className="text-right text-xs font-bold">{Number(c.loyalty_points).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-xs">${Number(c.total_spent || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-xs">{c.visits_count}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Card>

          <Card className="p-4">
            <h3 className="font-heading font-semibold mb-3">Movimientos recientes</h3>
            <Table>
              <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Puntos</TableHead><TableHead>Notas</TableHead></TableRow></TableHeader>
              <TableBody>{movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(m.created_at), "dd/MM HH:mm")}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{m.movement_type}</Badge></TableCell>
                  <TableCell className={`text-right text-xs font-bold ${Number(m.points) > 0 ? "text-emerald-500" : "text-destructive"}`}>{Number(m.points) > 0 ? "+" : ""}{m.points}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.notes}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="coupons" className="space-y-4">
          <StatRow>
            <MiniStatCard label="Cupones activos" value={activeCoupons} icon={Ticket} tone="primary" />
            <MiniStatCard label="Cupones totales" value={coupons.length} icon={Ticket} />
            <MiniStatCard label="Usos totales" value={coupons.reduce((a, c) => a + (c.uses_count || 0), 0)} tone="success" />
          </StatRow>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-semibold">Cupones de descuento</h3>
              <Button size="sm" onClick={() => setOpenCoupon(true)} className="gap-1"><Plus className="h-4 w-4" /> Nuevo cupón</Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descuento</TableHead><TableHead className="text-right">Mín. compra</TableHead><TableHead>Vigencia</TableHead><TableHead className="text-right">Usos</TableHead><TableHead>Estado</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>{coupons.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs font-mono font-bold">{c.code}</TableCell>
                  <TableCell className="text-xs">{c.discount_type === "percent" ? `${c.discount_value}%` : `$${c.discount_value}`}</TableCell>
                  <TableCell className="text-right text-xs">${c.min_amount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.valid_until ? format(new Date(c.valid_until), "dd/MM/yy") : "Sin vencimiento"}</TableCell>
                  <TableCell className="text-right text-xs">{c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</TableCell>
                  <TableCell><Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px]">{c.is_active ? "Activo" : "Inactivo"}</Badge></TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => { await supabase.from("coupons").delete().eq("id", c.id); load(); }}><Trash2 className="h-3 w-3" /></Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="promos" className="space-y-4">
          <StatRow>
            <MiniStatCard label="Promos activas" value={activePromos} icon={Tag} tone="primary" />
            <MiniStatCard label="Promos totales" value={promos.length} icon={Tag} />
          </StatRow>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-semibold">Promociones automáticas</h3>
              <Button size="sm" onClick={() => setOpenPromo(true)} className="gap-1"><Plus className="h-4 w-4" /> Nueva promo</Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Alcance</TableHead><TableHead>Vigencia</TableHead><TableHead>Estado</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>{promos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs font-semibold">{p.name}</TableCell>
                  <TableCell className="text-xs">{p.promo_type}</TableCell>
                  <TableCell className="text-xs">{p.discount_value}</TableCell>
                  <TableCell className="text-xs">{p.scope}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.valid_until ? format(new Date(p.valid_until), "dd/MM/yy") : "Sin vto"}</TableCell>
                  <TableCell><Badge variant={p.is_active ? "default" : "secondary"} className="text-[10px]">{p.is_active ? "Activa" : "Inactiva"}</Badge></TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => { await supabase.from("promotions").delete().eq("id", p.id); load(); }}><Trash2 className="h-3 w-3" /></Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openCoupon} onOpenChange={setOpenCoupon}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo cupón</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Código</Label><Input value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value })} placeholder="VERANO20" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Tipo</Label>
                <Select value={coupon.discount_type} onValueChange={(v) => setCoupon({ ...coupon, discount_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="percent">Porcentaje %</SelectItem><SelectItem value="amount">Monto fijo $</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Valor</Label><Input type="number" value={coupon.discount_value} onChange={(e) => setCoupon({ ...coupon, discount_value: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Compra mínima</Label><Input type="number" value={coupon.min_amount} onChange={(e) => setCoupon({ ...coupon, min_amount: Number(e.target.value) })} /></div>
              <div><Label>Máx. usos</Label><Input type="number" value={coupon.max_uses ?? ""} onChange={(e) => setCoupon({ ...coupon, max_uses: e.target.value ? Number(e.target.value) : null })} placeholder="Ilimitado" /></div>
            </div>
            <div><Label>Válido hasta</Label><Input type="date" value={coupon.valid_until} onChange={(e) => setCoupon({ ...coupon, valid_until: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createCoupon}>Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openPromo} onOpenChange={setOpenPromo}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva promoción</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={promo.name} onChange={(e) => setPromo({ ...promo, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Tipo</Label>
                <Select value={promo.promo_type} onValueChange={(v) => setPromo({ ...promo, promo_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent_off">% descuento</SelectItem>
                    <SelectItem value="amount_off">$ descuento</SelectItem>
                    <SelectItem value="2x1">2x1</SelectItem>
                    <SelectItem value="bundle">Bundle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Valor</Label><Input type="number" value={promo.discount_value} onChange={(e) => setPromo({ ...promo, discount_value: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Alcance</Label>
              <Select value={promo.scope} onValueChange={(v) => setPromo({ ...promo, scope: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="category">Categoría</SelectItem><SelectItem value="product">Producto</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Válido hasta</Label><Input type="date" value={promo.valid_until} onChange={(e) => setPromo({ ...promo, valid_until: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={createPromo}>Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
