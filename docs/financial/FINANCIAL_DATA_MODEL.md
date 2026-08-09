# FINANCIAL DATA MODEL

Modelo real (columnas verificadas en `information_schema`), incluyendo las añadidas en esta fase (marcadas `+`).

```text
tenants ──1:N── tenant_users
   │
   ├──1:N── accounting_accounts
   │          id, tenant_id, parent_id, code, name, description, type, nature,
   │          level, balance, currency, is_active, is_postable, plan_template,
   │          + account_subtype, + is_control_account, + control_role,
   │          + allows_manual_entry, + requires_reconciliation,
   │          + tax_category, + statement_section, + is_system
   │
   ├──1:N── accounting_mappings            (+ NUEVA)
   │          id, tenant_id, mapping_key, account_id, description, is_active
   │
   ├──1:N── fiscal_years ──1:N── accounting_periods (open | closed)
   │
   └──1:N── journal_entries
              id, tenant_id, entry_number, series, date, description,
              reference_type, reference_id, status, period_id, fiscal_year_id,
              created_by, posted_at, posted_by, reverses, reversed_by,
              + currency, + exchange_rate, + source_module, + correlation_id, + metadata
                 │
                 └──1:N── journal_entry_lines
                            id, entry_id, account_id, debit, credit, description,
                            cost_center_id,
                            + currency, + exchange_rate, + store_id,
                            + warehouse_id, + entity_type, + entity_id
                                 │
                                 ▼
                            general_ledger  (proyección)
                            tenant_id, period_id, account_id, opening_balance,
                            debit_total, credit_total, closing_balance, currency, rebuilt_at
```

Motor de eventos (paralelo, hoy sin emisores):

```text
financial_events (tenant_id, event_type, source_table, source_id, event_date,
                  currency, exchange_rate, amount, amount_in_base, payload,
                  status, posted_journal_id)
        │  post_financial_event
        ▼
posting_rules (profile_code, event_type, sequence, debit_account_code,
               credit_account_code, amount_field, condition_expr, active)
        ▼
journal_entries + journal_entry_lines
```

## Notas de esquema (causa raíz de errores históricos)

- `journal_entry_lines` **no tiene** `tenant_id`: el aislamiento se hereda de la cabecera. Cualquier función que intente insertarlo falla con `column "tenant_id" does not exist`.
- La clave foránea de la línea es `entry_id`, **no** `journal_entry_id`; los importes son `debit` / `credit`, **no** `debit_amount` / `credit_amount`.
- `journal_entries` usa `date`, **no** `entry_date`, y `entry_number` es NOT NULL sin default.
