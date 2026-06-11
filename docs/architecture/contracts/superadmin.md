# Contrato — Módulo `superadmin`

## Responsabilidad única

Extender el panel `/super` existente con parametrización de organizaciones (plan contratado, límites, branding básico), métricas de uso y gestión del magic link de primer acceso para el admin de cada empresa cliente.

## Capa

Backend (NestJS — endpoints nuevos bajo `/superadmin`) + Frontend (React — extensión del panel `/super` existente).

## Dependencias

| Módulo | Motivo |
|---|---|
| `organizations` (EXISTENTE) | `OrgConfig` tiene relación 1:1 con `Organization` |
| `users` (EXISTENTE) | Contar usuarios activos por organización para métricas de uso |
| `work-locations` (EXISTENTE) | Contar sedes activas por organización |
| `magic-link` (NUEVO) | Generar el link de primer acceso para el admin de la empresa |
| `common` (EXISTENTE) | Guard `RolesGuard(SUPER_ADMIN)` en todos los endpoints |

## Superficie pública (endpoints)

Todos los endpoints requieren guard `SUPER_ADMIN`.

```
GET  /superadmin/organizations
  — Lista organizaciones con: nombre, plan, usuarios_activos/max_users,
    sedes_activas/max_sites, fecha de registro.

GET  /superadmin/organizations/:id
  — Detalle de una organización con su OrgConfig.

PATCH /superadmin/organizations/:id/config
  Body: {
    display_name?: string;
    plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
    max_users?: number;
    max_sites?: number;
    logo_url?: string;       // URL Cloudinary ya subida
    primary_color?: string;  // hex #RRGGBB (white-label futuro)
  }
  — Crea OrgConfig si no existe (upsert).
  — Registra updated_by_super_admin_id.

GET  /superadmin/organizations/:id/usage
  Respuesta: {
    currentUsers: number;
    maxUsers: number;
    currentSites: number;
    maxSites: number;
    plan: PlanTier;
  }
  — Consultas en Promise.all; cacheado en Redis TTL 60s.

POST /superadmin/magic-link/first-admin
  — Delega en MagicLinkService.generateFirstAdminLink().
  — Ve contrato magic-link.md.
```

## Modelo de datos relevante

Modelo nuevo `OrgConfig` (tabla `org_configs`): `org_id` (unique), `plan` (STARTER/PROFESSIONAL/ENTERPRISE), `max_users`, `max_sites`, `display_name`, `logo_url`, `primary_color`, `updated_at`, `updated_by_super_admin_id`.

## Eventos Redis pub/sub

No emite ni consume eventos. Caché de métricas de uso con clave `superadmin:usage:<orgId>` TTL 60s.

## Relación con panel existente

El panel `/super` existente tiene: `OrganizationsPage` (lista), `CreateOrgPage` (crear org), `OrgDetailPage` (detalle). Este módulo agrega a `OrgDetailPage`: sección de `OrgConfig`, barras de progreso de uso, y sección de magic link.

## Feature flag

| Flag | Controla |
|---|---|
| `feature:superadmin_panel` | Habilita las secciones nuevas del panel super (métricas, OrgConfig, magic link). El panel base existente no se afecta. |
