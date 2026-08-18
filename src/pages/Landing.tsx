import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import {
  ShoppingCart, Package, Users, BarChart3, Truck, ChefHat, Receipt, Globe,
  Shield, Zap, Smartphone, Cloud, ArrowRight, Check, Sparkles, Store, Utensils, Building2, PlayCircle, Loader2,
  Bot, Brain, Wallet, Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import mariaLogo from "@/assets/maria-logo.png";
import heroBg from "@/assets/landing-hero-bg.jpg";

import { Clock4 } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Heart } from "lucide-react";

const NAV_LINKS = [
  { href: "#modulos", label: "Módulos" },
  { href: "#tour", label: "Tour" },
  { href: "#demo", label: "Demo" },
  { href: "#nombre", label: "El nombre" },
  { href: "#plataforma", label: "Plataforma" },
  { href: "#contacto", label: "Contacto" },
];

const moduleSlides = [
  { img: "/landing/modules/dashboard.jpg", icon: BarChart3, title: "Dashboard Ejecutivo", desc: "Indicadores del negocio en vivo: ventas, ticket promedio, margen bruto, valor de inventario y rendimiento por tienda, con comparativa entre periodos.", features: ["KPIs con deltas", "Rangos y comparativas", "Desglose por tienda"] },
  { img: "/landing/modules/pos.jpg", icon: ShoppingCart, title: "Punto de Venta Adaptable", desc: "POS especializado para Bar, Restaurante y Retail. Turno obligatorio, ventas aparcadas, pagos divididos, multimoneda e impresión de ticket.", features: ["3 modos por rubro", "Multi-pago y multimoneda", "Ticket térmico"] },
  { img: "/landing/modules/cocina.jpg", icon: ChefHat, title: "Cocina (KDS) y Mesas", desc: "Comandas enviadas a cocina en tiempo real, con estados, notas por ítem, seguimiento de la orden y cobro directo desde la comanda.", features: ["Realtime multi-dispositivo", "Notas y modificaciones", "Cobro de comanda"] },
  { img: "/landing/modules/inventario.jpg", icon: Package, title: "Inventario y Kardex", desc: "Stock por ubicación, kardex valorizado, movimientos auditables, lotes y series, conteos físicos y alertas de stock bajo.", features: ["Stock por almacén", "Kardex y movimientos", "Alertas de reposición"] },
  { img: "/landing/modules/transferencias.jpg", icon: Truck, title: "Transferencias y Almacenes", desc: "Traslados entre almacenes y tiendas con envío, recepción, transportista y consola de integridad de existencias.", features: ["Envío y recepción", "Trazabilidad completa", "Consola de integridad"] },
  { img: "/landing/modules/recetas.jpg", icon: Utensils, title: "Recetas y Escandallo", desc: "Recetas como mezcla de productos de stock, con costo teórico, margen calculado y descuento automático de ingredientes al vender.", features: ["Escandallo en vivo", "Costo y margen", "Descuento por venta"] },
  { img: "/landing/modules/compras.jpg", icon: Receipt, title: "Compras y Proveedores", desc: "Órdenes de compra, recepción de mercancía, generación automática de cuentas por pagar y control de pagos a proveedores.", features: ["OC y recepción", "Cuentas por pagar", "Historial por proveedor"] },
  { img: "/landing/modules/contabilidad.jpg", icon: Wallet, title: "Contabilidad y Maestro de Cuentas", desc: "Partida doble real: maestro de cuentas configurable, mapeo de operaciones a cuentas, libro diario, mayor y consola de auditoría del motor financiero.", features: ["Mapeo operación→cuenta", "Diario y mayor", "Consola de auditoría"] },
  { img: "/landing/modules/reportes.jpg", icon: BarChart3, title: "Reportes Financieros", desc: "Estado de Resultados, Balance General, Balance de Comprobación, Libro Diario y Libro Mayor calculados en el servidor y exportables.", features: ["P&L y balance", "Comprobación cuadrada", "Exportación CSV/PDF"] },
  { img: "/landing/modules/turnos.jpg", icon: Clock4, title: "Turnos y Flujo de Caja", desc: "Apertura y cierre por tienda y cajero, movimientos de caja categorizados y asiento contable por cada movimiento registrado.", features: ["Un turno abierto por tienda", "Caja contabilizada", "Cierre auditado"] },
  { img: "/landing/modules/facturas.jpg", icon: Receipt, title: "Facturación", desc: "Facturación a partir de ventas realizadas, ventas rápidas con múltiples pagos, PDF profesional y transmisión electrónica UBL 2.1.", features: ["Factura desde venta", "PDF y email", "UBL 2.1 + XML"] },
  { img: "/landing/modules/tesoreria.jpg", icon: Wallet, title: "Tesorería", desc: "Posición de caja y bancos, cuentas por cobrar y por pagar y proyección de flujo con datos del libro mayor.", features: ["Caja y bancos", "CxC y CxP", "Proyección de flujo"] },
  { img: "/landing/modules/clientes.jpg", icon: Users, title: "Clientes (CRM)", desc: "Saldos, crédito otorgado, fidelización y timeline de actividad por cliente. El crédito en POS exige cliente o empleado asociado.", features: ["Crédito y saldos", "Puntos y fidelización", "Timeline de actividad"] },
  { img: "/landing/modules/rrhh.jpg", icon: Users, title: "RRHH y Nóminas", desc: "Empleados, puestos, contratos, fichaje, vacaciones, horas extras y nóminas con ciclo Borrador → Aprobada → Pagada y firma registrada.", features: ["Nómina por lotes", "Aprobación y firma", "Fichaje y horarios"] },
  { img: "/landing/modules/pedidos-online.jpg", icon: Globe, title: "Pedidos Online y Delivery", desc: "Captura de pedidos del marketplace, asignación sugerida de repartidor, historial de acciones y seguimiento de estado en tiempo real.", features: ["Sugerencia de repartidor", "Historial y acciones", "Seguimiento realtime"] },
  { img: "/landing/modules/marketplace.jpg", icon: Globe, title: "Marketplace Público", desc: "Tienda pública PWA con búsqueda, filtros, paginación, reseñas verificadas, entrega a domicilio o recogida y registro de comprador.", features: ["Filtros y paginación", "Reseñas de compradores", "Delivery o recogida"] },
  { img: "/landing/modules/command-center.jpg", icon: Bot, title: "Command Center de IA", desc: "Agentes especializados (CFO, inventario, operaciones, cumplimiento…) con acciones registradas, decisiones sugeridas y señales operativas.", features: ["7 agentes por empresa", "Decisiones sugeridas", "Acciones auditadas"] },
  { img: "/landing/modules/digital-twin.jpg", icon: Brain, title: "Digital Twin", desc: "Simula precio, costo, demanda y gastos fijos sobre tus datos reales y obtén P&L proyectado, punto de equilibrio y concentración de ventas.", features: ["Escenarios what-if", "Punto de equilibrio", "Grafo de conocimiento"] },
  { img: "/landing/modules/risk.jpg", icon: Shield, title: "Motor de Riesgo", desc: "Escáner de riesgos operativos y contables: descuadres, accesos inusuales, stock negativo y anomalías de caja con alertas gestionables.", features: ["Escaneo bajo demanda", "Alertas gestionables", "Foco antifraude"] },
  { img: "/landing/modules/roles.jpg", icon: Shield, title: "Roles y Permisos", desc: "Matriz RBAC por módulo y acción resuelta en el servidor, con módulos visibles según el tipo de negocio de cada empresa.", features: ["Matriz por módulo", "Resolución server-side", "Menú por tipo de negocio"] },
];


