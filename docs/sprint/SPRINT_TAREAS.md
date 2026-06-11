# SEÑAL — Sprint de Funcionalidades: Instrucciones

> **Proyecto:** SEÑAL (Kairos DLS Group S.A.S.)
> **Stack real:** DOS repos separados (NO monorepo): `señal-front` (React + Vite + Tailwind) y `señal-back` (NestJS + Prisma + PostgreSQL + Redis).
> **Audiencia del perfil operario:** trabajadores de campo (construcción, hidrocarburos, minería). Muchos con baja alfabetización digital, trabajan con guantes, sol, polvo. La UX debe ser táctil, visual, sin fricción.
> **Nota legal:** Para todo lo relacionado con firma electrónica, `FIRMA_ELECTRONICA.md` (en esta misma carpeta) es la fuente de verdad; léelo antes de implementar cualquier cosa relacionada con firmas.
> **IMPORTANTE:** Lee también `DECISIONES.md` en esta carpeta: contiene las decisiones confirmadas por el product owner que MODIFICAN partes de este documento.

---

## ORDEN DE EJECUCIÓN OBLIGATORIO

```
1. ARQUITECTURA DE SOFTWARE
2. ARQUITECTURA DE DATOS / BASE DE DATOS
3. BACKEND
4. UX/UI & FRONTEND
```

---

## BLOQUE 1 — ARQUITECTURA DE SOFTWARE

### 1.1 Revisión y actualización del mapa de módulos

Antes de tocar código, genera o actualiza un archivo `docs/architecture/module-map.md` que refleje todos los módulos nuevos que se van a agregar en este sprint:

- `notifications` (alertas y notificaciones en app)
- `admin-notifications` (creación y envío desde panel admin)
- `auth-oauth` (OAuth Google + Microsoft para administradores)
- `electronic-signature` (firma electrónica, firmantes externos)
- `magic-link` (primer acceso y envío desde app)
- `superadmin` (rol Kairos para parametrización y asignación de magic link)
- `admin-management` (creación de administradores desde panel)
- `plan-limits` (límites de usuarios y sedes según plan contratado)
- `form-approval-flow` (lógica de aprobación/rechazo/revisión de formularios)
- `site-selection-ux` (nueva UX de selección de obra para operario)
- `loading-feedback` (estado "Verificando información" global)
- `operator-navbar` (navbar del operario con hora de entrada/salida en primer lugar)

### 1.2 Definir contratos de módulo

Para cada módulo nuevo, define:
- Responsabilidad única
- Dependencias de otros módulos
- Eventos que emite / eventos que consume (usando Redis pub/sub)
- No implementes nada aún; solo documenta en `docs/architecture/contracts/[modulo].md`

### 1.3 Estrategia de feature flags

Implementa un sistema mínimo de feature flags en Redis (`feature:[nombre_flag]`) para poder activar/desactivar en producción: `oauth_google`, `oauth_microsoft`, `electronic_signature`, `magic_link`, `superadmin_panel`. Documenta en `docs/architecture/feature-flags.md`.

---

## BLOQUE 2 — ARQUITECTURA DE DATOS / BASE DE DATOS

> Usa Prisma. Cada cambio de esquema termina con su migración nombrada descriptivamente. Nunca uses `--force` en migraciones. Si hay datos existentes que pueden romperse, escribe el script de seed/migración de datos antes de la migración de esquema.
> **OJO:** el esquema real usa `snake_case` y el modelo se llama `Organization` (no `Company`). Adaptar todos los modelos de este bloque a las convenciones existentes y a `DECISIONES.md`.

### 2.1 Modelo: Notificaciones

