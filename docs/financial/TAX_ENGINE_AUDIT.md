# TAX ENGINE AUDIT

## Objetos reales

| Objeto | Rol |
|--------|-----|
| `fiscal_rules` | Regla fiscal por empresa y país: `country_code`, `rule_type`, `code`, `name`, `rate`, `base`, `applies_to`, `is_default`, `effective_from`, `effective_to`, `config` |
| `br_tax_jurisdictions` | Jurisdicciones y tasas (implementado con datos de Brasil, estructura genérica) |
| `accounting_profiles` | Perfil contable/país: `country_code`, `regime`, `base_currency`, `functional_currency`, `fiscal_calendar`, `costing_method`, `regulatory_exports` |
| `tax_rates`, `tax_templates` | Tasas e impuestos aplicables a productos y documentos |
| `compute_tax_declaration`, `compute_cu_tax_declaration`, `compute_tax_breakdown` | Cálculo genérico + perfil Cuba |
| `cu_tax_declarations`, `br_nfe_documents`, `br_sped_exports`, `br_esocial_events` | Salidas regulatorias por jurisdicción |

## Separación de responsabilidades

```text
Tenant → accounting_profiles (país, régimen, moneda funcional, calendario fiscal)
              │
              ▼
        fiscal_rules (definición + tasa + base + vigencia por fechas)
              │
              ▼
   compute_tax_declaration (base gravable → impuesto → período → cuenta)
              │
              ▼
     asiento de impuesto devengado + declaración por jurisdicción
```

Versionado: `effective_from` / `effective_to` en `fiscal_rules` permite reglas versionadas sin borrar historia.

## Cuba no está hardcodeada en el motor

Cuba es el perfil `CU-MIPYME` (`accounting_profiles`), con funciones específicas (`compute_cu_tax_declaration`, `cu_calculate_cost_sheet`) que se seleccionan por perfil, no por condición fija en el núcleo. Añadir México, España o Colombia requiere datos legales (tasas, calendario, cuenta contable), no cambios en el motor.

## Hallazgos

| # | Hallazgo | Severidad |
|---|----------|-----------|
| 1 | Empresas sin ninguna `fiscal_rules` activa quedan sin perfil fiscal efectivo y el impuesto se resuelve por `tax_rates` del producto | MEDIUM — el health check ahora lo reporta como `WARNING` |
| 2 | Los códigos de cuenta de impuesto (`2106` repercutido, `2107` acreditable) no existen en los planes demo, por lo que su mapeo contable queda sin resolver | MEDIUM — el mapeo se creó para 12 de 14 claves; falta crear ambas cuentas en el plan |
| 3 | No hay `tax_authorities` como entidad separada; la autoridad vive en `config` de la regla | LOW |