const demoBusinessTypes = [
  { id: "bar", icon: Store, title: "Bar / Cafetería", desc: "Cuentas abiertas, comanda rápida y cobro por consumición.", accent: "from-amber-500 to-orange-500" },
  { id: "restaurant", icon: Utensils, title: "Restaurante", desc: "Mapa de mesas, KDS de cocina y división de cuentas.", accent: "from-rose-500 to-red-500" },
  { id: "retail", icon: Building2, title: "Retail / Empresa", desc: "Búsqueda por SKU, multi-tienda y facturación.", accent: "from-primary to-emerald-500" },
];

const modules = [
  { icon: ShoppingCart, title: "POS Adaptable", desc: "Tres modos especializados: Bar con cuentas, Restaurante con mapa de mesas y KDS, y Retail con búsqueda por SKU/código de barras.", bullets: ["Cobro en segundos", "Pagos divididos y multimoneda", "QR, tarjeta, efectivo y crédito"] },
  { icon: Package, title: "Inventario Inteligente", desc: "Control total de stock con recetas (BOM), múltiples almacenes, transferencias, conteos cíclicos y alertas automáticas.", bullets: ["Movimientos auditables", "Recetas y descuento automático", "Inteligencia de stock con IA"] },
  { icon: ChefHat, title: "Operaciones Restaurante", desc: "Mapa de mesas en tiempo real, KDS de cocina sincronizado, división de cuentas y gestión completa del salón.", bullets: ["Realtime entre dispositivos", "Cocina conectada", "Mesas, bar y delivery"] },
  { icon: Globe, title: "Marketplace Online", desc: "Tienda online pública con geolocalización: tus clientes encuentran tus productos según la ubicación del dispositivo.", bullets: ["PWA instalable", "Registro y conversión a cliente", "Catálogo por tienda"] },
  { icon: Receipt, title: "Facturación Electrónica", desc: "Emisión local y electrónica con UBL 2.1, CUFE y transmisión por webhook a tu PAC. PDF profesional incluido.", bullets: ["UBL 2.1 + XML firmado", "Compatible LATAM", "Envío por correo automático"] },
  { icon: Users, title: "Clientes, RRHH y Nómina", desc: "Saldos, fidelización, asistencia, horarios y nómina automatizada, con timeline de actividad y portal del empleado.", bullets: ["Programa de fidelización", "Nómina y adelantos", "Portal del empleado"] },
  { icon: Truck, title: "Delivery y Repartos", desc: "Zonas, repartidores y asignación de pedidos en tiempo real para coordinar tu logística de última milla.", bullets: ["Zonas configurables", "Asignación realtime", "Seguimiento por pedido"] },
  { icon: Wallet, title: "Tesorería y Contabilidad", desc: "Cuentas bancarias, conciliación, flujo de caja y partida doble validada con reportes financieros exportables.", bullets: ["Conciliación bancaria", "Asientos auditables", "Balances y P&L"] },
  { icon: BarChart3, title: "Analytics y Reportes", desc: "Dashboards en vivo, reportes operativos y financieros con exportación CSV/PDF y filtros por tienda y turno.", bullets: ["KPIs por tienda y turno", "Reportes exportables", "Comparativas históricas"] },
  { icon: Bot, title: "Agentes de IA Autónomos", desc: "Agentes especializados que vigilan inventario, ventas y riesgo. Toman decisiones recomendadas en tu Command Center.", bullets: ["Command Center 24/7", "Decisiones recomendadas", "Memoria de negocio"] },
  { icon: Brain, title: "Workflows y Digital Twin", desc: "Automatiza procesos con flujos sin código y simula escenarios con el gemelo digital de tu operación.", bullets: ["Workflows visuales", "Simulación de escenarios", "Motor de riesgo"] },
  { icon: Shield, title: "Multi-empresa y Roles", desc: "Multi-tenant con RLS, roles dinámicos por módulo, auditoría completa y panel de superadmin para todo el grupo.", bullets: ["RBAC por módulo", "Auditoría detallada", "Panel superadmin"] },
];

