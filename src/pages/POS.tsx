import { AppLayout } from "@/components/AppLayout";
import { useTenantContext } from "@/hooks/useTenantContext";
import { POSBar } from "@/components/pos/POSBar";
import { POSRestaurant } from "@/components/pos/POSRestaurant";
import { POSEmpresa } from "@/components/pos/POSEmpresa";
import { ShiftRequiredGate } from "@/components/pos/ShiftRequiredGate";

const POS = () => {
  const { businessType, loading } = useTenantContext();

  const titles: Record<string, string> = {
    bar: "Barra — Punto de Venta",
    restaurant: "Restaurante — Punto de Venta",
    restaurante: "Restaurante — Punto de Venta",
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

  const variant: "bar" | "restaurant" | "empresa" =
    businessType === "bar" ? "bar"
    : businessType === "restaurant" || businessType === "restaurante" ? "restaurant"
    : "empresa";

  return (
    <AppLayout title={titles[businessType] || "Punto de Venta"}>
      <ShiftRequiredGate variant={variant}>
        {variant === "bar" && <POSBar />}
        {variant === "restaurant" && <POSRestaurant />}
        {variant === "empresa" && <POSEmpresa />}
      </ShiftRequiredGate>
    </AppLayout>
  );
};

export default POS;
