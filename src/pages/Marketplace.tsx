import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ShoppingCart, Store, MapPin, Filter, Plus, Minus, Trash2,
  X, ChevronRight, Package, Truck, Building2, Check, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Link, useNavigate } from "react-router-dom";

interface MarketProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  image_url: string | null;
  online_stock: number;
  tenant_id: string;
  is_deliverable: boolean | null;
}

interface Tenant {
  id: string;
  name: string;
  business_type: string;
  address: string | null;
}

interface StorePublic {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  delivery_radius_km: number;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
}

interface CartItem extends MarketProduct {
  qty: number;
  tenantName: string;
}

const Marketplace = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [products, setProducts] = useState<MarketProduct[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stores, setStores] = useState<StorePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTenant, setSelectedTenant] = useState("all");
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [maxDistance, setMaxDistance] = useState<number | null>(null); // km filter
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    name: "", phone: "", email: "", delivery_type: "pickup", address: "", notes: "",
  });

  useEffect(() => {
    const load = async () => {
      const [pRes, tRes, sRes] = await Promise.all([
        supabase.from("products").select("id, name, description, price, category, image_url, online_stock, tenant_id, is_deliverable").eq("is_online", true).eq("is_active", true).gt("online_stock", 0),
        supabase.from("tenants_public" as any).select("id, name, business_type"),
        supabase.from("stores_public" as any).select("*"),
      ]);
      if (pRes.data) setProducts(pRes.data as MarketProduct[]);
      if (tRes.data) setTenants(tRes.data as any);
      if (sRes.data) setStores(sRes.data as unknown as StorePublic[]);
      setLoading(false);
    };
    load();
    // Try silent geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    }
  }, []);

  const requestLocation = () => {
    if (!navigator.geolocation) { toast({ title: "Geolocalización no disponible", variant: "destructive" }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }); toast({ title: "Ubicación detectada" }); },
      (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const distanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(x));
  };

  // Compute nearest store distance per tenant
  const tenantDistances = useMemo(() => {
    const out: Record<string, { dist: number; store: StorePublic } | null> = {};
    if (!userPos) return out;
    for (const s of stores) {
      const d = distanceKm(userPos, { lat: s.latitude, lng: s.longitude });
      const cur = out[s.tenant_id];
      if (!cur || d < cur.dist) out[s.tenant_id] = { dist: d, store: s };
    }
    return out;
  }, [stores, userPos]);

  const tenantMap = useMemo(() => {
    const m: Record<string, Tenant> = {};
    tenants.forEach(t => m[t.id] = t);
    return m;
  }, [tenants]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description || "").toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCategory === "all" || p.category === selectedCategory;
      const matchTenant = selectedTenant === "all" || p.tenant_id === selectedTenant;
      const matchDeliv = !deliveryOnly || (p.is_deliverable !== false);
      let matchDist = true;
      if (maxDistance && userPos) {
        const td = tenantDistances[p.tenant_id];
        matchDist = !!td && td.dist <= maxDistance;
      }
      return matchSearch && matchCat && matchTenant && matchDeliv && matchDist;
    }).sort((a, b) => {
      if (!userPos) return 0;
      const da = tenantDistances[a.tenant_id]?.dist ?? 9999;
      const db = tenantDistances[b.tenant_id]?.dist ?? 9999;
      return da - db;
    });
  }, [products, search, selectedCategory, selectedTenant, deliveryOnly, maxDistance, userPos, tenantDistances]);

  const addToCart = (p: MarketProduct) => {
    if (!user) {
      toast({ title: "Inicia sesión", description: "Necesitas una cuenta para comprar", variant: "destructive" });
      navigate("/auth");
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.id === p.id);
      if (existing) {
        if (existing.qty >= p.online_stock) {
          toast({ title: "Stock máximo alcanzado", variant: "destructive" });
          return prev;
        }
        return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...p, qty: 1, tenantName: tenantMap[p.tenant_id]?.name || "" }];
    });
    toast({ title: "Agregado al carrito", description: p.name });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i;
      const newQty = i.qty + delta;
      if (newQty <= 0) return i;
      if (newQty > i.online_stock) return i;
      return { ...i, qty: newQty };
    }));
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i.id !== id));

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  // Group cart by tenant
  const cartByTenant = useMemo(() => {
    const groups: Record<string, CartItem[]> = {};
    cart.forEach(i => {
      if (!groups[i.tenant_id]) groups[i.tenant_id] = [];
      groups[i.tenant_id].push(i);
    });
    return groups;
  }, [cart]);

  const handleCheckout = async () => {
    if (!user) return;
    if (!checkoutForm.name.trim() || !checkoutForm.phone.trim()) {
      toast({ title: "Error", description: "Nombre y teléfono son obligatorios", variant: "destructive" });
      return;
    }
    if (checkoutForm.delivery_type === "delivery" && !checkoutForm.address.trim()) {
      toast({ title: "Error", description: "La dirección es obligatoria para delivery", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      // Create one order per tenant
      for (const [tenantId, items] of Object.entries(cartByTenant)) {
        const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
        const { data: order, error: orderErr } = await supabase.from("online_orders").insert({
          tenant_id: tenantId,
          user_id: user.id,
          customer_name: checkoutForm.name.trim(),
          customer_email: checkoutForm.email.trim() || null,
          customer_phone: checkoutForm.phone.trim(),
          delivery_type: checkoutForm.delivery_type,
          delivery_address: checkoutForm.delivery_type === "delivery" ? checkoutForm.address.trim() : null,
          subtotal,
          total: subtotal,
          notes: checkoutForm.notes.trim() || null,
        } as any).select("id").single();

        if (orderErr) throw orderErr;

        const orderItems = items.map(i => ({
          order_id: order.id,
          product_id: i.id,
          product_name: i.name,
          qty: i.qty,
          price: i.price,
          total: i.price * i.qty,
        }));
        const { error: itemsErr } = await supabase.from("online_order_items").insert(orderItems as any);
        if (itemsErr) throw itemsErr;

        // Decrement online_stock
        for (const item of items) {
          await supabase.from("products").update({ online_stock: item.online_stock - item.qty } as any).eq("id", item.id);
        }
      }

      setOrderSuccess(true);
      setCart([]);
      setCheckoutMode(false);
      setCartOpen(false);
    } catch (err: any) {
      toast({ title: "Error al crear pedido", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const bizIcon = (type: string) => {
    if (type === "restaurante") return "🍽️";
    if (type === "bar") return "🍸";
    return "🏢";
  };

  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">¡Pedido realizado!</h2>
          <p className="text-gray-500">Tu pedido ha sido enviado a los negocios. Te contactarán para coordinar la {checkoutForm.delivery_type === "delivery" ? "entrega" : "recogida"}.</p>
          <div className="flex gap-3 justify-center pt-4">
            <Button variant="outline" onClick={() => setOrderSuccess(false)}>Seguir comprando</Button>
            <Button onClick={() => navigate("/")} className="bg-emerald-600 hover:bg-emerald-700 text-white">Ir al inicio</Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-emerald-100">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Store className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900 hidden sm:block">GaIA ERP Market</span>
          </Link>

          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar productos, negocios..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-gray-50 border-gray-200 rounded-full"
            />
          </div>

          <div className="flex items-center gap-2">
            {!user && (
              <Button variant="outline" size="sm" onClick={() => navigate("/auth")} className="rounded-full text-xs">
                Iniciar sesión
              </Button>
            )}
            <Sheet open={cartOpen} onOpenChange={setCartOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="relative rounded-full">
                  <ShoppingCart className="h-4 w-4" />
                  {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">{cartCount}</span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md flex flex-col">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" /> Carrito ({cartCount})
                  </SheetTitle>
                </SheetHeader>

                {!checkoutMode ? (
                  <>
                    <div className="flex-1 overflow-y-auto space-y-3 py-4">
                      {cart.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                          <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
                          <p>Tu carrito está vacío</p>
                        </div>
                      )}
                      {Object.entries(cartByTenant).map(([tid, items]) => (
                        <div key={tid} className="space-y-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase">{bizIcon(tenantMap[tid]?.business_type || "")} {tenantMap[tid]?.name}</p>
                          {items.map(item => (
                            <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                              <div className="h-12 w-12 rounded-lg bg-emerald-100 flex items-center justify-center text-xl shrink-0">
                                {item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover rounded-lg" /> : "📦"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{item.name}</p>
                                <p className="text-xs text-emerald-600 font-semibold">${(item.price * item.qty).toFixed(2)}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => updateQty(item.id, -1)} className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300"><Minus className="h-3 w-3" /></button>
                                <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                                <button onClick={() => updateQty(item.id, 1)} className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300"><Plus className="h-3 w-3" /></button>
                              </div>
                              <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    {cart.length > 0 && (
                      <div className="border-t pt-4 space-y-3">
                        <div className="flex justify-between text-lg font-bold">
                          <span>Total</span>
                          <span className="text-emerald-600">${cartTotal.toFixed(2)}</span>
                        </div>
                        <Button onClick={() => setCheckoutMode(true)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full">
                          Continuar al pedido <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 overflow-y-auto py-4 space-y-4">
                    <button onClick={() => setCheckoutMode(false)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
                      <ArrowLeft className="h-4 w-4" /> Volver al carrito
                    </button>
                    <div className="space-y-3">
                      <div><Label>Nombre *</Label><Input value={checkoutForm.name} onChange={e => setCheckoutForm(f => ({ ...f, name: e.target.value }))} placeholder="Tu nombre completo" /></div>
                      <div><Label>Teléfono *</Label><Input value={checkoutForm.phone} onChange={e => setCheckoutForm(f => ({ ...f, phone: e.target.value }))} placeholder="+53 5555 5555" /></div>
                      <div><Label>Email</Label><Input type="email" value={checkoutForm.email} onChange={e => setCheckoutForm(f => ({ ...f, email: e.target.value }))} placeholder="tu@email.com" /></div>
                      <div>
                        <Label>Tipo de entrega</Label>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <button
                            onClick={() => setCheckoutForm(f => ({ ...f, delivery_type: "pickup" }))}
                            className={`p-3 rounded-xl border-2 text-center text-sm transition-all ${checkoutForm.delivery_type === "pickup" ? "border-emerald-500 bg-emerald-50" : "border-gray-200"}`}
                          >
                            <Building2 className="h-5 w-5 mx-auto mb-1" />
                            Recogida
                          </button>
                          <button
                            onClick={() => setCheckoutForm(f => ({ ...f, delivery_type: "delivery" }))}
                            className={`p-3 rounded-xl border-2 text-center text-sm transition-all ${checkoutForm.delivery_type === "delivery" ? "border-emerald-500 bg-emerald-50" : "border-gray-200"}`}
                          >
                            <Truck className="h-5 w-5 mx-auto mb-1" />
                            Delivery
                          </button>
                        </div>
                      </div>
                      {checkoutForm.delivery_type === "delivery" && (
                        <div><Label>Dirección de entrega *</Label><Textarea value={checkoutForm.address} onChange={e => setCheckoutForm(f => ({ ...f, address: e.target.value }))} placeholder="Calle, número, municipio..." /></div>
                      )}
                      <div><Label>Notas</Label><Textarea value={checkoutForm.notes} onChange={e => setCheckoutForm(f => ({ ...f, notes: e.target.value }))} placeholder="Instrucciones especiales..." /></div>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-emerald-600">${cartTotal.toFixed(2)}</span>
                    </div>
                    <Button onClick={handleCheckout} disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full">
                      {submitting ? "Procesando..." : "Confirmar Pedido"}
                    </Button>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 py-12 sm:py-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-2xl mx-auto">
            <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 mb-4">
              Descubre lo mejor de <span className="text-emerald-600">tu ciudad</span>
            </h1>
            <p className="text-gray-500 text-lg">Restaurantes, bares y negocios locales. Pide online y recoge o recibe en tu puerta.</p>
          </motion.div>
        </div>
      </section>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 pb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge
            variant={selectedCategory === "all" ? "default" : "outline"}
            className={`cursor-pointer transition-all ${selectedCategory === "all" ? "bg-emerald-600 text-white" : "hover:bg-emerald-50"}`}
            onClick={() => setSelectedCategory("all")}
          >
            Todos
          </Badge>
          {categories.map(cat => (
            <Badge
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              className={`cursor-pointer transition-all ${selectedCategory === cat ? "bg-emerald-600 text-white" : "hover:bg-emerald-50"}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Badge>
          ))}
          <Separator orientation="vertical" className="h-6 mx-2 hidden sm:block" />
          <Select value={selectedTenant} onValueChange={setSelectedTenant}>
            <SelectTrigger className="w-[180px] h-8 text-xs rounded-full">
              <SelectValue placeholder="Todos los negocios" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los negocios</SelectItem>
              {tenants.map(t => (
                <SelectItem key={t.id} value={t.id}>{bizIcon(t.business_type)} {t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Products Grid */}
      <main className="max-w-7xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <h3 className="text-xl font-medium text-gray-600">No hay productos disponibles</h3>
            <p className="text-sm mt-1">Prueba cambiando los filtros</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <AnimatePresence>
              {filtered.map((p, i) => {
                const tenant = tenantMap[p.tenant_id];
                const inCart = cart.find(c => c.id === p.id);
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow group"
                  >
                    <div className="aspect-square bg-gradient-to-br from-emerald-50 to-teal-50 relative overflow-hidden">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-5xl opacity-60">
                          {tenant?.business_type === "restaurante" ? "🍽️" : tenant?.business_type === "bar" ? "🍹" : "📦"}
                        </div>
                      )}
                      {inCart && (
                        <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">{inCart.qty}</div>
                      )}
                    </div>
                    <div className="p-3 space-y-1.5">
                      {tenant && (
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide truncate">
                          {bizIcon(tenant.business_type)} {tenant.name}
                        </p>
                      )}
                      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">{p.name}</h3>
                      {p.description && <p className="text-[11px] text-gray-400 line-clamp-1">{p.description}</p>}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-lg font-bold text-emerald-600">${p.price.toFixed(2)}</span>
                        <Button
                          size="sm"
                          onClick={() => addToCart(p)}
                          className="h-8 w-8 p-0 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-gray-400">{p.online_stock} disponibles</p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Floating cart button mobile */}
      {cartCount > 0 && !cartOpen && (
        <motion.div
          initial={{ y: 100 }} animate={{ y: 0 }}
          className="fixed bottom-4 left-4 right-4 sm:hidden z-50"
        >
          <Button
            onClick={() => setCartOpen(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg h-12 text-base"
          >
            <ShoppingCart className="h-5 w-5 mr-2" />
            Ver carrito ({cartCount}) — ${cartTotal.toFixed(2)}
          </Button>
        </motion.div>
      )}
    </div>
  );
};

export default Marketplace;
