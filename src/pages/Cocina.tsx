import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { KitchenDisplay } from "@/components/pos/KitchenDisplay";

const Cocina = () => {
  const { t } = useTranslation();
  return (
    <AppLayout title={t("nav.items.kitchen")}>
      <KitchenDisplay />
    </AppLayout>
  );
};

export default Cocina;
