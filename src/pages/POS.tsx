import { AppLayout } from "@/components/AppLayout";
import { useTenantContext } from "@/hooks/useTenantContext";
import { POSBar } from "@/components/pos/POSBar";
import { POSRestaurant } from "@/components/pos/POSRestaurant";
import { POSEmpresa } from "@/components/pos/POSEmpresa";
import { ShiftRequiredGate } from "@/components/pos/ShiftRequiredGate";
import { useTranslation } from "react-i18next";

const POS = () => {
  const { businessType, loading } = useTenantContext();
  const { t } = useTranslation();

  const titleFor = (bt: string) => {
    if (bt === "bar") return `${t("modules.pos.titleBar")} — ${t("modules.pos.title")}`;
    if (bt === "restaurant" || bt === "restaurante") return `${t("modules.pos.titleRestaurant")} — ${t("modules.pos.title")}`;
    return t("modules.pos.title");
  };

  if (loading) {
    return (
      <AppLayout title={t("modules.pos.title")}>
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
    <AppLayout title={titleFor(businessType)}>
      <ShiftRequiredGate variant={variant}>
        {variant === "bar" && <POSBar />}
        {variant === "restaurant" && <POSRestaurant />}
        {variant === "empresa" && <POSEmpresa />}
      </ShiftRequiredGate>
    </AppLayout>
  );
};

export default POS;

