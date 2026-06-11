# Feature Flags — Activación y desactivación

Los feature flags permiten habilitar o deshabilitar funcionalidades del backend en tiempo real, sin necesidad de un nuevo deploy. Se almacenan en Redis como claves string simples.

---

## Concepto clave

Cada flag funciona como un interruptor:
- Valor `"on"` — funcionalidad activa
- Valor `"off"` o clave inexistente — funcionalidad inactiva (comportamiento por defecto)

El backend refresca los flags desde Redis cada 30 segundos. Un cambio tarda como máximo 30 segundos en propagarse.

---

## Flags disponibles

### `feature:oauth_google`

**Qué habilita:** el flujo de login con Google para administradores.
- Activa los endpoints `GET /api/auth/google` y `GET /api/auth/google/callback`.
- En la pantalla de login del frontend aparece el botón "Continuar con Google".
- Requiere que `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_CALLBACK_URL` estén configurados en `.env`.
- Guía de configuración: `docs/setup/oauth-google.md`

### `feature:oauth_microsoft`

**Qué habilita:** el flujo de login con Microsoft para administradores.
- Activa los endpoints `GET /api/auth/microsoft` y `GET /api/auth/microsoft/callback`.
- En la pantalla de login del frontend aparece el botón "Continuar con Microsoft".
- Requiere que `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` y `MICROSOFT_CALLBACK_URL` estén configurados en `.env`.
- Guía de configuración: `docs/setup/oauth-microsoft.md`

### `feature:electronic_signature`

**Qué habilita:** el módulo completo de firma electrónica externa.
- Activa la generación de tokens de firma (`firma_tokens`), la ruta pública `/firma/:token` y el registro de firmantes externos (nombre, cédula, celular, foto de cédula, selfie).
- Habilita los estados `PENDING_SIGNATURES` en submissions y la auto-aprobación cuando todas las firmas se completan.
- Requiere `SIGNATURE_TOKEN_TTL_HOURS` en `.env` (default: `2`).
- Requiere `ENCRYPTION_KEY` para cifrar los tokens de firma.
- Requiere Cloudinary configurado (modo `authenticated`) para almacenar las fotos sensibles.

### `feature:magic_link`

**Qué habilita:** la generación y validación de magic links para el primer acceso de administradores.
- Permite al SUPER_ADMIN generar un link de invitación para el primer admin de una organización.
- El admin recibe el link por email, hace clic y llega a una pantalla donde vincula su cuenta Google o Microsoft.
- Requiere `MAGIC_LINK_SECRET` y `MAGIC_LINK_BASE_URL` en `.env`.
- Requiere SMTP configurado para el envío del email (ver `docs/setup/smtp.md`).
- Requiere que al menos uno de `feature:oauth_google` o `feature:oauth_microsoft` esté activo (el magic link lleva al flujo de vinculación OAuth).

### `feature:superadmin_panel`

**Qué habilita:** las secciones nuevas del panel `/super` de SEÑAL.
- `OrgConfig`: configuración de plan (STARTER / PROFESSIONAL / ENTERPRISE), límites de usuarios y sedes, display name, logo y color de la organización.
- Métricas de uso: usuarios y sedes activas vs límite del plan, con barras de progreso.
- Generación de magic link desde el panel del super admin para el primer admin de cada empresa cliente.
- Historial de magic links generados (con estado: pendiente / usado / expirado).
- `PlanLimitsGuard`: cuando está activo, bloquea la creación de usuarios o sedes si se supera el límite del plan (responde `403 Forbidden` con mensaje claro).

---

## Comandos redis-cli

### Activar un flag

```bash
redis-cli SET feature:oauth_google "on"
redis-cli SET feature:oauth_microsoft "on"
redis-cli SET feature:electronic_signature "on"
redis-cli SET feature:magic_link "on"
redis-cli SET feature:superadmin_panel "on"
```

### Desactivar un flag

```bash
redis-cli SET feature:oauth_google "off"
redis-cli SET feature:oauth_microsoft "off"
redis-cli SET feature:electronic_signature "off"
redis-cli SET feature:magic_link "off"
redis-cli SET feature:superadmin_panel "off"
```

### Ver el estado de todos los flags a la vez

```bash
redis-cli MGET \
  feature:oauth_google \
  feature:oauth_microsoft \
  feature:electronic_signature \
  feature:magic_link \
  feature:superadmin_panel
```

El resultado es una lista en el mismo orden que los argumentos. Ejemplo de salida:

```
1) "on"
2) "off"
3) "off"
4) "on"
5) "on"
```

### Verificar un flag específico

```bash
redis-cli GET feature:magic_link
# Devuelve: "on" | "off" | (nil)
# (nil) significa que la clave no existe → el flag se trata como "off"
```

---

## Estado inicial recomendado al hacer el primer deploy

Ejecutar manualmente antes de arrancar el backend por primera vez en producción:

```bash
redis-cli SET feature:oauth_google "off"
redis-cli SET feature:oauth_microsoft "off"
redis-cli SET feature:electronic_signature "off"
redis-cli SET feature:magic_link "off"
redis-cli SET feature:superadmin_panel "off"
```

Activar cada flag uno a uno, solo cuando las credenciales correspondientes estén completas en `.env` y se haya verificado el flujo en staging.

---

## Orden de activación recomendado

Para una puesta en marcha sin errores, sigue este orden:

1. Configurar SMTP (`docs/setup/smtp.md`) y verificar que los emails llegan.
2. Configurar OAuth Google (`docs/setup/oauth-google.md`) y verificar el flujo completo en staging.
3. Activar `feature:oauth_google`.
4. Activar `feature:magic_link` (depende de SMTP + al menos un OAuth activo).
5. Configurar OAuth Microsoft si se desea como alternativa y activar `feature:oauth_microsoft`.
6. Cuando las credenciales de firma electrónica estén listas, activar `feature:electronic_signature`.
7. Activar `feature:superadmin_panel` cuando el equipo de Kairos confirme que OrgConfig y métricas están listos para usar.

---

## Endpoint público para el frontend

El backend expone un endpoint sin autenticación que el frontend consulta al arrancar:

```
GET /api/feature-flags
```

Respuesta ejemplo:

```json
{
  "oauth_google": true,
  "oauth_microsoft": false,
  "electronic_signature": false,
  "magic_link": true,
  "superadmin_panel": true
}
```

El frontend usa estos valores para mostrar u ocultar elementos de UI (botones OAuth, sección de firma, secciones del panel super admin). La respuesta tiene `Cache-Control: max-age=30`.
