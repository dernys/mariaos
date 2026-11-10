# Architecture rules

- Use `src/lib/checkSuperadmin.ts` for client superadmin checks with an explicit hydrated session and one bounded 401 refresh retry; browser storage must never grant privileges.
- Validate signing-key JWTs with `getClaims()` in `check-superadmin` before using privileged credentials; preserve the server-configured identity and tenant isolation.