import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Tag, Percent, Coins, CreditCard, ShoppingCart, Settings2, Scale } from "lucide-react";
import { ConfigGeneral } from "@/components/config/ConfigGeneral";
import { ConfigCategories } from "@/components/config/ConfigCategories";
import { ConfigTaxRates } from "@/components/config/ConfigTaxRates";
import { ConfigCurrencies } from "@/components/config/ConfigCurrencies";
import { ConfigPaymentMethods } from "@/components/config/ConfigPaymentMethods";
import { ConfigPOS } from "@/components/config/ConfigPOS";
import { ConfigModules } from "@/components/config/ConfigModules";
import { ConfigFiscalRules } from "@/components/config/ConfigFiscalRules";


const Configuracion = () => {
  const { t } = useTranslation();
  return (
    <AppLayout title={t("nav.items.settings")}>
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" />General</TabsTrigger>
          <TabsTrigger value="pos" className="gap-1.5 text-xs"><ShoppingCart className="h-3.5 w-3.5" />POS</TabsTrigger>
          <TabsTrigger value="modules" className="gap-1.5 text-xs"><Settings2 className="h-3.5 w-3.5" />Módulos</TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5 text-xs"><Tag className="h-3.5 w-3.5" />Categorías</TabsTrigger>
          <TabsTrigger value="taxes" className="gap-1.5 text-xs"><Percent className="h-3.5 w-3.5" />Impuestos</TabsTrigger>
          <TabsTrigger value="fiscal" className="gap-1.5 text-xs"><Scale className="h-3.5 w-3.5" />Motor Fiscal</TabsTrigger>
          <TabsTrigger value="currencies" className="gap-1.5 text-xs"><Coins className="h-3.5 w-3.5" />Monedas</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5 text-xs"><CreditCard className="h-3.5 w-3.5" />Métodos de Pago</TabsTrigger>
        </TabsList>

        <TabsContent value="general"><ConfigGeneral /></TabsContent>
        <TabsContent value="pos"><ConfigPOS /></TabsContent>
        <TabsContent value="modules"><ConfigModules /></TabsContent>
        <TabsContent value="categories"><ConfigCategories /></TabsContent>
        <TabsContent value="taxes"><ConfigTaxRates /></TabsContent>
        <TabsContent value="fiscal"><ConfigFiscalRules /></TabsContent>

        <TabsContent value="currencies"><ConfigCurrencies /></TabsContent>
        <TabsContent value="payments"><ConfigPaymentMethods /></TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Configuracion;