const platformFeatures = [
  { icon: Shield, title: "Multi-tenant Seguro", desc: "Aislamiento total por empresa con Row-Level Security." },
  { icon: Zap, title: "Realtime Nativo", desc: "Mesas, cocina, pedidos y caja sincronizados al instante." },
  { icon: Smartphone, title: "Mobile-first PWA", desc: "Instalable en móvil con soporte offline y pagos." },
  { icon: Languages, title: "Multi-idioma", desc: "Interfaz en español, inglés y portugués (Brasil)." },
  { icon: Bot, title: "IA Integrada", desc: "Agentes autónomos y asistentes con Lovable AI Gateway." },
  { icon: Cloud, title: "Cloud Escalable", desc: "Infraestructura gestionada lista para crecer." },
];

// (Sección "Capturas reales" eliminada: el carrusel del tour ya muestra las pantallas reales sin duplicarlas)

interface DemoBusiness {
  name: string;
  type: string;
  products: number;
  sales: number;
  revenue: number;
  employees: number;
}
interface DemoStats {
  tenants: number;
  products: number;
  sales: number;
  revenue: number;
  journal_entries: number;
  employees: number;
  events: number;
  agents: number;
  businesses: DemoBusiness[];
}
interface DemoTenant {
  tenant_id: string;
  name: string;
  business_type: string;
  roles: { role: string; email: string }[];
}

