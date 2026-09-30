# API

- `api-v1`: autenticación por `tenant_api_keys` (x-api-key/Bearer), ámbito limitado al tenant de la clave. Sin rate limit.
- `mcp`: servidor MCP (herramientas en `src/lib/mcp/tools`: command center, agentes, tenants, riesgos, decisiones).
- `webhook-dispatcher`: firma HMAC-SHA256, tablas `webhooks` / `webhook_deliveries`.
- Públicas sin JWT: check-superadmin, register-superadmin (bloqueada tras bootstrap), api-v1, webhook-dispatcher, ensure-demo-user (demos, rate limited), public-demo-stats.
