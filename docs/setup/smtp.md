# Configurar SMTP para envío de emails

SEÑAL usa nodemailer para enviar emails (magic links de activación de admins, notificaciones de formularios). Esta guía cubre las dos opciones más comunes: Gmail con contraseña de aplicación y un servicio transaccional (Brevo o SendGrid).

---

## Variables de entorno involucradas

```env
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

---

## Opción A — Gmail con contraseña de aplicación

Esta opción es la más rápida para desarrollo o proyectos con bajo volumen de emails (menos de 500 por día).

### Requisitos

- Una cuenta de Gmail
- Verificación en dos pasos activada en esa cuenta (obligatorio para crear contraseñas de aplicación)

### Pasos

1. Abre tu cuenta de Gmail y ve a [https://myaccount.google.com/security](https://myaccount.google.com/security).
2. Confirma que **"Verificación en 2 pasos"** está activa. Si no lo está, actívala primero.
3. En esa misma página, busca **"Contraseñas de aplicaciones"** (puede estar en la sección "Cómo inicias sesión en Google").
   - Si no aparece, ve directamente a: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. En el selector "Seleccionar aplicación", elige **"Otra (nombre personalizado)"** y escribe `SEÑAL Backend`.
5. Haz clic en **Generar**.
6. Google muestra una contraseña de 16 caracteres (sin espacios). Cópiala inmediatamente.

### Variables de entorno

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=tu-cuenta@gmail.com
SMTP_PASS=abcd efgh ijkl mnop   # la contraseña de 16 caracteres (sin espacios)
SMTP_FROM=SEÑAL <tu-cuenta@gmail.com>
```

> Nota: `SMTP_PORT=465` usa SSL implícito. También funciona con `SMTP_PORT=587` (STARTTLS), pero 465 es más directo con nodemailer.

---

## Opción B — Brevo (antes Sendinblue)

Recomendado para producción. Plan gratuito incluye 300 emails/día.

### Pasos

1. Crea una cuenta en [https://www.brevo.com](https://www.brevo.com).
2. Ve a **"Configuración" > "Claves API y SMTP"** en el menú de tu perfil.
3. En la pestaña **"SMTP"**, haz clic en **"Generar una nueva contraseña SMTP"**.
4. Copia el login SMTP (tu email de Brevo) y la contraseña generada.
5. (Opcional pero recomendado) Valida tu dominio de envío en **"Remitentes, dominios y IPs dedicadas" > "Dominios"** para mejorar la entregabilidad.

### Variables de entorno

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=465
SMTP_USER=tu-email@brevo.com
SMTP_PASS=xsmtpsib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SMTP_FROM=SEÑAL <noreply@tu-dominio.com>
```

---

## Opción C — SendGrid

Plan gratuito incluye 100 emails/día.

### Pasos

1. Crea una cuenta en [https://sendgrid.com](https://sendgrid.com).
2. Ve a **"Settings" > "API Keys"** y haz clic en **"Create API Key"**.
3. Nombre: `senal-backend`. Permiso: **"Restricted Access" > "Mail Send"** (solo lo necesario).
4. Copia la API key generada (empieza con `SG.`).
5. Valida tu dominio o email remitente en **"Settings" > "Sender Authentication"**.

### Variables de entorno

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=465
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SMTP_FROM=SEÑAL <noreply@tu-dominio.com>
```

> El `SMTP_USER` es literalmente la cadena `apikey` (así funciona SendGrid con SMTP).

---

## Prueba rápida desde la terminal

Una vez configuradas las variables, puedes verificar la conexión SMTP sin necesidad de correr el backend completo.

Instala `swaks` si no lo tienes:
```bash
# macOS
brew install swaks

# Ubuntu/Debian
sudo apt install swaks
```

Prueba el envío:
```bash
swaks \
  --to destinatario@ejemplo.com \
  --from noreply@tu-dominio.com \
  --server smtp.gmail.com \
  --port 465 \
  --tls \
  --auth LOGIN \
  --auth-user tu-cuenta@gmail.com \
  --auth-password "tu-contraseña-de-app"
```

Si el email llega, la configuración está correcta.

---

## Solución de problemas frecuentes

| Problema | Causa probable | Solución |
|---|---|---|
| `Error: Invalid login: 535-5.7.8 Username and Password not accepted` | Contraseña incorrecta o no es contraseña de app | Generar nueva contraseña de aplicación en Google (paso 6) |
| `Error: connect ETIMEDOUT` | El puerto está bloqueado por el firewall del servidor | Cambiar a `SMTP_PORT=587` o verificar reglas de red |
| `Error: self signed certificate` | Usando `localhost` con cert local | En desarrollo, este warning es normal; no afecta el envío |
| Los emails llegan a spam | Dominio de envío no validado | Validar dominio en Brevo/SendGrid; agregar registros SPF y DKIM en el DNS |
| `535 Authentication credentials invalid` (Brevo) | La contraseña SMTP expiró o fue revocada | Regenerar en Brevo > SMTP > Contraseña |
