# Contrato — Módulo `admin-notifications`

## Responsabilidad única

Permitir a los administradores crear y enviar notificaciones manuales (`CUSTOM_ADMIN`) a grupos de usuarios (todos, por obra, o selección individual) desde el panel admin.

## Capa

Backend (NestJS) + Frontend (React — nueva sección "Comunicaciones" en panel admin).

## Dependencias

| Módulo | Motivo |
|---|---|
| `notifications` (NUEVO) | Delega la creación real en `NotificationsService.create()` para cada destinatario |
| `users` (EXISTENTE) | Resolver lista de destinatarios según criterio (todos de la org, por obra, IDs específicos) |
| `work-locations` (EXISTENTE) | Resolver destinatarios de una obra específica |
| `auth` / `common` (EXISTENTE) | Guard `RolesGuard(ADMIN, SUPER_ADMIN)` |

## Superficie pública (endpoints)

```
POST /admin/notifications
  Body: {
    title: string;           // máx 60 chars
    body: string;            // máx 200 chars
    target: 'ALL' | 'SITE' | 'SPECIFIC';
    workLocationId?: string; // requerido si target = 'SITE'
    userIds?: string[];      // requerido si target = 'SPECIFIC'
  }
  Guard: ADMIN, SUPER_ADMIN
  Scope: solo usuarios de la organización del admin autenticado

GET /admin/notifications/sent
  — Historial de notificaciones enviadas por el admin autenticado
  — Paginado: ?page=1&limit=20
  — Devuelve: fecha, título, nro. de destinatarios, quién la creó
```

## Eventos Redis pub/sub

No emite ni consume eventos propios. La emisión de `notification.created` la hace `NotificationsService` por cada notificación individual creada.

## Notas de implementación

- Para `target: 'ALL'`, la operación es un bulk: `NotificationsService.create()` se invoca una vez por cada usuario activo de la org. Si la org tiene muchos usuarios, procesar en lotes (batch de 50) para no saturar Redis.
- El historial de "notificaciones enviadas" se puede derivar consultando la tabla `notifications` filtrada por `created_by_admin_id`.
- La pantalla frontend ("Comunicaciones") incluye preview en tiempo real del mensaje y modal de confirmación antes de enviar.

## Feature flag

No está detrás de feature flag. Disponible cuando el sprint esté completo.
