# Architecture rules

- Use `src/lib/checkSuperadmin.ts` for client superadmin checks with an explicit hydrated session and one bounded 401 refresh retry; browser storage must never grant privileges.
- Validate signing-key JWTs with `getClaims()` in `check-superadmin` before using privileged credentials; preserve the server-configured identity and tenant isolation.
- POS location snapshots must be scoped by tenant and store and discard obsolete requests; unverified or failed loads expose zero available stock rather than a previous store's stock.