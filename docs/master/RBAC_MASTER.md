# RBAC

- Roles: `app_role` en `user_roles` (por tenant vía `tenant_users`). `has_role()` security definer.
- Permisos: `role_permissions` (módulo × acción: view/create/edit/delete), escritura solo superadmin.
- UI: `PermissionGate`, `usePermissions`, sidebar filtrado por tipo de tenant y módulos activos.
- Roles y permisos solo para superadmin en `RolesPermisos.tsx`; admin de tenant gestiona usuarios de su tenant vía `manage-users`.

Pendiente: tests automatizados de matriz (p. ej. cajero sin acceso a configuración server-side, no solo UI).
