import { AppLayout } from "@/components/AppLayout";
import { useTenantContext } from "@/hooks/useTenantContext";
import { POSBar } from "@/components/pos/POSBar";
import { POSRestaurant } from "@/components/pos/POSRestaurant";
import { POSEmpresa } from "@/components/pos/POSEmpresa";

const POS = () => {
  const { businessType, tenant, loading } = useTenantContext();

  const titles: Record<string, string> = {
    bar: "Barra — Punto de Venta",
    restaurant: "Restaurante — Punto de Venta",
    empresa: "Punto de Venta",
  };

  if (loading) {
    return (
      <AppLayout title="Punto de Venta">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={titles[businessType] || "Punto de Venta"}>
      {businessType === "bar" && <POSBar />}
      {businessType === "restaurant" && <POSRestaurant />}
      {businessType === "empresa" && <POSEmpresa />}
      {!["bar", "restaurant", "empresa"].includes(businessType) && <POSEmpresa />}
    </AppLayout>
  );
};

export default POS;
