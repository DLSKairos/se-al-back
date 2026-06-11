# Configurar OAuth con Microsoft (Login de administradores)

Esta guía explica paso a paso cómo registrar la aplicación en Azure AD / Microsoft Entra ID y conectar las credenciales al backend de SEÑAL.

---

## Requisitos previos

- Cuenta Microsoft con acceso a [Azure Portal](https://portal.azure.com) (puede ser una cuenta personal de Outlook/Hotmail o una cuenta de trabajo/escuela)
- El backend corriendo (al menos en desarrollo)
- Redis disponible para activar el feature flag al final

---

## Paso 1 — Acceder al registro de aplicaciones en Azure

1. Abre [https://portal.azure.com](https://portal.azure.com) e inicia sesión.
2. En la barra de búsqueda superior, escribe **"Registros de aplicaciones"** y selecciona el resultado.
3. Haz clic en **"+ Nuevo registro"**.

---

## Paso 2 — Registrar la aplicación

Completa el formulario de registro:

1. **Nombre:** `SEÑAL` (nombre visible en la pantalla de consentimiento).
2. **Tipos de cuenta admitidos:** selecciona la tercera opción:
   > "Cuentas en cualquier directorio organizativo (cualquier directorio de Azure AD - Multiinquilino) y cuentas Microsoft personales (por ejemplo, Skype, Xbox)"

   Esta opción corresponde al tenant `common` en las variables de entorno. Permite que administradores con cualquier cuenta Microsoft (corporativa o personal) inicien sesión.

3. **URI de redireccionamiento:**
   - Plataforma: **Web**
   - URI: `https://localhost:3000/api/auth/microsoft/callback`

4. Haz clic en **Registrar**.

Tras registrar la app, Azure te muestra el panel de la aplicación. Guarda estos dos valores que necesitarás luego:
- **Id. de aplicación (cliente):** este es el `MICROSOFT_CLIENT_ID`
- **Id. de directorio (inquilino):** para uso multiinquilino (`common`) este valor no se usa directamente, pero guárdalo como referencia

---

## Paso 3 — Agregar URI de redireccionamiento de producción

Cuando tengas el dominio de producción listo:

1. En el panel de la app, ve a **"Autenticación"** en el menú lateral.
2. Bajo **"Configuraciones de plataforma" > "Web"**, haz clic en **"Agregar URI"**.
3. Agrega: `https://api.tu-dominio.com/api/auth/microsoft/callback`
4. Haz clic en **Guardar**.

---

## Paso 4 — Configurar permisos (Scopes)

1. En el menú lateral, ve a **"Permisos de API"**.
2. Ya debería aparecer `Microsoft Graph > User.Read` por defecto. Si no, haz clic en **"Agregar un permiso"**.
3. Selecciona **"Microsoft Graph" > "Permisos delegados"**.
4. Busca y selecciona:
   - `openid`
   - `email`
   - `profile`
   - `User.Read` (lectura básica del perfil del usuario)
5. Haz clic en **Agregar permisos**.
6. Haz clic en **"Conceder consentimiento de administrador para [nombre de tu tenant]"** y confirma.

   > Si estás con una cuenta personal (sin organización), este botón puede no aparecer. No es un problema: el consentimiento se otorgará individualmente cada vez que un usuario inicie sesión por primera vez.

---

## Paso 5 — Crear el secreto de cliente

El secreto de cliente es la contraseña que usa el backend para verificar la identidad ante Microsoft.

1. En el menú lateral, ve a **"Certificados y secretos"**.
2. En la pestaña **"Secretos de cliente"**, haz clic en **"+ Nuevo secreto de cliente"**.
3. Completa:
   - **Descripción:** `senal-backend-secret`
   - **Expira:** selecciona **24 meses** (o el periodo que prefiera tu equipo; recuerda renovarlo antes de que expire para no perder el acceso)
4. Haz clic en **Agregar**.
5. **Copia el valor del secreto inmediatamente.** Azure solo lo muestra una vez. Si lo pierdes, deberás crear uno nuevo.

---

## Paso 6 — Agregar las credenciales al .env

Abre el archivo `.env` del backend y completa las cuatro variables:

```env
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MICROSOFT_TENANT_ID=common
MICROSOFT_CALLBACK_URL=https://localhost:3000/api/auth/microsoft/callback
```

- `MICROSOFT_TENANT_ID=common` permite cuentas de cualquier tenant de Azure AD y cuentas personales Microsoft. Solo cambiar este valor si la app debe limitarse a un tenant específico de una organización.
- Para producción, cambiar `MICROSOFT_CALLBACK_URL` por la URL real (la misma que registraste en el paso 3).

---

## Paso 7 — Activar el feature flag en Redis

El feature flag controla si el módulo OAuth de Microsoft está activo en tiempo de ejecución. Aunque el `.env` esté completo, sin el flag activo el endpoint devuelve 404.

```bash
redis-cli SET feature:oauth_microsoft "on"
```

Para verificar:

```bash
redis-cli GET feature:oauth_microsoft
# Debe devolver: "on"
```

Para desactivarlo:

```bash
redis-cli SET feature:oauth_microsoft "off"
```

---

## Paso 8 — Verificar que funciona

1. Reinicia el backend para que tome las nuevas variables de entorno.
2. Llama al endpoint de inicio de flujo OAuth:
   ```
   GET https://localhost:3000/api/auth/microsoft
   ```
   Debes ser redirigido a la pantalla de login de Microsoft.
3. Después de autenticar, Microsoft redirige a la callback URL. El backend valida el token, crea o recupera al usuario ADMIN y responde con el JWT de SEÑAL.

---

## Solución de problemas frecuentes

| Problema | Causa probable | Solución |
|---|---|---|
| `AADSTS50011: The redirect URI specified does not match` | La callback URL del .env no está registrada en Azure | Agregar la URL exacta en "Autenticación" > "Web" (paso 3) |
| El endpoint devuelve 404 | El feature flag no está activo | `redis-cli SET feature:oauth_microsoft "on"` |
| `AADSTS65001: The user or administrator has not consented` | Permisos no otorgados | Conceder consentimiento en "Permisos de API" (paso 4.6) |
| `invalid_client` | El secreto expiró o fue copiado incorrectamente | Generar un nuevo secreto en "Certificados y secretos" (paso 5) |
| Las variables de entorno no se leen | El servidor no se reinició tras editar .env | Reiniciar el proceso de NestJS |

---

## Nota sobre renovación del secreto

Los secretos de Azure expiran. Cuando un secreto expira, el login con Microsoft deja de funcionar de forma silenciosa (los usuarios ven un error genérico). Se recomienda:

1. Poner una alerta en el calendario 30 días antes de la fecha de expiración.
2. Crear un nuevo secreto, actualizar el `.env` y reiniciar el backend.
3. Borrar el secreto expirado en Azure.
