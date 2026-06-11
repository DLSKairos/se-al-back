# Contrato — Módulo `notifications`

## Responsabilidad única

Gestionar el ciclo de vida de las notificaciones en-app para todos los usuarios: creación, almacenamiento, entrega en tiempo real vía WebSocket y marcado de lectura.

## Capa

Backend (NestJS) + Frontend (React).

## Dependencias

| Módulo | Motivo |
|---|---|
| `redis` (EXISTENTE) | Pub/sub para distribuir eventos `notification.created` al gateway WebSocket |
| `users` (EXISTENTE) | Validar que el `userId` receptor existe y obtener datos del usuario |
| WebSocket (Socket.IO) | Entrega en tiempo real; rooms por `userId` |

## Superficie pública (endpoints)

```
GET    /notifications                  — Lista paginada para el usuario autenticado
                                         ?unreadOnly=true&page=1&limit=20
PATCH  /notifications/:id/read         — Marcar una notificación como leída (valida ownership)
PATCH  /notifications/read-all         — Marcar todas como leídas para el usuario autenticado
POST   /admin/notifications            — Guard: ADMIN, SUPER_ADMIN  (ver admin-notifications)
GET    /admin/notifications/sent       — Historial de envíos por admin autenticado
```

## Eventos Redis pub/sub

| Canal | Dirección | Payload |
|---|---|---|
| `notification.created` | Emite | `{ notificationId, userId, type, title }` |

El gateway WebSocket suscribe a `notification.created` y reenvía el evento al room del usuario vía Socket.IO con el nombre de evento `notification`.

## Modelo de datos relevante

Tabla nueva `notifications` (ver Bloque 2 del sprint). Relación con `User` (receptor) y opcionalmente con `User` (admin que la creó vía `created_by_admin_id`).

## Tipos de notificación (enum `NotificationType`)

`FORM_SUBMITTED`, `FORM_APPROVED`, `FORM_REJECTED`, `FORM_PENDING_SIGNATURE`, `MAGIC_LINK_SENT`, `SYSTEM_ALERT`, `CUSTOM_ADMIN`.

## Interfaz pública hacia otros módulos (NestJS)

```typescript
// NotificationsService — método que otros módulos invocan
create(dto: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  deepLink?: string;
  createdByAdminId?: string;
}): Promise<Notification>
```

## Feature flag

No está detrás de feature flag. Es infraestructura base del sprint.

## Notas de convivencia

- `form-notifications` (EXISTENTE) no se modifica. Sigue enviando emails por trigger de plantilla.
- `push-notifications` (EXISTENTE) no se modifica. Sigue enviando web-push.
- Este módulo es independiente de ambos. Los demás módulos del sprint que necesiten notificar al usuario invocan `NotificationsService.create()`.
