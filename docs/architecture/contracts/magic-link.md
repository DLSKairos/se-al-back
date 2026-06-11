# Contrato — Módulo `magic-link`

## Responsabilidad única

Generar, validar y consumir tokens de un solo uso para el primer acceso de administradores e invitaciones entre administradores. El token lleva al usuario a una pantalla donde vincula su cuenta Google o Microsoft (no existe creación de contraseña).

## Capa

Backend (NestJS) + Frontend (React — pantalla de activación).

## Dependencias

| Módulo | Motivo |
|---|---|
| `users` (EXISTENTE) | El token se vincula a un `User` existente; al consumirlo se activa el usuario |
| `auth-oauth` (NUEVO) | La pantalla de activación post-magic-link dirige al flujo OAuth para vincular cuenta |
| `notifications` (NUEVO) | Crear notificación `MAGIC_LINK_SENT` en-app para el usuario que recibe el link |
| `nodemailer` (EXISTENTE) | Envío del email con el link al usuario destinatario |
| `common` (EXISTENTE) | Guards de rol para endpoints protegidos |

## Superficie pública (endpoints)

```
— Generación (protegidos)
POST /superadmin/magic-link/first-admin
  Guard: SUPER_ADMIN
  Body: { targetUserId: string }
  — Solo para el primer admin de una empresa cliente.
  — Token expira en 72h.
  — Envía email al User.email (que debió ser cargado previamente por el SUPER_ADMIN).
  — Crea notificación MAGIC_LINK_SENT.

POST /admin/magic-link/invite
  Guard: ADMIN, SUPER_ADMIN
  Body: { targetUserId: string }
  — Invitación a nuevo administrador de la misma organización.
  — Token expira en 48h.

POST /admin/magic-link/resend/:tokenId
  Guard: ADMIN, SUPER_ADMIN
  — Invalida el token anterior (marca used_at = now, purpose queda igual).
  — Genera un token nuevo con el mismo propósito.
  — Reenvía el email.

— Consumo (público)
GET /auth/magic-link?token=xxx
  — Público (sin guard JWT).
  — Valida el token: existencia, expiración, que no haya sido usado.
  — Si válido: marca `used_at`, devuelve { userId, name, orgName, purpose } para que el frontend
    muestre la pantalla de activación y dirija al flujo OAuth.
  — Si inválido/expirado: devuelve { error: 'TOKEN_EXPIRED' | 'TOKEN_USED' | 'TOKEN_NOT_FOUND' }
    con mensaje claro para la UI.
```

## Eventos Redis pub/sub

No emite ni consume eventos de dominio. El email se envía de forma sincrónica vía nodemailer.

## Modelo de datos relevante

Tabla nueva `magic_link_tokens` (ver Bloque 2 del sprint). Campos clave: `token`, `user_id`, `purpose` (FIRST_ACCESS_ADMIN | ADMIN_INVITE), `expires_at`, `used_at`, `created_by_super_admin`.

## Idempotencia

`validateAndConsume(token)` es idempotente: si el token ya fue consumido, responde con error `TOKEN_USED` en lugar de procesarlo de nuevo. No lanza excepción 500.

## Propósitos eliminados

`EXTERNAL_SIGNER` (mencionado en sprint original) se elimina. Los firmantes externos usan `firma_tokens` del módulo `electronic-signature`, no magic links.

## Variables de entorno requeridas

```env
MAGIC_LINK_BASE_URL=https://app.señal.co   # URL base para construir el link
MAGIC_LINK_SECRET=                          # Usado para firmar el token (HMAC) si se decide usar JWT en lugar de UUID4
```

## Feature flag

| Flag | Controla |
|---|---|
| `feature:magic_link` | Habilita la generación y validación de magic links para admins |

Si el flag está off, `POST /superadmin/magic-link/first-admin` y `POST /admin/magic-link/invite` responden 404.
