# Configurar OAuth con Google (Login de administradores)

Esta guía explica paso a paso cómo crear las credenciales de Google OAuth 2.0 y conectarlas al backend de SEÑAL.

---

## Requisitos previos

- Cuenta Google con acceso a [Google Cloud Console](https://console.cloud.google.com)
- El backend corriendo (al menos en desarrollo)
- Redis disponible para activar el feature flag al final

---

## Paso 1 — Crear o seleccionar un proyecto en Google Cloud Console

1. Abre [https://console.cloud.google.com](https://console.cloud.google.com).
2. En la barra superior, haz clic en el selector de proyecto (junto al logo de Google Cloud).
3. Elige **"Nuevo proyecto"**.
   - Nombre sugerido: `senal-production` (o `senal-staging` para el entorno de pruebas).
   - La organización puede quedar en blanco si es una cuenta personal.
4. Haz clic en **Crear** y espera a que se cree (tarda unos segundos).
5. Asegúrate de que el proyecto recién creado esté seleccionado en el selector.

---

## Paso 2 — Habilitar la API de Google Identity

1. En el menú lateral, ve a **"APIs y servicios" > "Biblioteca"**.
2. Busca **"Google Identity"** o directamente **"Google+ API"**.
3. Selecciona **"Google+ API"** y haz clic en **Habilitar**.

   > En proyectos nuevos también puedes usar directamente OAuth 2.0 sin habilitar una API específica; las credenciales de tipo "ID de cliente OAuth" funcionan por defecto para autenticación básica (`openid`, `email`, `profile`).

---

## Paso 3 — Configurar la pantalla de consentimiento OAuth

La pantalla de consentimiento es lo que el usuario ve antes de autorizar el acceso.

1. Ve a **"APIs y servicios" > "Pantalla de consentimiento de OAuth"**.
2. Tipo de usuario: selecciona **"Externo"** (permite que cualquier cuenta Google inicie sesión; apropiado para SaaS).
3. Haz clic en **Crear**.
4. Completa los campos obligatorios:
   - **Nombre de la aplicación:** `SEÑAL`
   - **Correo electrónico de soporte:** tu email de contacto
   - **Correo electrónico del desarrollador:** el mismo email
5. En la sección **"Dominios autorizados"**, agrega:
   - `tu-dominio.com` (dominio de producción cuando esté listo)
   - Para desarrollo no es necesario agregar `localhost`.
6. Haz clic en **Guardar y continuar**.
7. En la pantalla **"Permisos"** (Scopes), haz clic en **"Agregar o quitar permisos"** y selecciona:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
8. Haz clic en **Actualizar** y luego **Guardar y continuar**.
9. En **"Usuarios de prueba"**: durante desarrollo agrega los emails de los admins que harán pruebas (mientras la app esté en modo "Testing"). En producción, cuando hagas la verificación de Google, esto no es necesario.
10. Haz clic en **Guardar y continuar** y luego en **Volver al panel**.

---

## Paso 4 — Crear las credenciales OAuth 2.0

1. Ve a **"APIs y servicios" > "Credenciales"**.
2. Haz clic en **"+ Crear credenciales" > "ID de cliente de OAuth"**.
3. Tipo de aplicación: **"Aplicación web"**.
4. Nombre: `SEÑAL Backend` (o el nombre que prefieras).
5. **Orígenes de JavaScript autorizados** — agrega:
   - `https://localhost:3000` (desarrollo)
   - `https://api.tu-dominio.com` (producción, cuando aplique)
6. **URI de redireccionamiento autorizados** — agrega:
   - `https://localhost:3000/api/auth/google/callback` (desarrollo)
   - `https://api.tu-dominio.com/api/auth/google/callback` (producción)
7. Haz clic en **Crear**.
8. Aparecerá una ventana con el **ID de cliente** y el **Secreto de cliente**. Cópialos de inmediato (el secreto no se puede ver de nuevo después de cerrar esta ventana, aunque siempre puedes generar uno nuevo).

---

## Paso 5 — Agregar las credenciales al .env

Abre el archivo `.env` del backend y completa las tres variables:

```env
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_CALLBACK_URL=https://localhost:3000/api/auth/google/callback
```

Para producción cambia `GOOGLE_CALLBACK_URL` por la URL real:

```env
GOOGLE_CALLBACK_URL=https://api.tu-dominio.com/api/auth/google/callback
```

Recuerda que esta misma URL debe estar registrada en Google Cloud Console (paso 4.6).

---

## Paso 6 — Activar el feature flag en Redis

El feature flag controla si el módulo OAuth de Google está activo en tiempo de ejecución. Aunque el `.env` esté completo, sin el flag activo el endpoint devuelve 404.

Conéctate a Redis y ejecuta:

```bash
redis-cli SET feature:oauth_google "on"
```

Para verificar que quedó activo:

```bash
redis-cli GET feature:oauth_google
# Debe devolver: "on"
```

Para desactivarlo en cualquier momento (sin redeployar):

```bash
redis-cli SET feature:oauth_google "off"
```

---

## Paso 7 — Verificar que funciona

1. Reinicia el backend para que tome las nuevas variables de entorno.
2. Llama al endpoint de inicio de flujo OAuth:
   ```
   GET https://localhost:3000/api/auth/google
   ```
   Debes ser redirigido a la pantalla de consentimiento de Google.
3. Después de autorizar, Google redirige a la callback URL. El backend valida el token, crea o recupera al usuario ADMIN y responde con el JWT de SEÑAL.

---

## Solución de problemas frecuentes

| Problema | Causa probable | Solución |
|---|---|---|
| `redirect_uri_mismatch` | La URL de callback no está en Google Cloud Console | Agregar la URL exacta en "URI de redireccionamiento autorizados" (paso 4.6) |
| El endpoint devuelve 404 | El feature flag no está activo | `redis-cli SET feature:oauth_google "on"` |
| `Error 403: access_denied` | El email no está en usuarios de prueba (modo Testing) | Agregar el email en "Usuarios de prueba" en la pantalla de consentimiento, o publicar la app |
| Las variables de entorno no se leen | El servidor no se reinició tras editar .env | Reiniciar el proceso de NestJS |
