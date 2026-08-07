import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Fase 3 — Regla de arquitectura (Strangler): dentro de un módulo, la UI y el
  // dominio no pueden hablar con la base de datos. Solo infrastructure/ puede.
  {
    files: ["src/modules/**/ui/**/*.{ts,tsx}", "src/modules/**/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/integrations/supabase/client",
              message:
                "Prohibido acceder a la base de datos desde ui/ o domain/. Usa los casos de uso de application/ y el repositorio de infrastructure/.",
            },
          ],
          patterns: [
            {
              group: ["**/integrations/supabase/*", "@supabase/supabase-js"],
              message: "Acceso a datos solo permitido en src/modules/*/infrastructure/.",
            },
          ],
        },
      ],
    },
  },
);
