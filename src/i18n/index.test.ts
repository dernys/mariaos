import { describe, it, expect } from "vitest";
import i18n from "./index";

describe("i18n locales", () => {
  it("pt-BR muestra textos en portugués", async () => {
    await i18n.changeLanguage("pt-BR");
    expect(i18n.t("nav.items.pos")).toBe("PDV");
    expect(i18n.t("common.logout")).toBe("Sair");
  });
  it("en-US muestra textos en inglés", async () => {
    await i18n.changeLanguage("en-US");
    expect(i18n.t("common.logout")).toBe("Sign out");
  });
  it("es-CU muestra textos en español", async () => {
    await i18n.changeLanguage("es-CU");
    expect(i18n.t("common.logout")).toBe("Cerrar sesión");
  });
});
