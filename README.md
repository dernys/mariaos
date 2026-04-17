# VentaPro — Sistema de Gestión Multi-Tenant

VentaPro es una plataforma SaaS multi-tenant para la gestión integral de **restaurantes, bares y empresas (retail)**. Construida sobre Lovable Cloud (Supabase) con React + Vite + TypeScript + Tailwind + shadcn/ui.

---

## 🚀 Funcionalidades Implementadas

### 🏢 Arquitectura Multi-Tenant
- Aislamiento de datos por `tenant_id` con políticas **RLS** en todas las tablas.
- Tabla `tenants` y `tenant_users` para gestión de membresías.
- Selector de tenant activo en la barra lateral (`TenantSelector`).
- **Sidebar dinámico** según `business_type` del tenant:
  - `restaurante` / `bar` → Mesas + Cocina (KDS)
  - `empresa` → Tiendas
- Hook `useTenantContext` como única fuente de verdad del tenant activo.

### 🔐 Autenticación y Autorización
- Sign up / Sign in con email + password (Supabase Auth).
- Recuperación de contraseña (`/reset-password`).
- `ProtectedRoute` para rutas privadas.
- Tabla **`user_roles`** separada (evita escalada de privilegios) con función `has_role()` `SECURITY DEFINER`.
- Roles: `admin`, `manager`, `cashier`, `kitchen`, `waiter`, etc.
- **Superadmin** con panel propio (`/superadmin`) para gestión global de tenants.
- Edge functions: `check-superadmin`, `register-superadmin`, `manage-users`.

### 👥 Roles y Permisos (`/roles`)
- Pestañas: **Usuarios**, **Permisos**, **Módulos**.
- Asignación de roles por tenant.
- Gestión de invitaciones y altas de usuarios (vía edge function `manage-users`).

### 🛒 Punto de Venta (POS) (`/pos`)
- Modo **Empresa/Retail**: catálogo + carrito + cobro rápido.
- Modo **Restaurante/Bar**: comandas por mesa, envío a cocina.
- **`PaymentDialog`**: múltiples métodos de pago (efectivo, tarjeta, mixto).
- **`SplitBillDialog`**: división de cuenta (por ítem o partes iguales).
- Carrito persistente con `CartContent`.
- Barra superior `POSBar` con turno activo, caja y atajos.

### 🍽️ Gestión de Restaurante
- **Mapa visual de mesas** (`/mesas`) con `FloorMap` — estados: libre, ocupada, reservada, cuenta pedida.
- `TableManageDialog` y `TableOrdersPanel` para gestionar pedidos por mesa.
- **KDS (Kitchen Display System)** (`/cocina`) — pantalla de cocina con tickets en tiempo real, tiempos de preparación y estados (pendiente, en preparación, listo).

### 📦 Inventario (`/inventario`)
- CRUD de productos con SKU, código de barras, categoría, precio, costo.
- Stock por almacén con **movimientos** (entradas, salidas, ajustes) y registro `previous_stock` / `new_stock`.
- Alertas de **stock mínimo**.
- Soporte de **recetas** (BOM) para restaurantes (descuento de ingredientes al vender).
- Toggle **Venta Online** + `online_stock` + `image_url` para productos del marketplace.

### 🏪 Tiendas y 🏬 Almacenes
- CRUD de **tiendas** (`/tiendas`) — solo visible para `business_type = empresa`.
- CRUD de **almacenes** (`/almacenes`) con datos operativos.
- **Activity Log** (`ActivityTimeline`) por entidad para auditoría.

### 👤 Clientes (`/clientes`)
- CRUD de clientes con datos fiscales, contacto e historial.

### 👨‍💼 Empleados (`/empleados`)
- CRUD de empleados con asignación a tiendas/roles.

### ⏰ Turnos y Cajas (`/turnos`)
- Apertura y cierre de turno con conteo de caja.
- Asociación de ventas al turno activo.

### 📒 Contabilidad (básica) (`/contabilidad`)
- Vista de ingresos y gastos derivados de las ventas.
- Listado de transacciones por periodo.

### 📊 Analytics (`/analytics`)
- Dashboard con KPIs: ventas del día, ticket medio, productos top, comparativas.
- Gráficos con Recharts (vía `chart.tsx` de shadcn).

### 🌐 Marketplace Online (`/marketplace`) — **Público**
- Catálogo público sin login (navegación libre).
- Filtros por **categoría**, **negocio** y **ubicación**.
- Carrito persistente.
- **Checkout requiere registro** (acceso público para ver, registro para comprar).
- Opciones de entrega: **Recogida en local** o **Delivery a domicilio**.
- Sin pago online — solo pedido (pago a la entrega/recogida).
- Stock online independiente del stock interno.

### 📥 Pedidos Online (`/pedidos-online`)
- Dashboard en tiempo real (Supabase Realtime).
- Estados: **pendiente → preparando → listo → entregado**.
- Tablas: `online_orders`, `online_order_items` con RLS.

### ⚙️ Configuración (`/configuracion`)
- General (`ConfigGeneral`): datos del tenant, logo, moneda base.
- **Categorías** de productos.
- **Monedas**.
- **Métodos de pago**.
- **Tipos de impuestos** (IVA, etc.).

### 🎨 Sistema de Diseño
- Tokens semánticos HSL en `index.css` y `tailwind.config.ts`.
- Componentes shadcn/ui completos (50+ componentes).
- Modo claro/oscuro listo (vía variables CSS).
- Layout responsive con sidebar colapsable (`AppLayout` + `AppSidebar`).

### 🛠️ Stack Técnico
- **Frontend**: React 18, Vite 5, TypeScript 5, Tailwind v3, shadcn/ui, React Router, TanStack Query.
- **Backend**: Lovable Cloud (Supabase) — Postgres + Auth + Storage + Edge Functions + Realtime.
- **Testing**: Vitest configurado.
- **Iconografía**: lucide-react.

---

## 📁 Estructura del Proyecto

```
src/
├── components/
│   ├── pos/          # POS, KDS, FloorMap, PaymentDialog, SplitBillDialog
│   ├── config/       # Pestañas de configuración
│   ├── roles/        # Gestión de roles, permisos, usuarios
│   └── ui/           # shadcn/ui
├── hooks/            # useAuth, useTenantContext, useSuperadmin, useActivityLog
├── pages/            # Una página por módulo del sidebar
└── integrations/supabase/  # Cliente y tipos auto-generados
supabase/
├── functions/        # Edge functions
└── migrations/       # Migraciones SQL
```

---

## 🔗 URLs

- **Preview**: definida por Lovable.
- **Marketplace público**: `/marketplace`.
- **Auth**: `/auth`.
- **Reset password**: `/reset-password`.
