# Contrato — Módulo `auth-oauth`

## Responsabilidad única

Implementar los flujos OAuth 2.0 (Google y Microsoft) exclusivamente para usuarios con rol `ADMIN` o `SUPER_ADMIN`. No crea cuentas nuevas; solo vincula una cuenta OAuth existente a un usuario SEÑAL ya registrado.

## Capa

Backend (NestJS — estrategias Passport) + Frontend (React — botones en login y pantalla de activación).

## Dependencias

| Módulo | Motivo |
|---|---|
| `auth` (EXISTENTE) | Emite el mismo JWT que el login normal; reutiliza `JwtService` y `JwtAuthGuard` |
| `users` (EXISTENTE) | Busca el usuario por email OAuth para validar que es ADMIN/SUPER_ADMIN antes de completar el login |
| `magic-link` (NUEVO) | El flujo de activación post-magic-link termina vinculando la cuenta OAuth aquí |
| `redis` (EXISTENTE) | Almacena el `state` anti-CSRF durante el handshake OAuth (TTL 5 min) |
| `feature-flags` | Lee `feature:oauth_google` y `feature:oauth_microsoft` antes de exponer los endpoints |

## Superficie pública (endpoints)

```
GET /auth/google
  — Redirige al consentimiento de Google.
  — Genera `state` anti-CSRF aleatorio, lo guarda en Redis TTL 5 min.
  — Requiere feature flag oauth_google = on.
  — PKCE: code_verifier almacenado en Redis junto al state.

GET /auth/google/callback
  — Callback de Google. Valida state contra Redis.
  — Si el email no corresponde a un User con rol ADMIN/SUPER_ADMIN:
    → Responde con error: "Esta cuenta no está registrada como administrador en SEÑAL."
  — Si válido: actualiza oauth_provider, oauth_provider_id, last_oauth_sync en User.
  — Almacena oauth_access_token y oauth_refresh_token cifrados (AES-256).
  — Emite JWT igual al del login normal → redirect al frontend con token.

GET /auth/microsoft
  — Análogo a /auth/google.
  — Requiere feature flag oauth_microsoft = on.

GET /auth/microsoft/callback
  — Análogo a /auth/google/callback.
```

## Seguridad

- PKCE obligatorio (code_challenge / code_verifier).
- Parámetro `state` aleatorio por request, almacenado en Redis con TTL 5 min.
- Tokens OAuth (`access_token`, `refresh_token`) cifrados en reposo con AES-256-CBC usando `ENCRYPTION_KEY` del `.env`.
- No se permite registro automático vía OAuth: si el email no existe en la BD como ADMIN/SUPER_ADMIN, el flujo se rechaza.
- SUPER_ADMIN mantiene su login actual (cédula + PIN/WebAuthn); OAuth para SUPER_ADMIN es opcional y solo si el flag está activo.

## Eventos Redis pub/sub

No emite ni consume eventos de dominio. Solo usa Redis para almacenamiento temporal del state/code_verifier.

## Variables de entorno requeridas

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://<dominio>/api/auth/google/callback

MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_CALLBACK_URL=https://<dominio>/api/auth/microsoft/callback
MICROSOFT_TENANT_ID=common  # o el tenant específico del cliente

ENCRYPTION_KEY=             # 32 bytes hex — cifra tokens OAuth
```

## Feature flags

| Flag | Controla |
|---|---|
| `feature:oauth_google` | Habilita endpoints y botón "Continuar con Google" en UI |
| `feature:oauth_microsoft` | Habilita endpoints y botón "Continuar con Microsoft" en UI |

Si el flag está off, el endpoint responde 404 y el frontend no muestra el botón.