const DEMO_ROLES = [
  { role: "admin", label: "Administrador", desc: "Acceso total" },
  { role: "gerente", label: "Gerente", desc: "Operación y reportes" },
  { role: "cajero", label: "Cajero", desc: "Solo POS y turnos" },
];

const TYPE_ALIASES: Record<string, string[]> = {
  bar: ["bar"],
  restaurant: ["restaurant", "restaurante"],
  retail: ["empresa", "retail", "tienda"],
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-CU", { maximumFractionDigits: 0 }).format(n || 0);

const Landing = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [selected, setSelected] = useState(0);
  const [stats, setStats] = useState<DemoStats | null>(null);
  const [demoTenants, setDemoTenants] = useState<DemoTenant[]>([]);
  const [demoRole, setDemoRole] = useState("admin");
  const autoplay = useRef(Autoplay({ delay: 4500, stopOnInteraction: false, stopOnMouseEnter: true }));

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api]);

  // Métricas reales de las empresas demo (función pública agregada)
  useEffect(() => {
    let alive = true;
    supabase.functions.invoke("public-demo-stats").then(({ data }) => {
      if (alive && data) setStats(data as unknown as DemoStats);
    });
    supabase.functions.invoke("ensure-demo-user", { body: { action: "list" } }).then(({ data }) => {
      if (alive && data?.tenants) setDemoTenants(data.tenants as DemoTenant[]);
    });
    return () => { alive = false; };
  }, []);

  const findTenant = (type: string) =>
    demoTenants.find((t) => (TYPE_ALIASES[type] ?? [type]).includes((t.business_type ?? "").toLowerCase()));

  const findBusiness = (type: string) =>
    stats?.businesses?.find((b) => (TYPE_ALIASES[type] ?? [type]).includes((b.type ?? "").toLowerCase()));

  const startDemo = async (type: string) => {
    setDemoLoading(type);
    try {
      const tenant = findTenant(type);
      if (!tenant) throw new Error("Demo no disponible en este momento");
      const { data, error } = await supabase.functions.invoke("ensure-demo-user", {
        body: { action: "ensure", tenant_id: tenant.tenant_id, role: demoRole },
      });
      if (error) throw error;
      if (!data?.email) throw new Error(data?.error ?? "No se pudo preparar la demo");
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (loginErr) throw loginErr;
      toast.success(`Demo de ${tenant.name} lista (rol ${demoRole}).`);
      navigate("/app");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo iniciar la demo");
    } finally {
      setDemoLoading(null);
    }
  };


  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Seo
        title="MarIA OS — Sistema operativo empresarial con IA para Cuba y LatAm"
        description="POS, inventario, contabilidad de partida doble, RRHH, delivery y agentes de IA en una sola plataforma. Prueba las demos reales por tipo de negocio."
        path="/"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "MarIA OS",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: "https://bizzen-aura.lovable.app/",
          publisher: { "@type": "Organization", name: "Kirabit" },
        }}
      />
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/70 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <img src={mariaLogo} alt="MarIA" width={36} height={36} className="h-8 w-8 sm:h-9 sm:w-9 shrink-0" decoding="async" />
            <span className="font-heading font-bold text-base sm:text-lg tracking-tight truncate">MarIA OS</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-muted-foreground hover:text-foreground transition-colors">{l.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden sm:block"><Button variant="ghost" size="sm">Ingresar</Button></Link>
            <Link to="/auth"><Button size="sm" className="bg-primary hover:bg-primary/90">Empezar</Button></Link>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden h-9 w-9" aria-label="Abrir menú">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[86vw] max-w-xs p-0">
                <div className="flex items-center gap-2 px-5 h-16 border-b">
                  <img src={mariaLogo} alt="" width={28} height={28} className="h-7 w-7" />
                  <span className="font-heading font-bold">MarIA OS</span>
                </div>
                <nav className="flex flex-col p-3">
                  {NAV_LINKS.map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      onClick={() => setMenuOpen(false)}
                      className="rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      {l.label}
                    </a>
                  ))}
                </nav>
                <div className="p-3 mt-auto space-y-2 border-t">
                  <Link to="/auth" onClick={() => setMenuOpen(false)} className="block">
                    <Button variant="outline" className="w-full">Ingresar</Button>
                  </Link>
                  <Link to="/marketplace" onClick={() => setMenuOpen(false)} className="block">
                    <Button variant="ghost" className="w-full">Ir al Marketplace</Button>
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `url(${heroBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/85 to-background" />
        {/* subtle grid */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-6 animate-fade-in">
            <Sparkles className="h-3.5 w-3.5" />
            Plataforma todo-en-uno · by Kirabit
          </div>
          <h1 className="font-heading font-bold text-4xl sm:text-6xl lg:text-7xl tracking-tight max-w-4xl mx-auto leading-[1.05] animate-fade-in">
            El sistema operativo de tu{" "}
            <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
              negocio moderno
            </span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto animate-fade-in">
            POS adaptable, inventario, facturación electrónica, tesorería, marketplace, delivery, RRHH y agentes de IA
            en una sola plataforma multi-empresa, multi-idioma y en tiempo real.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3 flex-wrap animate-fade-in">
            <a href="#demo">
              <Button size="lg" className="bg-primary hover:bg-primary/90 gap-2">
                <PlayCircle className="h-4 w-4" /> Probar la demo
              </Button>
            </a>
            <Link to="/auth">
              <Button size="lg" variant="outline" className="gap-2">
                Crear cuenta gratis <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* Hero screenshot con chrome de navegador */}
          <div className="mt-16 relative max-w-5xl mx-auto animate-fade-in">
            <div aria-hidden className="absolute -inset-6 bg-gradient-to-r from-primary/30 via-emerald-400/20 to-primary/30 blur-3xl rounded-[2rem] opacity-70" />
            <div aria-hidden className="absolute -top-10 left-10 h-24 w-24 rounded-full bg-primary/40 blur-3xl" />
            <div aria-hidden className="absolute -bottom-10 right-10 h-28 w-28 rounded-full bg-emerald-400/30 blur-3xl" />
            <div className="relative rounded-2xl border border-border/80 shadow-2xl overflow-hidden bg-card ring-1 ring-white/5">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-card/90 border-b border-border/60">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <div className="flex-1 mx-4 h-6 rounded-md bg-background/60 border border-border/50 flex items-center justify-center text-[10px] text-muted-foreground font-mono">
                  app.kirabit.cloud / dashboard
                </div>
              </div>
              <img
                src="/landing/modules/dashboard.jpg"
                alt="Dashboard ejecutivo de MarIA con KPIs, ventas y alertas en tiempo real"
                width={1600}
                height={900}
                fetchPriority="high"
                decoding="async"
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Platform features */}
      <section id="plataforma" className="py-20 border-y border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
            {platformFeatures.map((f) => (
              <div key={f.title} className="text-center sm:text-left">
                <div className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-primary/10 text-primary mb-3">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading font-semibold text-sm">{f.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules */}
      <section id="modulos" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Módulos</p>
            <h2 className="font-heading font-bold text-3xl sm:text-5xl tracking-tight">
              Todo lo que tu operación necesita
            </h2>
            <p className="mt-4 text-muted-foreground">
              Diseñado para bares, restaurantes, retail y empresas multi-sucursal. Activa solo los módulos que uses.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {modules.map((m) => (
              <div
                key={m.title}
                className="group relative rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_10px_40px_-10px_hsl(var(--primary)/0.3)]"
              >
                <div className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground mb-4 shadow-lg shadow-primary/20">
                  <m.icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading font-semibold text-base">{m.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{m.desc}</p>
                <ul className="mt-4 space-y-1.5">
                  {m.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-xs text-foreground/80">
                      <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Module Carousel */}
      <section id="tour" className="py-24 bg-gradient-to-b from-background via-card/30 to-background border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Tour visual</p>
            <h2 className="font-heading font-bold text-3xl sm:text-5xl tracking-tight">
              Conoce cada módulo en acción
            </h2>
            <p className="mt-4 text-muted-foreground">
              Desliza para explorar las pantallas reales y sus capacidades clave.
            </p>
          </div>

          <Carousel
            opts={{ align: "center", loop: true }}
            plugins={[autoplay.current]}
            setApi={setApi}
            className="relative"
          >
            <CarouselContent className="-ml-4 py-2">
              {moduleSlides.map((s, i) => {
                const isActive = i === selected;
                return (
                  <CarouselItem key={s.title} className="pl-4 md:basis-3/4 lg:basis-2/3 xl:basis-1/2">
                    <div
                      className={[
                        "group relative rounded-3xl overflow-hidden border bg-card transition-all duration-700 ease-out",
                        isActive
                          ? "border-primary/40 shadow-[0_30px_80px_-25px_hsl(var(--primary)/0.45)] scale-100 opacity-100"
                          : "border-border/60 shadow-card scale-[0.96] opacity-70",
                      ].join(" ")}
                    >
                      <div className="relative aspect-[16/10] overflow-hidden">
                        <img
                          src={s.img}
                          alt={s.title}
                          loading="lazy"
                          decoding="async"
                          width={1280}
                          height={800}
                          className="w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]"
                        />
                        {/* soft gradient + glow */}
                        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                        <div aria-hidden className="absolute -inset-px ring-1 ring-inset ring-white/5" />
                        <div aria-hidden className={`absolute -bottom-24 left-1/2 -translate-x-1/2 h-40 w-2/3 rounded-full bg-primary/30 blur-3xl transition-opacity duration-700 ${isActive ? "opacity-60" : "opacity-0"}`} />
                        <div className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-background/70 backdrop-blur-md border border-primary/30 text-primary text-xs font-medium shadow-sm">
                          <s.icon className="h-3.5 w-3.5" />
                          {s.title}
                        </div>
                      </div>
                      <div className="p-6 sm:p-7">
                        <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                        <ul className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {s.features.map((f) => (
                            <li key={f} className="flex items-center gap-2 text-xs text-foreground/85">
                              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
            <CarouselPrevious className="hidden md:flex -left-5 bg-card/90 backdrop-blur border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors" />
            <CarouselNext className="hidden md:flex -right-5 bg-card/90 backdrop-blur border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors" />
          </Carousel>

          {/* Indicadores */}
          <div className="mt-8 flex items-center justify-center gap-2">
            {moduleSlides.map((_, i) => (
              <button
                key={i}
                onClick={() => api?.scrollTo(i)}
                aria-label={`Ir al módulo ${i + 1}`}
                className={[
                  "h-1.5 rounded-full transition-all duration-500",
                  i === selected ? "w-8 bg-primary" : "w-2 bg-border hover:bg-muted-foreground/40",
                ].join(" ")}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Demo selector */}
      <section id="demo" className="py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-4">
              <PlayCircle className="h-3.5 w-3.5" />
              Demo interactiva
            </div>
            <h2 className="font-heading font-bold text-3xl sm:text-5xl tracking-tight">
              Elige tu tipo de negocio
            </h2>
            <p className="mt-4 text-muted-foreground">
              Empresas demo con operación real cargada: catálogo, ventas, turnos, cocina, nómina y contabilidad.
              Entra con el rol que quieras probar y comprueba los permisos.
            </p>
          </div>

          {/* Selector de rol para probar permisos */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
            {DEMO_ROLES.map((r) => (
              <button
                key={r.role}
                onClick={() => setDemoRole(r.role)}
                className={[
                  "px-4 py-2 rounded-full border text-xs font-medium transition-colors",
                  demoRole === r.role
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {r.label} <span className="opacity-60">· {r.desc}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {demoBusinessTypes.map((b) => {
              const biz = findBusiness(b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => startDemo(b.id)}
                  disabled={demoLoading !== null}
                  className="group text-left relative rounded-3xl border border-border bg-card p-7 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_20px_50px_-15px_hsl(var(--primary)/0.35)] disabled:opacity-60 disabled:cursor-wait"
                >
                  <div aria-hidden className={`absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br ${b.accent} opacity-20 blur-3xl group-hover:opacity-40 transition-opacity`} />
                  <div className={`relative inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br ${b.accent} text-white shadow-lg mb-5`}>
                    <b.icon className="h-6 w-6" />
                  </div>
                  <h3 className="relative font-heading font-semibold text-lg">{b.title}</h3>
                  {biz && (
                    <p className="relative text-xs text-primary font-medium mt-1">{biz.name}</p>
                  )}
                  <p className="relative text-sm text-muted-foreground mt-2 leading-relaxed">{b.desc}</p>
                  {biz && (
                    <dl className="relative mt-5 grid grid-cols-3 gap-2 border-t border-border/60 pt-4">
                      {[
                        { l: "Productos", v: String(biz.products) },
                        { l: "Ventas", v: String(biz.sales) },
                        { l: "Facturado", v: `$${fmtMoney(biz.revenue)}` },
                      ].map((m) => (
                        <div key={m.l}>
                          <dd className="font-heading font-bold text-sm">{m.v}</dd>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.l}</dt>
                        </div>
                      ))}
                    </dl>
                  )}
                  <div className="relative mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary">
                    {demoLoading === b.id ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Preparando demo…</>
                    ) : (
                      <>Entrar como {demoRole} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>
                    )}
                  </div>
                </button>
              );
            })}
          </div>


          <div className="mt-10 text-center">
            <Link to="/marketplace">
              <Button variant="outline" size="lg" className="gap-2">
                <Globe className="h-4 w-4" /> Explorar marketplace público
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Why MarIA — beneficios (reemplaza la sección de capturas duplicadas) */}
      <section id="beneficios" className="py-24 bg-card/40 border-y border-border relative overflow-hidden">
        <div aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div aria-hidden className="absolute -top-32 right-1/4 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">¿Por qué MarIA?</p>
            <h2 className="font-heading font-bold text-3xl sm:text-5xl tracking-tight">
              Hecho para el ritmo de tu negocio
            </h2>
            <p className="mt-4 text-muted-foreground">
              Una sola plataforma que reemplaza POS, inventario, facturación, marketplace y RRHH.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Zap, title: "Cobra en segundos", desc: "POS optimizado por rubro: cuentas en bar, mapa de mesas en restaurante y SKU en retail." },
              { icon: Shield, title: "Datos a salvo", desc: "Aislamiento por empresa con Row-Level Security y respaldos automáticos en la nube." },
              { icon: Smartphone, title: "En cualquier dispositivo", desc: "PWA instalable, mobile-first y sincronización en tiempo real con tu equipo." },
              { icon: BarChart3, title: "Decisiones con datos", desc: "Dashboards en vivo, reportes exportables y contabilidad básica integrada." },
              { icon: Globe, title: "Vende online sin fricción", desc: "Marketplace público con geolocalización y catálogo controlado por tu tienda." },
              { icon: Sparkles, title: "Activa solo lo que usas", desc: "Módulos opcionales: factura electrónica, fidelización, delivery, recetas y más." },
            ].map((b) => (
              <div
                key={b.title}
                className="group relative rounded-2xl border border-border bg-card/80 backdrop-blur p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_15px_45px_-15px_hsl(var(--primary)/0.4)]"
              >
                <div className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-emerald-400/10 text-primary border border-primary/20 mb-4">
                  <b.icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading font-semibold text-base">{b.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats reales de las demos */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Datos en vivo</p>
            <h2 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">
              Las demos operan con información real
            </h2>
            <p className="mt-3 text-muted-foreground text-sm">
              Estas cifras se leen directamente de las tres empresas demo del sistema, no son maquetas.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { v: stats ? `$${fmtMoney(stats.revenue)}` : "—", l: "Facturado en las demos" },
              { v: stats ? String(stats.sales) : "—", l: "Ventas registradas" },
              { v: stats ? String(stats.products) : "—", l: "Productos en catálogo" },
              { v: stats ? String(stats.journal_entries) : "—", l: "Asientos contables" },
              { v: stats ? String(stats.employees) : "—", l: "Empleados con nómina" },
              { v: stats ? String(stats.events) : "—", l: "Eventos de dominio" },
              { v: stats ? String(stats.agents) : "—", l: "Agentes de IA activos" },
              { v: "3", l: "Idiomas (ES/EN/PT-BR)" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl border border-border bg-card p-6">
                <p className="font-heading font-bold text-2xl sm:text-3xl bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
                  {s.v}
                </p>
                <p className="text-xs text-muted-foreground mt-2">{s.l}</p>
              </div>
            ))}
          </div>

          {/* Métricas verificadas de la plataforma */}
          <div className="mt-14 rounded-3xl border border-border bg-card/60 p-8 sm:p-10">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Ingeniería verificada</p>
                <h3 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">La plataforma por dentro</h3>
              </div>
              <p className="text-xs text-muted-foreground max-w-sm">
                Cifras medidas sobre la base de datos y el código del sistema, no estimaciones de marketing.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { v: "137", l: "Tablas de negocio con aislamiento por empresa" },
                { v: "396", l: "Políticas de seguridad a nivel de fila (RLS)" },
                { v: "231", l: "Funciones de negocio ejecutadas en el servidor" },
                { v: "228", l: "Disparadores de integridad y auditoría" },
                { v: "56k+", l: "Líneas de código de aplicación" },
                { v: "100%", l: "Paridad débito = crédito en el libro diario" },
                { v: "17", l: "Funciones serverless (IA, fiscal, integraciones)" },
                { v: "3", l: "Idiomas: español, inglés y portugués (BR)" },
              ].map((s) => (
                <div key={s.l}>
                  <p className="font-heading font-bold text-2xl sm:text-3xl text-primary">{s.v}</p>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </section>


      {/* CTA */}
      <section id="contacto" className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="relative rounded-3xl overflow-hidden border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-10 sm:p-16 text-center">
            <div aria-hidden className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
            <div aria-hidden className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
            <div className="relative">
              <h2 className="font-heading font-bold text-3xl sm:text-5xl tracking-tight">
                Listo para digitalizar tu negocio
              </h2>
              <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
                Comienza hoy con MarIA. Sin instalaciones, sin servidores, sin sorpresas.
              </p>
              <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
                <Link to="/auth">
                  <Button size="lg" className="bg-primary hover:bg-primary/90 gap-2">
                    Crear cuenta <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="mailto:hola@kirabit.app">
                  <Button size="lg" variant="outline">Hablar con ventas</Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={mariaLogo} alt="MarIA" width={28} height={28} className="h-7 w-7" decoding="async" />
            <span className="font-heading font-semibold text-sm">MarIA OS</span>
            <span className="text-xs text-muted-foreground ml-2">© {new Date().getFullYear()} Kirabit · Todos los derechos reservados.</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <a href="#modulos" className="hover:text-foreground">Módulos</a>
            <a href="#plataforma" className="hover:text-foreground">Plataforma</a>
            <Link to="/marketplace" className="hover:text-foreground">Marketplace</Link>
            <Link to="/auth" className="hover:text-foreground">Ingresar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
