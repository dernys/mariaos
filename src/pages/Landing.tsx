import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import {
  ShoppingCart, Package, Users, BarChart3, Truck, ChefHat, Receipt, Globe,
  Shield, Zap, Smartphone, Cloud, ArrowRight, Check, Sparkles, Store, Utensils, Building2, PlayCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import mariaLogo from "@/assets/maria-logo.png";
import heroBg from "@/assets/landing-hero-bg.jpg";

import { Clock4 } from "lucide-react";

const moduleSlides = [
  { img: "/landing/modules/dashboard.png", icon: BarChart3, title: "Dashboard Ejecutivo", desc: "Indicadores clave de tu negocio en vivo: ventas del día, top productos, alertas de stock y rendimiento por sucursal.", features: ["KPIs en tiempo real", "Gráficos interactivos", "Alertas inteligentes"] },
  { img: "/landing/modules/pos.png", icon: ShoppingCart, title: "Punto de Venta Adaptable", desc: "POS especializado para Bar, Restaurante y Retail. Cobro veloz con pagos divididos, multimoneda y atajos de teclado.", features: ["3 modos especializados", "Multi-pago y multimoneda", "Atajos y mobile-first"] },
  { img: "/landing/modules/restaurante.png", icon: ChefHat, title: "Mapa de Mesas y Salón", desc: "Visualiza tu salón en tiempo real: mesas libres, ocupadas, servidas y esperando cuenta. Asignación de meseros con un clic.", features: ["Mapa visual del salón", "Estados en tiempo real", "Asignación de meseros"] },
  { img: "/landing/modules/inventario.png", icon: Package, title: "Inventario Inteligente", desc: "Control total: stock por almacén, recetas (BOM), kardex, movimientos auditables y alertas automáticas de bajo stock.", features: ["Kardex y movimientos", "Recetas (BOM)", "Alertas de stock bajo"] },
  { img: "/landing/modules/marketplace.png", icon: Globe, title: "Marketplace Online", desc: "Tienda pública PWA con geolocalización para que tus clientes te encuentren y pidan online en tu ciudad.", features: ["Geolocalización nativa", "Catálogo multi-tenant", "Instalable como app"] },
  { img: "/landing/modules/facturacion.png", icon: Receipt, title: "Facturación Electrónica", desc: "Emite facturas locales y electrónicas con UBL 2.1, XML firmado y transmisión por webhook a tu PAC. PDF profesional incluido.", features: ["UBL 2.1 + XML", "Envío por email", "Cobros y estado"] },
  { img: "/landing/modules/clientes.png", icon: Users, title: "Gestión de Clientes (CRM)", desc: "Saldos, crédito otorgado, deudas, fidelización y timeline de actividad por cliente con un panel claro y rápido.", features: ["Crédito y saldos", "Programa de puntos", "Historial completo"] },
  { img: "/landing/modules/empleados.png", icon: Users, title: "RRHH y Nómina", desc: "Empleados, puestos, salarios, adelantos y nómina mensual integrada. Control de asistencia y horarios incluido.", features: ["Nómina automática", "Adelantos y bonos", "Asistencia y horarios"] },
  { img: "/landing/modules/turnos.png", icon: Clock4, title: "Turnos y Caja", desc: "Apertura y cierre de turnos por tienda y cajero, con conteo de caja inicial, ventas y diferencias auditables.", features: ["Caja por turno", "Multi-tienda", "Cierre auditado"] },
  { img: "/landing/modules/delivery.png", icon: Truck, title: "Delivery y Repartos", desc: "Coordina pedidos, repartidores y zonas en tiempo real. Asignación con un clic y seguimiento por estado.", features: ["Zonas configurables", "Asignación realtime", "Estado por pedido"] },
];

const demoBusinessTypes = [
  { id: "bar", icon: Store, title: "Bar / Cafetería", desc: "Cuentas abiertas, comanda rápida y cobro por consumición.", accent: "from-amber-500 to-orange-500" },
  { id: "restaurant", icon: Utensils, title: "Restaurante", desc: "Mapa de mesas, KDS de cocina y división de cuentas.", accent: "from-rose-500 to-red-500" },
  { id: "retail", icon: Building2, title: "Retail / Empresa", desc: "Búsqueda por SKU, multi-tienda y facturación.", accent: "from-primary to-emerald-500" },
];

const modules = [
  { icon: ShoppingCart, title: "POS Adaptable", desc: "Tres modos especializados: Bar con cuentas, Restaurante con mapa de mesas y KDS, y Retail con búsqueda por SKU/código de barras.", bullets: ["Cobro en segundos", "Pagos divididos y multimoneda", "QR, tarjeta, efectivo y crédito"] },
  { icon: Package, title: "Inventario Inteligente", desc: "Control total de stock con recetas (BOM), múltiples almacenes, transferencias y alertas automáticas de bajo stock.", bullets: ["Movimientos auditables", "Recetas y descuento automático", "Alertas en tiempo real"] },
  { icon: ChefHat, title: "Operaciones Restaurante", desc: "Mapa de mesas en tiempo real, KDS de cocina sincronizado, división de cuentas y gestión completa del salón.", bullets: ["Realtime entre dispositivos", "Cocina conectada", "Mesas, bar y delivery"] },
  { icon: Globe, title: "Marketplace Online", desc: "Tienda online pública con geolocalización: tus clientes encuentran tus productos según ubicación del dispositivo.", bullets: ["PWA instalable", "Registro y conversión a cliente", "Catálogo por tienda"] },
  { icon: Receipt, title: "Facturación Electrónica", desc: "Emisión local y electrónica con UBL 2.1, CUFE y transmisión por webhook a tu PAC. PDF profesional incluido.", bullets: ["UBL 2.1 + XML firmado", "Compatible LATAM", "Envío por correo automático"] },
  { icon: Users, title: "Clientes y Empleados", desc: "Gestión de saldos, fidelización, salarios, asistencia, horarios y nóminas con timeline de actividad por persona.", bullets: ["Programa de fidelización", "RRHH integrado", "Historial completo"] },
  { icon: Truck, title: "Delivery y Repartos", desc: "Zonas, repartidores y asignación de pedidos en tiempo real para coordinar tu logística de última milla.", bullets: ["Zonas configurables", "Asignación realtime", "Seguimiento por pedido"] },
  { icon: BarChart3, title: "Analytics y Contabilidad", desc: "Dashboards en vivo, reportes exportables y partida doble validada para una contabilidad básica integrada.", bullets: ["KPIs por tienda y turno", "Asientos auditables", "Exportación CSV/PDF"] },
];

const platformFeatures = [
  { icon: Shield, title: "Multi-tenant Seguro", desc: "Aislamiento total por empresa con Row-Level Security." },
  { icon: Zap, title: "Realtime Nativo", desc: "Mesas, cocina y pedidos sincronizados al instante." },
  { icon: Smartphone, title: "Mobile-first PWA", desc: "Instalable en móvil con soporte offline." },
  { icon: Cloud, title: "Cloud Escalable", desc: "Infraestructura gestionada lista para crecer." },
];

// (Sección "Capturas reales" eliminada: el carrusel del tour ya muestra las pantallas reales sin duplicarlas)

const Landing = () => {
  const navigate = useNavigate();
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [selected, setSelected] = useState(0);
  const autoplay = useRef(Autoplay({ delay: 4500, stopOnInteraction: false, stopOnMouseEnter: true }));

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api]);

  const DEMO_EMAILS: Record<string, string> = {
    bar: "demo-bar@kirabit.app",
    restaurant: "demo-restaurante@kirabit.app",
    retail: "demo-empresa@kirabit.app",
    empresa: "demo-empresa@kirabit.app",
  };

  const startDemo = async (type: string) => {
    setDemoLoading(type);
    try {
      const { error: seedErr } = await supabase.functions.invoke("seed-demo");
      if (seedErr) throw seedErr;
      const email = DEMO_EMAILS[type] ?? DEMO_EMAILS.empresa;
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email,
        password: "demo1234",
      });
      if (loginErr) throw loginErr;
      toast.success("Demo lista. Bienvenido a MarIA.");
      navigate("/app");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo iniciar la demo");
    } finally {
      setDemoLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/70 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={mariaLogo} alt="MarIA" width={36} height={36} className="h-9 w-9" decoding="async" />
            <span className="font-heading font-bold text-lg tracking-tight">MarIA OS</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm">
            <a href="#modulos" className="text-muted-foreground hover:text-foreground transition-colors">Módulos</a>
            <a href="#tour" className="text-muted-foreground hover:text-foreground transition-colors">Tour</a>
            <a href="#demo" className="text-muted-foreground hover:text-foreground transition-colors">Demo</a>
            <a href="#plataforma" className="text-muted-foreground hover:text-foreground transition-colors">Plataforma</a>
            <a href="#contacto" className="text-muted-foreground hover:text-foreground transition-colors">Contacto</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Ingresar</Button></Link>
            <Link to="/auth"><Button size="sm" className="bg-primary hover:bg-primary/90">Empezar</Button></Link>
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
            POS adaptable, inventario, facturación electrónica, marketplace, delivery y RRHH en una sola plataforma
            multi-empresa, en tiempo real y lista para escalar.
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
                src="/landing/modules/dashboard.png"
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
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
              Entra a una demo preconfigurada según tu rubro. Sin tarjeta, sin instalaciones.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {demoBusinessTypes.map((b) => (
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
                <p className="relative text-sm text-muted-foreground mt-2 leading-relaxed">{b.desc}</p>
                <div className="relative mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary">
                  {demoLoading === b.id ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Preparando demo…</>
                  ) : (
                    <>Entrar a la demo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>
                  )}
                </div>
              </button>
            ))}
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

      {/* Stats */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { v: "20+", l: "Módulos integrados" },
              { v: "3", l: "Modos de POS" },
              { v: "Realtime", l: "Sincronización" },
              { v: "Multi-tenant", l: "Listo para escalar" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl border border-border bg-card p-6">
                <p className="font-heading font-bold text-3xl bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
                  {s.v}
                </p>
                <p className="text-xs text-muted-foreground mt-2">{s.l}</p>
              </div>
            ))}
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
            <span className="font-heading font-semibold text-sm">MarIA</span>
            <span className="text-xs text-muted-foreground ml-2">© {new Date().getFullYear()} Todos los derechos reservados.</span>
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
