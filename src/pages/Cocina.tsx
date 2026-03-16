import { AppLayout } from "@/components/AppLayout";
import { KitchenDisplay } from "@/components/pos/KitchenDisplay";

const Cocina = () => {
  return (
    <AppLayout title="Cocina — Sistema de Visualización (KDS)">
      <KitchenDisplay />
    </AppLayout>
  );
};

export default Cocina;