```prisma
model Notification {
  id          String             @id @default(cuid())
  userId      String
  user        User               @relation(fields: [userId], references: [id])
  type        NotificationType
  title       String
  body        String
  read        Boolean            @default(false)
  readAt      DateTime?
  deepLink    String?            // ruta interna a la que lleva al hacer tap
  createdAt   DateTime           @default(now())
  // Si fue creada desde panel admin:
  createdByAdminId String?
  createdByAdmin   User?         @relation("AdminCreatedNotifications", fields: [createdByAdminId], references: [id])
}

enum NotificationType {
  FORM_SUBMITTED
  FORM_APPROVED
  FORM_REJECTED
  FORM_PENDING_SIGNATURE
  MAGIC_LINK_SENT
  SYSTEM_ALERT
  CUSTOM_ADMIN // creada manualmente por admin
}
```

Migración: `add_notifications_model`

### 2.2 Modelo: OAuth y autenticación

Agrega al modelo `User` (adaptado: ver DECISIONES.md — admins solo OAuth, sin password):
```prisma
  email           String?        @unique  // obligatorio a nivel de servicio para ADMIN/SUPER_ADMIN
  oauthProvider   OAuthProvider?
  oauthProviderId String?        // ID externo del proveedor
  oauthAccessToken  String?      // Cifrado en reposo (AES-256)
  oauthRefreshToken String?      // Cifrado en reposo (AES-256)
  lastOAuthSync   DateTime?

enum OAuthProvider {
  GOOGLE
  MICROSOFT
}
```

Restricción: `oauthProvider` solo aplica a usuarios con rol `ADMIN` o `SUPER_ADMIN`. Validar a nivel de servicio (y `@@check` si es viable).

Migración: `add_oauth_fields_to_user`

### 2.3 Modelo: Firma electrónica

> **`FIRMA_ELECTRONICA.md` es la fuente de verdad para este modelo.** El esquema de referencia original del sprint (SignatureRequest con email) fue DESCARTADO en favor del flujo WhatsApp + cédula + foto cédula + selfie de FIRMA_ELECTRONICA.md. Modelar: `firmantes_externos`, `firma_tokens`, `registros_firma`, `logs_lectura` (ver sección 10 de ese documento), integrados con `FormSubmission` existente.

Requisitos transversales que sí aplican:
- Estados de solicitud de firma: PENDING / SIGNED / REJECTED / EXPIRED, más estados de link: enviado/visto/firmado.
- Evidencias: IP, user agent, geolocalización, tiempo de lectura por sección, trazo (vectores + imagen base64), hash SHA-256 del documento canónico.
- Trigger de auto-aprobación tras cada firma.

Migración: `add_electronic_signature_module`

### 2.4 Modelo: Magic Link

```prisma
model MagicLinkToken {
  id          String    @id @default(cuid())
  token       String    @unique @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  purpose     MagicLinkPurpose
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime  @default(now())
  createdBySuperAdmin Boolean @default(false)
}

enum MagicLinkPurpose {
  FIRST_ACCESS_ADMIN       // primer acceso del gerente/admin
  ADMIN_INVITE             // invitación a nuevo administrador
}
```

> Nota: el propósito EXTERNAL_SIGNER del documento original se elimina — los firmantes externos usan `firma_tokens` del módulo de firma (FIRMA_ELECTRONICA.md), no magic links.

Migración: `add_magic_link_model`

### 2.5 Modelo: SuperAdmin y parametrización de empresa

> Adaptado: el rol `SUPER_ADMIN` YA EXISTE y se mantiene tal cual (login con cédula + PIN/biometría). Solo se agrega la parametrización por organización:

```prisma
model OrgConfig {
  id                  String   @id @default(cuid())
  org_id              String   @unique
  organization        Organization @relation(fields: [org_id], references: [id])
  max_users           Int      // límite según plan
  max_sites           Int      // límite de sedes (work_locations) según plan
  plan                PlanTier
  display_name        String
  logo_url            String?
  primary_color       String?  // para white-label futuro
  updated_at          DateTime @updatedAt
  updated_by_super_admin_id String?
}

enum PlanTier {
  STARTER
  PROFESSIONAL
  ENTERPRISE
}
```

Migración: `add_org_config_and_plan_limits`

### 2.6 Listas maestras (dropdowns sin campo vacío)

