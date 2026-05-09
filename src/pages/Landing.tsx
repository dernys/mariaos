import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingCart, Package, Users, BarChart3, Truck, ChefHat, Receipt, Globe,
  Shield, Zap, Smartphone, Cloud, ArrowRight, Check, Sparkles, Store, Utensils, Building2, PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import gaiaLogo from "@/assets/gaia-logo.png";
import heroBg from "@/assets/landing-hero-bg.jpg";

const moduleSlides = [
  { img: "/landing/modules/pos.jpg", icon: ShoppingCart, title: "POS Adaptable", desc: "Bar, restaurante o retail. Cobro veloz con pagos divididos, multimoneda y atajos de teclado.", features: ["3 modos especializados", "Multi-pago y multimoneda", "Atajos y mobile-first"] },
  { img: "/landing/modules/restaurante.jpg", icon: ChefHat, title: "Operaciones Restaurante", desc: "Mapa de mesas, KDS de cocina sincronizado en tiempo real y división avanzada de cuentas.", features: ["Mapa de salón visual", "Cocina en tiempo real", "Bill splitting"] },
  { img: "/landing/modules/inventario.jpg", icon: Package, title: "Inventario Inteligente", desc: "Stock por almacén, recetas (BOM), transferencias y alertas automáticas de bajo stock.", features: ["Movimientos auditables", "Recetas y descuento", "Alertas en tiempo real"] },
  { img: "/landing/modules/marketplace.jpg", icon: Globe, title: "Marketplace Online", desc: "Tienda pública PWA con geolocalización para que tus clientes te encuentren cerca.", features: ["Geolocalización nativa", "Registro a cliente", "Instalable como app"] },
  { img: "/landing/modules/facturacion.jpg", icon: Receipt, title: "Facturación Electrónica", desc: "Facturación local y electrónica con UBL 2.1, CUFE y transmisión por webhook a tu PAC.", features: ["UBL 2.1 + XML firmado", "PDF profesional", "Envío por email"] },
  { img: "/landing/modules/clientes.jpg", icon: Users, title: "Clientes y Empleados", desc: "CRM con saldos, fidelización, nómina, asistencia y timeline completo de actividad.", features: ["Programa de puntos", "RRHH integrado", "Historial completo"] },
  { img: "/landing/modules/delivery.jpg", icon: Truck, title: "Delivery y Repartos", desc: "Asignación de pedidos, zonas configurables y seguimiento de repartidores en tiempo real.", features: ["Zonas y tarifas", "Asignación realtime", "Tracking por pedido"] },
  { img: "/landing/modules/analytics.jpg", icon: BarChart3, title: "Analytics y Contabilidad", desc: "Dashboards en vivo, reportes exportables y partida doble validada con asientos auditables.", features: ["KPIs por turno", "Asientos auditables", "Exportación CSV/PDF"] },
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

const screenshots = [
  { src: "/landing/marketplace.png", alt: "Marketplace de GaIA en escritorio", label: "Marketplace · Desktop" },
  { src: "/landing/marketplace-mobile.png", alt: "Marketplace de GaIA en móvil", label: "Marketplace · Mobile" },
  { src: "/landing/auth.png", alt: "Pantalla de autenticación de GaIA", label: "Acceso seguro" },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/70 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={gaiaLogo} alt="GaIA" width={36} height={36} className="h-9 w-9" decoding="async" />
            <span className="font-heading font-bold text-lg tracking-tight">GaIA</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm">
            <a href="#modulos" className="text-muted-foreground hover:text-foreground transition-colors">Módulos</a>
            <a href="#plataforma" className="text-muted-foreground hover:text-foreground transition-colors">Plataforma</a>
            <a href="#capturas" className="text-muted-foreground hover:text-foreground transition-colors">Capturas</a>
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
            Plataforma todo-en-uno · Construida por GaIA
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
            <Link to="/auth">
              <Button size="lg" className="bg-primary hover:bg-primary/90 gap-2">
                Probar gratis <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/marketplace">
              <Button size="lg" variant="outline" className="gap-2">
                Ver marketplace en vivo
              </Button>
            </Link>
          </div>

          {/* Hero screenshot */}
          <div className="mt-16 relative max-w-5xl mx-auto animate-fade-in">
            <div aria-hidden className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-emerald-400/20 blur-2xl rounded-3xl" />
            <div className="relative rounded-2xl border border-border shadow-2xl overflow-hidden bg-card">
              <img
                src="/landing/marketplace.png"
                alt="Captura del Marketplace de GaIA"
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

      {/* Screenshots */}
      <section id="capturas" className="py-24 bg-card/40 border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Capturas reales</p>
            <h2 className="font-heading font-bold text-3xl sm:text-5xl tracking-tight">
              Una interfaz hecha para vender
            </h2>
            <p className="mt-4 text-muted-foreground">
              Diseño moderno, mobile-first y pensado para el ritmo del piso de venta.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {screenshots.map((s) => (
              <figure key={s.src} className="rounded-2xl overflow-hidden border border-border bg-card shadow-card transition-transform duration-300 hover:-translate-y-1">
                <img
                  src={s.src}
                  alt={s.alt}
                  loading="lazy"
                  decoding="async"
                  width={800}
                  height={500}
                  className="w-full h-64 object-cover object-top"
                />
                <figcaption className="p-4 text-xs text-muted-foreground font-medium">{s.label}</figcaption>
              </figure>
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
                Comienza hoy con GaIA. Sin instalaciones, sin servidores, sin sorpresas.
              </p>
              <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
                <Link to="/auth">
                  <Button size="lg" className="bg-primary hover:bg-primary/90 gap-2">
                    Crear cuenta <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="mailto:hola@gaia.app">
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
            <img src={gaiaLogo} alt="GaIA" width={28} height={28} className="h-7 w-7" decoding="async" />
            <span className="font-heading font-semibold text-sm">GaIA</span>
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
