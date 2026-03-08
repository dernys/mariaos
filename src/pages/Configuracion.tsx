import { AppLayout } from "@/components/AppLayout";
import { motion } from "framer-motion";
import { Building2, Users, CreditCard, Bell, Shield, Palette } from "lucide-react";

const sections = [
  { icon: Building2, title: "Empresa", description: "Datos fiscales, logo y nombre comercial" },
  { icon: Users, title: "Usuarios y Roles", description: "Gestionar accesos y permisos" },
  { icon: CreditCard, title: "Métodos de Pago", description: "Configurar terminales y cuentas" },
  { icon: Bell, title: "Notificaciones", description: "Alertas de inventario y ventas" },
  { icon: Shield, title: "Seguridad", description: "Contraseñas y autenticación" },
  { icon: Palette, title: "Apariencia", description: "Tema y personalización de tickets" },
];

const Configuracion = () => {
  return (
    <AppLayout title="Configuración">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-4xl">
        {sections.map((section, i) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card rounded-xl p-5 shadow-card border hover:shadow-elevated hover:border-primary/30 transition-all cursor-pointer group"
          >
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
              <section.icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-heading font-semibold text-sm">{section.title}</h3>
            <p className="text-[11px] text-muted-foreground mt-1">{section.description}</p>
          </motion.div>
        ))}
      </div>
    </AppLayout>
  );
};

export default Configuracion;
