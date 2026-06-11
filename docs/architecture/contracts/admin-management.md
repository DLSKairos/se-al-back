# Contrato — Módulo `admin-management`

## Responsabilidad única

Permitir a un administrador crear, listar y desactivar/reactivar otros administradores dentro de su propia organización, respetando los límites del plan y disparando automáticamente el envío del magic link de invitación.

## Capa

Backend (NestJS) + Frontend (React — sección en panel admin).

## Dependencias

| Módulo | Motivo |
|---|---|
| `users` (EXISTENTE) | Crea o modifica registros `User` con rol `ADMIN` |
| `magic-link` (NUEVO) | Al crear un admin, genera y envía automáticamente el magic link de invitación |
| `plan-limits` (NUEVO) | `PlanLimitsGuard` valida que la org no supere `OrgConfig.max_users` antes de crear |
| `common` (EXISTENTE) | Guard `RolesGuard(ADMIN, SUPER_ADMIN)` |

## Superficie pública (endpoints)

Todos requieren guard `ADMIN` o `SUPER_ADMIN`. Los admins solo pueden gestionar usuarios de su propia organización (scope por `orgId` del JWT).

```
GET  /admin/administrators
  — Lista administradores de la organización.
  — Incluye: nombre, email, estado (activo/inactivo), último login OAuth.

POST /admin/administrators
  Body: { name: string; email: string; }
  — Valida unicidad de email en la org.
  — Crea User con role = ADMIN, is_active = false (se activa al completar OAuth).
  — Invoca MagicLinkService.generateAdminInviteLink() → envía email automáticamente.
  — PlanLimitsGuard verifica límite antes de crear.

PATCH /admin/administrators/:id/deactivate
  — Soft delete: is_active = false.
  — No elimina el registro para mantener historial de submissions y firmas.

PATCH /admin/administrators/:id/reactivate
  — is_active = true.
  — Si no tiene oauth_provider_id, genera nuevo magic link de invitación.
```

## Eventos Redis pub/sub

No emite ni consume eventos de dominio.

## Validaciones de negocio

- Un admin no puede desactivarse a sí mismo.
- No se puede crear un admin con un email ya existente en la organización (aunque esté inactivo).
- SUPER_ADMIN puede gestionar administradores de cualquier organización; ADMIN solo de la suya.

## Notas de implementación

- El campo `email` se vuelve obligatorio a nivel de servicio para usuarios con rol `ADMIN` (el schema lo admite nullable para no romper operarios existentes).
- El nuevo admin no tiene `pin_hash` ni `identification_number` obligatorio hasta que complete la activación OAuth.
