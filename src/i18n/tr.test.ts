import { describe, it, expect, afterAll } from "vitest";
import i18n from "@/i18n";
import { tr } from "./tr";

describe("tr (pt-BR screen phrases)", () => {
  afterAll(() => i18n.changeLanguage("es"));
  it("translates Spanish screen text when Portuguese is chosen", async () => {
    await i18n.changeLanguage("pt-BR");
    expect(tr("Guardar")).toBe("Salvar");
  });
  it("keeps Spanish text when Spanish is chosen", async () => {
    await i18n.changeLanguage("es");
    expect(tr("Guardar")).toBe("Guardar");
  });
  it("passes non-text values through untouched", () => {
    expect(tr(42)).toBe(42);
  });
});