> Adaptado según DECISIONES.md: integrar con lo existente. `Department` ya existe por organización → extenderlo para soportar registros globales (org_id null, seedeados por Kairos). Crear `MasterPosition` (cargos — reemplaza el `job_title` de texto libre) y `MasterRole` (rol operativo: Supervisor, Inspector SST... — distinto del UserRole de sistema). Ambos con patrón global/por-org y soft delete (`active`).

Crea el seed en `prisma/seed/master-lists.ts` con valores por defecto para sector construcción/hidrocarburos:

**Roles operativos sugeridos (seed):** Supervisor, Operario de Campo, Inspector SST, Residente de Obra, Director de Proyecto, Coordinador, Auxiliar Administrativo, Técnico

**Cargos sugeridos (seed):** Soldador, Electricista, Operador de Maquinaria, Topógrafo, Albañil, Plomero, Pintor, Ayudante General, Conductor, Mecánico

**Departamentos sugeridos (seed):** Operaciones, SST, Recursos Humanos, Administración, Logística, Mantenimiento, Proyectos

Migración: `add_master_lists_for_dropdowns`

### 2.7 Ajuste al modelo de aprobación de formularios

El enum `SubmissionStatus` existente (DRAFT, SUBMITTED, APPROVED, REJECTED) debe quedar:

```prisma
enum SubmissionStatus {
  DRAFT               // en borrador por el operario
  SUBMITTED           // enviado, esperando flujo de firmas
  PENDING_SIGNATURES  // en revisión: flujo de firmas incompleto (visible en panel admin como "En revisión")
  APPROVED            // aprobado automáticamente: todos los campos + firmas completas
  REJECTED            // rechazado manualmente por admin
}
```

Agrega campos a `FormSubmission`:
```prisma
  auto_approved_at     DateTime?    // cuándo se aprobó automáticamente
  rejected_at          DateTime?
  rejected_by_admin_id String?
  rejection_reason     String?
```

Migración: `update_form_submission_status_enum`

---

## BLOQUE 3 — BACKEND

> Todos los endpoints usan guards de autenticación JWT existentes. Agrega guards adicionales por rol donde se indique. Usa logging para auditoría. Toda operación sensible (firma, magic link, OAuth) debe quedar en log de auditoría.

### 3.1 Módulo: Notificaciones (`NotificationsModule`)

**Servicio `NotificationsService`:**
- `create(dto)` → crea notificación, emite evento `notification.created` vía Redis pub/sub
- `findAllForUser(userId, { unreadOnly?, page?, limit? })` → paginado
- `markAsRead(id, userId)` → valida ownership
- `markAllAsRead(userId)`
- `createBulkByAdmin(adminId, dto)` → envía a lista de usuarios o a todos los de una obra

