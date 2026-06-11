# Contrato — Módulo `master-lists`

## Responsabilidad única

Gestionar los catálogos maestros de la plataforma (cargos, roles operativos y departamentos) con soporte de registros globales seeded por Kairos y registros propios por organización, reemplazando los campos de texto libre actuales con selects que nunca quedan vacíos.

## Capa

Backend (NestJS) + Frontend (React — reemplaza inputs de texto libre en formularios del sistema).

## Dependencias

| Módulo | Motivo |
|---|---|
| `departments` (EXISTENTE) | `Department` se extiende para soportar `org_id = null` (global, Kairos) y campo `active` (soft delete) |
| `organizations` (EXISTENTE) | Scope de registros propios por `org_id` |
| `users` (EXISTENTE) | `job_title` (texto libre) se reemplaza por FK a `MasterPosition`; `MasterRole` es el rol operativo del usuario |
| `common` (EXISTENTE) | Guards de rol |

## Tablas nuevas (BD)

| Tabla | Propósito |
|---|---|
| `master_positions` | Cargos: `id`, `name`, `org_id` (null = global), `active`, `created_at` |
| `master_roles` | Roles operativos: `id`, `name`, `org_id` (null = global), `active`, `created_at` |

`Department` existente se extiende: `org_id` pasa de `NOT NULL` a nullable (solo los globales tienen `org_id = null`), se agrega campo `active boolean @default(true)`.

## Superficie pública (endpoints)

```
— Lectura (autenticados, todos los roles)
GET /master/positions?orgId=xxx
  — Devuelve: globales (org_id = null) + propios de la org, activos, orden alfabético.
GET /master/roles?orgId=xxx
  — Igual que positions.
GET /master/departments?orgId=xxx
  — Combina departamentos globales + propios de la org.

— Gestión por admin
POST   /admin/master/positions          — Crear personalizado para la org. Guard: ADMIN.
POST   /admin/master/roles              — Guard: ADMIN.
POST   /admin/master/departments        — Guard: ADMIN.
PATCH  /admin/master/:type/:id          — Editar nombre. Guard: ADMIN.
  :type ∈ 'positions' | 'roles' | 'departments'
PATCH  /admin/master/:type/:id/deactivate   — Soft delete. Guard: ADMIN.

— Sugerencia de valor (operario)
POST /master/suggestions
  Body: { type: 'position' | 'role' | 'department'; value: string; orgId: string }
  Guard: OPERATOR
  — Crea registro pendiente de aprobación (no visible en las listas hasta que el admin apruebe).

GET  /admin/master/suggestions          — Lista sugerencias pendientes. Guard: ADMIN.
PATCH /admin/master/suggestions/:id/approve  — Aprueba → crea el registro en la tabla maestra.
PATCH /admin/master/suggestions/:id/reject   — Rechaza con motivo.
```

## Eventos Redis pub/sub

No emite ni consume eventos. Los listados se cachean en Redis con clave `master:<type>:<orgId>` TTL 300s; se invalidan al crear, editar o desactivar un registro.

## Seed inicial

Archivo `prisma/seed/master-lists.ts` con valores por defecto para sector construcción/hidrocarburos (ver Bloque 2 del sprint para la lista completa). El seed inserta con `org_id = null` (globales).

## Notas de implementación

- Los registros globales (`org_id = null`) solo puede editarlos un SUPER_ADMIN (no se expone este endpoint en este sprint; se hace directamente desde el seed).
- El campo `User.job_title` (texto libre) se reemplaza por `User.position_id` (FK a `master_positions`) en el Bloque 2. Los valores existentes se migran con un script antes de la migración de esquema.
- Un operario que no encuentra su cargo en la lista usa el flujo de sugerencia. El admin recibe una notificación en-app (`SYSTEM_ALERT`) cuando hay sugerencias pendientes.