**Controller `NotificationsController`:**
- `GET /notifications` — para el usuario autenticado
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`
- `POST /admin/notifications` — guard `RolesGuard(ADMIN, SUPER_ADMIN)`
- `GET /admin/notifications/sent` — historial de notificaciones enviadas por admin

**WebSocket Gateway `NotificationsGateway`:**
- Conectar al room del usuario por `userId` (autenticando el JWT en el handshake)
- Emitir evento `notification` en tiempo real cuando llega un `notification.created` de Redis
- Implementar heartbeat/reconexión

### 3.2 Módulo: OAuth (`OAuthModule`)

> Solo para roles ADMIN y SUPER_ADMIN. Ver DECISIONES.md: los admins entran SOLO con OAuth (sin password). La activación de cuenta vía magic link vincula la cuenta Google/Microsoft al usuario admin.

**Estrategias:**
- `GoogleAdminStrategy` — valida que el email pertenezca a un `User` existente con rol ADMIN/SUPER_ADMIN antes de completar el login. No permite registro automático vía OAuth.
- `MicrosoftAdminStrategy` — igual que Google.

**Endpoints:**
- `GET /auth/google` → redirect al consentimiento Google
- `GET /auth/google/callback` → callback, emite JWT igual que el login normal
- `GET /auth/microsoft` → redirect consentimiento Microsoft
- `GET /auth/microsoft/callback` → callback
- En ambos callbacks: registrar `oauth_provider`, `oauth_provider_id`, `last_oauth_sync` en el usuario

**Seguridad:**
- Almacenar tokens OAuth cifrados con AES-256 usando `ENCRYPTION_KEY` del `.env`
- PKCE obligatorio en ambos flujos
- State parameter anti-CSRF
- Error claro si la cuenta no está registrada: "Esta cuenta no está registrada como administrador en SEÑAL."

### 3.3 Módulo: Firma Electrónica (`ElectronicSignatureModule`)

> **LEE `FIRMA_ELECTRONICA.md` ANTES DE IMPLEMENTAR. Es la fuente de verdad y reemplaza el diseño por email del sprint original.**

**Servicio `SignatureService`:**
- Gestión de firmantes externos por obra (catálogo reutilizable): nombre, cédula, celular
- Generación de `firma_tokens` (2h, un solo uso) + estados Link enviado → Visto → Firmado
- `signDocument(...)` → valida token (si externo), registra evidencias (IP, UA, geo, log de lectura por sección, hash canónico, trazo vectorial + imagen)
- Registro de identidad de externos primera vez: foto cédula + selfie → Cloudinary privado (authenticated + signed URLs)
- `getSignatureStatus(formSubmissionId)` → estado de cada firmante
- `verifyDocumentIntegrity(formSubmissionId)` → recalcula SHA-256 y compara
- Firma de usuario interno: log de lectura por pregunta/campo según modo Juego/Lite, trazo, geo
- Modo de activación estricto/flexible configurable por tipo de permiso (FormTemplate)

**Trigger de auto-aprobación:** después de cada firma exitosa, llamar a `FormApprovalService.checkAutoApproval(formSubmissionId)`.

### 3.4 Módulo: Magic Link (`MagicLinkModule`)

**Servicio `MagicLinkService`:**
- `generateFirstAdminLink(targetUserId, createdBySuperAdminId)` → solo SUPER_ADMIN. Token expira en 72h, envía email.
- `generateAdminInviteLink(targetUserId, createdByAdminId)` → ADMIN o SUPER_ADMIN. Expira en 48h.
- `validateAndConsume(token)` → valida, verifica expiración, marca como usado (idempotente si ya fue usado)
- `resendLink(tokenId, requestedByAdminId)` → invalida el anterior, genera uno nuevo

**Endpoints:**
- `POST /superadmin/magic-link/first-admin` — guard SUPER_ADMIN
- `POST /admin/magic-link/invite` — guard ADMIN, SUPER_ADMIN
- `POST /admin/magic-link/resend/:tokenId`
- `GET /auth/magic-link?token=xxx` — público, valida el token y deja al usuario en la pantalla de activación (donde vincula su cuenta Google/Microsoft)

**Emails:** usar nodemailer existente. Template específico para cada `purpose`.

### 3.5 Módulo: SuperAdmin (extensión del panel existente)

> El rol SUPER_ADMIN ya existe con su panel `/super`. NO migrar ni cambiar su login. Solo agregar:

**Endpoints (todos guard SUPER_ADMIN):**
- `GET /superadmin/organizations` — lista con plan, usuarios activos/máximo, sedes/máximo
- `GET /superadmin/organizations/:id` — detalle: cuántos usuarios, cuántas sedes, plan actual
- `PATCH /superadmin/organizations/:id/config` — actualizar OrgConfig (nombre, plan, max_users, max_sites, logo, color)
- `POST /superadmin/magic-link/first-admin` — asignar magic link al primer admin de una empresa
- `GET /superadmin/organizations/:id/usage` — `{ currentUsers, maxUsers, currentSites, maxSites, plan }`

### 3.6 Módulo: Gestión de Administradores (`AdminManagementModule`)

- `POST /admin/administrators` — crear nuevo administrador (nombre, email). Genera magic link de invitación automáticamente. Valida contra `OrgConfig.max_users`.
- `GET /admin/administrators` — lista administradores de la organización
- `PATCH /admin/administrators/:id/deactivate`
- `PATCH /admin/administrators/:id/reactivate`

**Validación de límites de plan:** crear `PlanLimitsGuard` que antes de crear usuario o sede consulta `OrgConfig` y lanza `ForbiddenException` con mensaje claro si se superan los límites.

### 3.7 Módulo: Listas Maestras (`MasterListsModule`)

**Endpoints:**
- `GET /master/roles` — globales + de la org del usuario, orden alfabético
- `GET /master/positions`
- `GET /master/departments` — (integrado con Department existente)
- `POST /admin/master/roles` — crear personalizado para la org (guard ADMIN)
- `POST /admin/master/positions`
- `POST /admin/master/departments`
- `PATCH /admin/master/:type/:id` — editar
- `PATCH /admin/master/:type/:id/deactivate` — soft delete
- Endpoint para "sugerir valor" (operario no encuentra su cargo → solicitud que el admin aprueba)

### 3.8 Lógica de Aprobación de Formularios (`FormApprovalService`)

**`checkAutoApproval(formSubmissionId)`:**
1. Obtener el `FormSubmission` con valores y solicitudes de firma
2. Verificar campos obligatorios del template llenos (ningún valor null/vacío)
3. Verificar que todas las firmas requeridas estén completadas
4. Si ambas → status `APPROVED`, registrar `auto_approved_at`, notificar al operario y a los admins de la org
5. Si no → si hay al menos una firma pendiente → `PENDING_SIGNATURES`; si aún no se ha enviado → `SUBMITTED`

**Rechazo (solo ADMIN):**
- `PATCH /admin/forms/:id/reject` — body: `{ reason: string }` (mín 10 chars). Status → `REJECTED`, registra `rejected_at`, `rejected_by_admin_id`, `rejection_reason`. Notificación al operario con el motivo.

**Listado para admin:** `GET /admin/forms?status=...`. El admin ve `PENDING_SIGNATURES` como "En revisión". Puede rechazar desde `PENDING_SIGNATURES` o `SUBMITTED`. **NO existe botón ni endpoint de aprobar manual: la aprobación es solo automática** (eliminar el approve del `PATCH /submissions/:id/status` existente).

### 3.9 Estado "Verificando información" — Feedback global

- `GET /status/user-context` — retorna en <300ms el contexto mínimo del usuario autenticado (nombre, organización, obra asignada, rol). Cache Redis TTL 60s, consultas en `Promise.all`.

---

## BLOQUE 4 — UX/UI & FRONTEND

> **Perfil operario:** personas de campo, trabajo físico, sol, polvo, guantes. Botones grandes (mínimo 48px de altura), iconografía clara, texto corto, feedback inmediato. El operario NO debe necesitar leer para navegar. Móvil first (375px).
> **Perfil admin:** escritorio o tablet en oficina. UX más densa es aceptable.

### 4.1 Componente: Centro de Notificaciones (ambos perfiles)

**Campanita en navbar:**
- Badge rojo con contador de no leídas (máx "99+")
- Al hacer tap/click, abre un panel lateral (drawer) o dropdown
- Cada notificación: icono por tipo, título, body truncado, tiempo relativo ("hace 5 min"), indicador de no leída (punto azul)
- Tap en notificación → marca como leída + navega al `deepLink` si existe
- Botón "Marcar todas como leídas"
- Scroll infinito o paginación dentro del panel

**Operario:** Drawer de pantalla completa. Iconos muy grandes. Tap en cualquier parte de la tarjeta navega.
**Admin:** Dropdown anclado a la campanita, 400px de ancho, scroll interno.
**WebSocket:** conectar al gateway al hacer login. Al llegar evento `notification`: actualizar contador + toast en esquina inferior.

### 4.2 Panel Admin: Creación y envío de notificaciones

Nueva sección "Comunicaciones":
- Formulario: Título (requerido, máx 60 chars), Mensaje (requerido, máx 200 chars), Destinatarios (todos / por obra / usuarios específicos — multiselect)
- Preview en tiempo real
- Botón "Enviar" con confirmación modal
- Tabla de historial: fecha, título, destinatarios, quién la creó

### 4.3 Login: Ingreso de administradores con OAuth

> Adaptado según DECISIONES.md:
- En la pantalla de login, debajo del botón "Ingresar", agregar botón **"Ingreso administradores"**
- Al tocarlo, el campo de número de identificación se reemplaza por:
  - Botón "Continuar con Google" (logo oficial, estilo outlined blanco)
  - Botón "Continuar con Microsoft" (logo oficial, estilo outlined blanco)
- Ambos botones del mismo ancho, centrados; opción de volver al ingreso de operarios
- Si la cuenta no está registrada: "Esta cuenta no está registrada como administrador en SEÑAL."
- Los operarios NO ven estos botones en su flujo normal

### 4.4 Firma Electrónica — Interfaces

> **LEE `FIRMA_ELECTRONICA.md` ANTES DE IMPLEMENTAR.**

**Pantalla de firma para OPERARIO:**
- Vista de pantalla completa del documento (scroll)
- Contador de tiempo de lectura visible: "Leyendo documento: 0:45"
- Botón de firma deshabilitado hasta cumplir tiempo mínimo (configurable, default 30s)
- Canvas de firma a pantalla completa: "Firma aquí con tu dedo" con icono
- Botón "Limpiar" y "Confirmar firma"
- Antes de confirmar: modal con resumen de evidencias (ubicación, hora, dispositivo)
- Loading: "Registrando tu firma..."

**Pantalla de firmante EXTERNO (`/firma/:token`, ruta pública):**
- Pantalla de bienvenida con nombre del documento y quién solicita la firma
- Primera vez: captura foto de cédula + selfie
- Vista del permiso sección por sección con botón "Continuar", tiempo mínimo por sección
- Canvas de trazo al final; estados Link enviado → Visto → Firmado
- Token usado/expirado: pantalla de error clara con instrucciones

**Panel ADMIN — Gestión de firmantes:**
- En la vista de un formulario enviado, sección "Firmantes requeridos"
- Lista: nombre, tipo (interno/externo), estado, fecha de firma
- Botón "Agregar firmante externo": nombre, cédula, celular
- Botón "Reenviar solicitud de firma" por firmante pendiente
- Chips: verde "Firmado ✓", naranja "Pendiente", rojo "Rechazado"

**Perfil OPERARIO — Agregar firmante externo:**
- En el detalle de un formulario propio en `SUBMITTED` o `PENDING_SIGNATURES`
- Sección "¿Alguien más debe firmar este documento?"
- Botón grande "Agregar firmante" → bottomsheet con nombre, cédula, celular
- Por cada firmante: botón que abre WhatsApp (wa.me) con mensaje + link precompletado → estado "Link enviado"
- Lista de firmantes con su estado

### 4.5 Magic Link — Pantallas

**Pantalla de activación (primer acceso admin / invitación):**
- Logo de SEÑAL + nombre de la empresa
- "¡Bienvenido/a, [nombre]! Tu cuenta de administrador está lista." (o "Has sido invitado/a como administrador de [empresa] en SEÑAL")
- CTA: vincular cuenta con "Continuar con Google" / "Continuar con Microsoft" (NO se crea contraseña — ver DECISIONES.md)
- Tras activar: redirect al panel admin

### 4.6 Panel SuperAdmin (extensión del panel `/super` existente)

**Dashboard:**
- Lista de organizaciones: nombre, plan, usuarios activos/máximo, sedes activas/máximo, fecha de registro
- Barra de progreso visual para uso de usuarios y sedes
- Badge de plan: Starter / Professional / Enterprise

**Vista de organización:**
- Editar OrgConfig: nombre, plan, max_users, max_sites, color primario, logo
- Sección "Magic Link de primer acceso": selector de usuario admin de esa org, botón "Generar y enviar magic link"
- Historial de magic links generados

### 4.7 Listas Maestras — Dropdowns sin campo vacío

En todos los formularios del sistema:
- Reemplazar inputs de texto libre de roles, cargos, departamentos por `<Select>`/`<Combobox>` con búsqueda
- Si la lista está cargando: skeleton, nunca campo en blanco ni "Selecciona..." vacío
- Botón "No encuentro mi [cargo/rol/departamento]" → crea solicitud que el admin aprueba y agrega a la lista de la org

### 4.8 Vista de Formularios en Panel Admin — Estados diferenciados

- **"Aprobado"** (auto): badge verde con checkmark + icono automático, tooltip "Aprobado automáticamente: todos los campos y firmas completos"
- **"En revisión"** (PENDING_SIGNATURES): badge naranja, tooltip "Flujo de firmas incompleto"
- **"Rechazado"**: badge rojo con motivo visible en hover/tap
- **"Enviado"**: badge azul

Detalle:
- `PENDING_SIGNATURES` o `SUBMITTED`: botón rojo "Rechazar" → modal con motivo (requerido, mín 10 chars)
- `APPROVED`: sin botones de acción
- `REJECTED`: banner con motivo, sin acciones
- **No existe botón "Aprobar"**

### 4.9 UX de Selección de Obra — Perfil OPERARIO ⭐

> La pantalla más importante del flujo del operario. Visual, táctil, imposible de confundir.

- Grid de tarjetas grandes (2 columnas en móvil, 3 en tablet)
- Cada tarjeta: foto de la obra (o gradiente por tipo de proyecto), nombre en grande bold blanco, ciudad, indicador "Activa" (punto verde pulsante) o "Inactiva", badge "Ya ingresaste hoy ✓" si tiene check-in
- Buscador arriba: input grande con lupa, placeholder "¿En qué obra estás hoy?"
- Si solo hay una obra: pantalla completa con botón grande de confirmación
- Animación de entrada: stagger desde abajo (Framer Motion)
- Al seleccionar: feedback háptico (si disponible) + animación de selección
- Sin obras: ilustración amigable + "Habla con tu administrador para que te asigne a una obra"
- Cargando: skeleton de tarjetas (nunca spinner solo)

### 4.10 Estado "Verificando información" — `<VerifyingOverlay />`

1. **Login / carga de sesión:** overlay pantalla completa: logo SEÑAL centrado, "Verificando tu información...", barra de progreso animada (no spinner). Máximo 2s; si tarda >4s: "Esto está tardando más de lo habitual..."
2. **Envío de formulario o firma:** overlay parcial: icono escudo/checkmark animado, "Registrando tu información de forma segura..."

**Operario:** pantalla completa, tipografía grande. **Admin:** solo área de contenido, no el sidebar.

### 4.11 Navbar del Operario — Jornada EN PRIMER LUGAR

**Posición 1 (primera tab):** Reloj / Jornada
- Sin entrada marcada: label "Entrada" con punto rojo pulsante
- Entrada sin salida: label "Salida" + "Desde 08:32" + punto verde
- Ambas marcadas: ✓ con las horas del día
- Tap → pantalla de registro de entrada/salida con botón grande

**Las demás tabs:** mismo orden actual, desplazadas una posición.

**Home del operario:** tarjeta de jornada prominente arriba:
- Sin entrada: botón grande verde "Registrar entrada" con hora actual en tiempo real
- Con entrada: info de jornada activa + botón rojo "Registrar salida"

---

## NOTAS FINALES

1. **`FIRMA_ELECTRONICA.md`** tiene prioridad sobre este documento en caso de conflicto.
2. **Tests:** tests unitarios mínimos por módulo backend. Para firma y magic link: tests de integración obligatorios.
3. **Variables de entorno:** agregar a `.env.example`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MAGIC_LINK_SECRET`, `ENCRYPTION_KEY`, `MAGIC_LINK_BASE_URL`, SMTP de nodemailer. Todo debe funcionar con solo llenar el `.env`.
4. **Migraciones:** en el orden del Bloque 2, nunca en paralelo.
5. **Móvil first:** perfil operario a 375px primero.
6. **No romper lo existente:** `FormTemplate`, `FormField`, `FormSubmission`, `FormSubmissionValue` solo se extienden.
