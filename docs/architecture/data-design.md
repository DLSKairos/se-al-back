# SEÑAL — Diseño de Datos: Sprint de Funcionalidades
**Arquitecto de datos:** Claude (Sonnet 4.6)
**Fecha:** 2026-06-10
**Prioridad de fuentes:** DECISIONES.md > FIRMA_ELECTRONICA.md > SPRINT_TAREAS.md

---

## Índice

1. [Convenciones del esquema](#1-convenciones-del-esquema)
2. [Modelo: Notificaciones](#2-modelo-notificaciones)
3. [Modelo: OAuth en User](#3-modelo-oauth-en-user)
4. [Modelo: Firma Electrónica](#4-modelo-firma-electrónica)
5. [Modelo: Magic Link](#5-modelo-magic-link)
6. [Modelo: OrgConfig y Plan](#6-modelo-orgconfig-y-plan)
7. [Modelo: Listas Maestras](#7-modelo-listas-maestras)
8. [Modelo: Ajuste FormSubmission](#8-modelo-ajuste-formsubmission)
9. [Orden de migraciones](#9-orden-de-migraciones)
10. [Riesgos e integridad](#10-riesgos-e-integridad)
11. [Diagrama ER](#11-diagrama-er)

---

## 1. Convenciones del esquema

El schema existente establece las siguientes convenciones, que se aplican a todos los modelos nuevos:

| Convención | Ejemplo |
|---|---|
| Identificadores | `@id @default(cuid())` |
| Nombres de campo | `snake_case` |
| Mapeo de tabla | `@@map("nombre_en_plural_snake_case")` |
| Timestamps de creación | `created_at DateTime @default(now())` |
| Timestamps de actualización | `updated_at DateTime @updatedAt` |
| Campos opcionales | `String?` (nullable) |
| Textos largos | `@db.Text` |
| Multi-tenancy | `org_id` siempre presente y siempre indexado |
| Relaciones | nombre descriptivo en camelCase para la relación Prisma |

Los nombres de modelos Prisma se escriben en PascalCase (ej. `ExternalSigner`), los campos en snake_case. Los enums en SCREAMING_SNAKE_CASE.

---

## 2. Modelo: Notificaciones

### Decisión de diseño

Se crea un modelo `Notification` separado de `FormNotification` existente. `FormNotification` gestiona reglas de notificación de plantillas (qué enviar ante qué trigger). El nuevo modelo `Notification` es el buzón de mensajes recibidos por cada usuario, análogo a las notificaciones de una app móvil. Son entidades conceptualmente distintas y conviven sin conflicto.

El campo `deep_link` almacena una ruta interna relativa (ej. `/admin/submissions/xyz`) que el frontend usa para navegar al hacer tap.

La relación `created_by_admin_id` es opcional: las notificaciones automáticas del sistema (FORM_APPROVED, etc.) no tienen admin creador; solo las de tipo `CUSTOM_ADMIN` lo tienen obligatoriamente a nivel de servicio.

```prisma
// ─── NOTIFICACIONES ───────────────────────────────────

model Notification {
  id                   String           @id @default(cuid())
  user_id              String
  type                 NotificationType
  title                String
  body                 String           @db.Text
  read                 Boolean          @default(false)
  read_at              DateTime?
  deep_link            String?
  created_at           DateTime         @default(now())
  created_by_admin_id  String?

  user              User  @relation("UserNotifications", fields: [user_id], references: [id], onDelete: Cascade)
  created_by_admin  User? @relation("AdminCreatedNotifications", fields: [created_by_admin_id], references: [id], onDelete: SetNull)

  @@index([user_id, read, created_at(sort: Desc)])
  @@index([created_by_admin_id])
  @@map("notifications")
}

enum NotificationType {
  FORM_SUBMITTED
  FORM_APPROVED
  FORM_REJECTED
  FORM_PENDING_SIGNATURE
  MAGIC_LINK_SENT
  SYSTEM_ALERT
  CUSTOM_ADMIN
}
```

**Relaciones inversas a agregar en `User`:**
```prisma
  notifications          Notification[] @relation("UserNotifications")
  sent_notifications     Notification[] @relation("AdminCreatedNotifications")
```

**Índice justificado:** `[user_id, read, created_at(sort: Desc)]` es el índice más importante del sistema: cada vez que el usuario abre la campanita, la consulta filtra por `user_id`, ordena por `created_at` DESC y opcionalmente filtra `read = false` para el contador de no leídas. Sin este índice, la tabla crece linealmente con cada usuario activo y cada query hace seq scan.

**Política de retención:** las notificaciones no tienen hard delete automático. Se recomienda un job de limpieza periódica (fuera del alcance de este sprint) que archive notificaciones leídas con más de 90 días.

---

## 3. Modelo: OAuth en User

### Decisión de diseño

Los tokens OAuth se almacenan como `String?` en la base de datos. El cifrado AES-256 ocurre a nivel de servicio (`OAuthService`) antes de escribir y después de leer: la BD nunca ve el token en claro. Esto es correcto porque PostgreSQL no ofrece cifrado de columna individualizado en el tier de hosting habitual; el cifrado a nivel de aplicación con clave rotable es más flexible.

El campo `email` es `@unique` a nivel de schema pero `nullable`. La restricción "obligatorio para ADMIN" se aplica solo a nivel de servicio (en el guard/DTO), no con un `@@check` de Prisma porque Prisma 6 no soporta `@@check` con lógica condicional cross-field en PostgreSQL de forma estable.

`oauth_provider_id` es el sub/oid que devuelve el proveedor (inmutable, identificador del usuario en Google/Microsoft). Se indexa junto con `oauth_provider` para lookups de callback OAuth eficientes.

```prisma
// Campos nuevos en el modelo User existente:

  email                String?        @unique
  oauth_provider       OAuthProvider?
  oauth_provider_id    String?
  oauth_access_token   String?        @db.Text  // cifrado AES-256 en servicio
  oauth_refresh_token  String?        @db.Text  // cifrado AES-256 en servicio
  last_oauth_sync      DateTime?

  // Agregar al final del bloque de relaciones de User:
  notifications          Notification[] @relation("UserNotifications")
  sent_notifications     Notification[] @relation("AdminCreatedNotifications")
  magic_link_tokens      MagicLinkToken[] @relation("UserMagicLinks")
  rejected_submissions   FormSubmission[] @relation("RejectedByAdmin")

// Índice a agregar en User:
  @@index([oauth_provider, oauth_provider_id])

enum OAuthProvider {
  GOOGLE
  MICROSOFT
}
```

**Nota de seguridad:** `oauth_access_token` y `oauth_refresh_token` se mapean con `@db.Text` porque los tokens JWT de Microsoft pueden superar los 255 caracteres que permite `VARCHAR` por defecto.

---

## 4. Modelo: Firma Electrónica

### 4.1 Decisión sobre FormSignature existente

`FormSignature` almacena firma simple: nombre, rol, documento, URL de imagen y timestamp. Es el sistema legado usado por los blueprints actuales (el seed incluye campos `FieldType.SIGNATURE` que graban en `FormSubmissionValue.value_file`).

**Decisión: mantener `FormSignature` tal cual, sin modificaciones.** El nuevo módulo de firma electrónica es un sistema paralelo más robusto. Conviven en la misma submission. Justificación:

1. Los formularios existentes en producción (y el seed demo) usan `FormSignature` y no se pueden migrar sin downtime de datos.
2. Los permisos de trabajo nuevos que requieran firma electrónica legalmente válida usarán el nuevo sistema.
3. La coexistencia es limpia: `FormSignature` tiene 0 conflictos con los nuevos modelos (no comparten campos ni constraints).
4. En una fase futura, se puede deprecar `FormSignature` cuando todos los templates migren al nuevo sistema.

**No se depreca en este sprint.**

### 4.2 Modelo ExternalSigner (catálogo por obra)

El catálogo de firmantes externos es reutilizable por obra. La cédula identifica unívocamente a una persona; no tiene sentido tener dos registros de la misma cédula en la misma obra. La unicidad `[work_location_id, identification_number]` lo garantiza.

Las claves de Cloudinary (`photo_id_key`, `selfie_key`) son los `public_id` del asset en modo `authenticated`. Las URLs firmadas se generan en tiempo de solicitud por el servicio, nunca se almacenan.

```prisma
// ─── FIRMA ELECTRÓNICA ────────────────────────────────

model ExternalSigner {
  id                    String   @id @default(cuid())
  org_id                String
  work_location_id      String
  name                  String
  identification_number String
  phone                 String
  photo_id_key          String?  // Cloudinary authenticated asset key (foto cédula)
  selfie_key            String?  // Cloudinary authenticated asset key (selfie)
  is_registered         Boolean  @default(false) // true cuando foto_id + selfie están cargados
  created_at            DateTime @default(now())
  updated_at            DateTime @updatedAt

  org           Organization      @relation(fields: [org_id], references: [id])
  work_location WorkLocation      @relation(fields: [work_location_id], references: [id])
  signature_tokens SignatureToken[]
  signature_records SignatureRecord[] @relation("ExternalSignerRecords")

  @@unique([work_location_id, identification_number])
  @@index([org_id, work_location_id])
  @@map("external_signers")
}
```

### 4.3 Modelo SignatureToken

El token es un UUID v4 almacenado en BD (no JWT firmado), por simplicidad y para poder invalidarlo directamente actualizando `used_at`. El campo `link_status` tiene tres estados progresivos: `SENT` (link generado/WhatsApp abierto), `VIEWED` (firmante abrió el link), `SIGNED` (firma completada).

`expires_at` tiene valor por defecto de 2 horas pero es configurable a nivel de creación para dejar flexibilidad futura.

```prisma
model SignatureToken {
  id                   String            @id @default(cuid())
  token                String            @unique @default(cuid())
  submission_id        String
  external_signer_id   String
  link_status          SignatureLinkStatus @default(SENT)
  expires_at           DateTime
  viewed_at            DateTime?
  used_at              DateTime?
  created_at           DateTime          @default(now())

  submission       FormSubmission  @relation(fields: [submission_id], references: [id], onDelete: Cascade)
  external_signer  ExternalSigner  @relation(fields: [external_signer_id], references: [id], onDelete: Cascade)
  signature_record SignatureRecord? @relation("TokenSignatureRecord")

  @@index([submission_id])
  @@index([token])   // lookup principal en ruta pública /firma/:token
  @@map("signature_tokens")
}

enum SignatureLinkStatus {
  SENT     // link generado, operario abrió WhatsApp
  VIEWED   // firmante externo abrió el link (token validado en backend)
  SIGNED   // firma completada
}
```

### 4.4 Modelo SignatureRecord (evidencias completas)

Este es el modelo más crítico del sprint. Almacena todas las evidencias probatorias de una firma. Se crea una fila por cada firma completada, tanto de firmantes internos (usuarios de SEÑAL) como externos.

**Decisión de esquema para evidencias JSON:**

Los campos `reading_log`, `stroke_vectors` y `geo_location` son JSONB en PostgreSQL. Se elige JSONB sobre tablas relacionales por tres razones:

1. `reading_log` puede tener decenas de entradas (una por pregunta/sección) y varía mucho según el formulario. Relacionalizarlo requeriría una tabla adicional con FK a `signature_records` que no aporta consultas ad-hoc (nadie hace `WHERE reading_log.seconds > 5`).
2. `stroke_vectors` es un array denso de puntos `{x, y, t}` — puede tener miles de entradas. Relacionalizarlo sería inmanejable.
3. El objeto canónico para el hash y la imagen base64 del trazo son atómicos: se escriben y leen completos, nunca se consultan parcialmente.

El `document_hash` es el SHA-256 del objeto canónico definido en `FIRMA_ELECTRONICA.md`. Se calcula y almacena una sola vez en el momento de la firma.

```prisma
model SignatureRecord {
  id                  String        @id @default(cuid())
  submission_id       String
  signer_type         SignerType
  // Firmante interno (nullable si es externo)
  internal_user_id    String?
  // Firmante externo (nullable si es interno)
  external_signer_id  String?
  // Token usado (solo para externos)
  signature_token_id  String?       @unique

  // Evidencias de identidad y contexto
  ip_address          String?
  user_agent          String?       @db.Text
  geo_location        Json?         // { lat: Float, lng: Float }
  webauthn_session    Boolean       @default(false) // solo internos

  // Evidencias de lectura
  reading_log         Json          // [{ section_id|field_id: String, seconds: Int }]
  min_reading_seconds Int           @default(30) // umbral configurado al momento de firma

  // Trazo manuscrito
  stroke_image_base64 String        @db.Text  // imagen PNG en base64
  stroke_vectors      Json          // [{ x: Int, y: Int, t: BigInt }]

  // Integridad
  document_hash       String        // SHA-256 del objeto canónico

  // Timestamps
  signed_at           DateTime      @default(now())

  submission      FormSubmission  @relation(fields: [submission_id], references: [id], onDelete: Restrict)
  internal_user   User?           @relation("InternalSignerRecords", fields: [internal_user_id], references: [id], onDelete: SetNull)
  external_signer ExternalSigner? @relation("ExternalSignerRecords", fields: [external_signer_id], references: [id], onDelete: SetNull)
  signature_token SignatureToken? @relation("TokenSignatureRecord", fields: [signature_token_id], references: [id], onDelete: SetNull)

  @@index([submission_id])
  @@index([internal_user_id])
  @@index([external_signer_id])
  @@map("signature_records")
}

enum SignerType {
  INTERNAL
  EXTERNAL
}
```

**Nota sobre `onDelete: Restrict` en submission:** Una submission firmada NO puede eliminarse (existe evidencia legal). Si en el futuro se requiere "eliminar" una submission firmada, debe ser un soft delete.

**Nota sobre `stroke_image_base64`:** el trazo se almacena en base64 directamente en BD para garantizar que la evidencia queda atómica con el registro. No se almacena en Cloudinary (que podría tener un outage en el momento de auditoría). El tamaño típico de una imagen PNG de trazo 400x200 es ~5-15KB en base64, manejable en PostgreSQL con `@db.Text`.

### 4.5 Modelo SignatureConfig (configuración por FormTemplate)

Configura el comportamiento de firma para cada tipo de permiso. Se relaciona con `FormTemplate`.

```prisma
model SignatureConfig {
  id                      String   @id @default(cuid())
  template_id             String   @unique
  signature_mode          SignatureMode @default(FLEXIBLE)
  min_reading_seconds     Int      @default(30)  // tiempo mínimo total antes de habilitar botón
  requires_internal_sign  Boolean  @default(true)  // el operario que llena debe firmar
  created_at              DateTime @default(now())
  updated_at              DateTime @updatedAt

  template FormTemplate @relation(fields: [template_id], references: [id], onDelete: Cascade)

  @@map("signature_configs")
}

enum SignatureMode {
  STRICT    // no se activa hasta que todos los firmantes completen
  FLEXIBLE  // se activa al crearse; firmas se recolectan durante vigencia del token
}
```

**Relación inversa a agregar en `FormTemplate`:**
```prisma
  signature_config  SignatureConfig?
```

### 4.6 Relaciones inversas adicionales

Las siguientes relaciones inversas deben agregarse en los modelos existentes:

**En `FormSubmission`:**
```prisma
  signature_tokens   SignatureToken[]
  signature_records  SignatureRecord[]
```

**En `WorkLocation`:**
```prisma
  external_signers   ExternalSigner[]
```

**En `User`:**
```prisma
  internal_signature_records  SignatureRecord[] @relation("InternalSignerRecords")
```

---

## 5. Modelo: Magic Link

### Decisión de diseño

`MagicLinkToken` tiene dos propósitos: primer acceso del gerente/admin de una empresa nueva (`FIRST_ACCESS_ADMIN`) e invitación a un administrador adicional (`ADMIN_INVITE`). Ambos llevan a la misma pantalla de activación donde el admin vincula su cuenta OAuth.

El campo `created_by_super_admin` es `Boolean` para simplificar: si `true`, fue un SUPER_ADMIN quien lo generó; si `false`, fue un ADMIN quien invitó a otro admin. El servicio puede derivar quién lo creó desde el JWT del request sin necesidad de almacenar el ID del creador (decisión de simplicidad aceptable para este sprint).

`token` es un `cuid()` por defecto, lo que garantiza unicidad y entropía suficiente para un token de acceso de uso único con TTL de 48-72h.

```prisma
// ─── MAGIC LINK ───────────────────────────────────────

model MagicLinkToken {
  id                       String           @id @default(cuid())
  token                    String           @unique @default(cuid())
  user_id                  String
  purpose                  MagicLinkPurpose
  expires_at               DateTime
  used_at                  DateTime?
  created_by_super_admin   Boolean          @default(false)
  created_at               DateTime         @default(now())

  user User @relation("UserMagicLinks", fields: [user_id], references: [id], onDelete: Cascade)

  @@index([token])         // lookup principal en GET /auth/magic-link?token=xxx
  @@index([user_id])       // historial de tokens por usuario
  @@map("magic_link_tokens")
}

enum MagicLinkPurpose {
  FIRST_ACCESS_ADMIN
  ADMIN_INVITE
}
```

**Política de unicidad:** no se pone `@@unique([user_id, purpose])` porque un admin puede tener múltiples tokens históricos (el servicio invalida el anterior generando uno nuevo via `resendLink`). El control de "solo un token activo por usuario" se hace a nivel de servicio, no en BD.

---

## 6. Modelo: OrgConfig y Plan

### Decisión de diseño

`OrgConfig` es una extensión 1:1 de `Organization`. Se crea como tabla separada (no agregando columnas a `organizations`) por dos razones:

1. Separación de responsabilidades: `Organization` es el tenant core; `OrgConfig` es parametrización comercial. Diferentes equipos/módulos los gestionan.
2. `organizations` ya existe con datos en producción. Agregar columnas `NOT NULL` sin default requeriría backfill; crear una tabla separada con FK es más seguro.

`updated_by_super_admin_id` es nullable: en la creación inicial desde seed, no hay super admin que lo actualizó.

```prisma
// ─── PLAN Y CONFIGURACIÓN DE ORG ──────────────────────

model OrgConfig {
  id                          String    @id @default(cuid())
  org_id                      String    @unique
  plan                        PlanTier  @default(STARTER)
  max_users                   Int       @default(10)
  max_sites                   Int       @default(2)
  display_name                String
  logo_url                    String?
  primary_color               String?   // hex: "#RRGGBB" para white-label futuro
  updated_at                  DateTime  @updatedAt
  updated_by_super_admin_id   String?

  org                   Organization @relation(fields: [org_id], references: [id], onDelete: Cascade)
  updated_by_super_admin User?       @relation("SuperAdminOrgConfigUpdates", fields: [updated_by_super_admin_id], references: [id], onDelete: SetNull)

  @@map("org_configs")
}

enum PlanTier {
  STARTER
  PROFESSIONAL
  ENTERPRISE
}
```

**Relaciones inversas a agregar:**

En `Organization`:
```prisma
  config OrgConfig?
```

En `User`:
```prisma
  org_config_updates OrgConfig[] @relation("SuperAdminOrgConfigUpdates")
```

**Consulta crítica para PlanLimitsGuard:**
```sql
SELECT
  oc.max_users,
  oc.max_sites,
  COUNT(DISTINCT u.id) FILTER (WHERE u.is_active = true) AS current_users,
  COUNT(DISTINCT wl.id) FILTER (WHERE wl.is_active = true) AS current_sites
FROM org_configs oc
JOIN organizations o ON o.id = oc.org_id
LEFT JOIN users u ON u.org_id = o.id
LEFT JOIN work_locations wl ON wl.org_id = o.id
WHERE oc.org_id = $1
GROUP BY oc.max_users, oc.max_sites;
```

Esta consulta debe ser < 50ms. Los índices existentes `@@index([org_id, is_active])` en `users` y `@@index([org_id, is_active])` en `work_locations` la sostienen.

---

## 7. Modelo: Listas Maestras

### 7.1 Extensión de Department

El modelo `Department` existente tiene `org_id` como campo obligatorio con FK a `organizations`. Para soportar departamentos globales (seed de Kairos, sin org), se hace `org_id` nullable y se agrega `active` para soft delete.

**Impacto sobre datos existentes:** `org_id` pasa de `String` a `String?`. En PostgreSQL, cambiar `NOT NULL` a `nullable` no requiere backfill y es seguro en los datos actuales. Los registros existentes mantienen su `org_id` sin cambios. El constraint `@@unique([org_id, name])` existente debe verificarse: en Prisma, cuando `org_id` es nullable, el unique incluye nulls — en PostgreSQL, `NULL != NULL` por lo que múltiples filas con `org_id = NULL` y el mismo nombre son permitidas. Esto es el comportamiento correcto para globals (puede haber "Operaciones" global y "Operaciones" por org sin conflicto).

El `email` en `Department` es actualmente obligatorio (`String`). Para los registros globales (org_id = null) no tiene sentido un email de departamento. Se hace nullable.

```prisma
// Department existente — campos modificados/agregados:
model Department {
  id      String  @id @default(cuid())
  org_id  String?          // era String, pasa a String? — global si null
  name    String
  email   String?          // era String, pasa a String? — no aplica para globales
  active  Boolean @default(true)  // nuevo

  org            Organization?  @relation(fields: [org_id], references: [id])  // era Organization (no nullable)
  work_locations WorkLocation[]

  @@unique([org_id, name])
  @@index([org_id, active])    // nuevo índice para queries de lista por org
  @@map("departments")
}
```

### 7.2 MasterPosition (cargos)

Reemplaza el campo de texto libre `job_title` en `User`. `job_title` se mantiene en el modelo `User` por retrocompatibilidad con datos existentes (el seed tiene "Administrador", "Operario", "Supervisora SST"). La migración de `job_title` texto libre a `MasterPosition` es gradual: los usuarios nuevos se crean con `position_id`; los existentes mantienen `job_title` hasta que un admin los actualice.

**No se hace migración automática de datos** de `job_title` a `MasterPosition` en este sprint. La razón: los valores de `job_title` actuales son texto libre heterogéneo; forzar un mapeo automático a IDs de lista maestra introduciría inconsistencias. La transición es responsabilidad del admin de cada organización.

```prisma
// ─── LISTAS MAESTRAS ─────────────────────────────────

model MasterPosition {
  id         String  @id @default(cuid())
  org_id     String?           // null = global (seed de Kairos)
  name       String
  active     Boolean @default(true)
  created_at DateTime @default(now())

  org   Organization? @relation(fields: [org_id], references: [id], onDelete: Cascade)
  users User[]        @relation("UserPosition")

  @@unique([org_id, name])
  @@index([org_id, active])
  @@map("master_positions")
}
```

**Campo nuevo en `User`:**
```prisma
  position_id  String?
  position     MasterPosition? @relation("UserPosition", fields: [position_id], references: [id], onDelete: SetNull)
```

### 7.3 MasterRole (roles operativos)

Distinto del `UserRole` del sistema (SUPER_ADMIN, ADMIN, OPERATOR). Este es el rol funcional en obra: Supervisor, Inspector SST, etc. Se usa en los permisos de trabajo para identificar quién firma en qué calidad.

```prisma
model MasterRole {
  id         String  @id @default(cuid())
  org_id     String?           // null = global
  name       String
  active     Boolean @default(true)
  created_at DateTime @default(now())

  org         Organization? @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@unique([org_id, name])
  @@index([org_id, active])
  @@map("master_roles")
}
```

### 7.4 MasterListSuggestion (sugerencias de operarios)

Cuando un operario no encuentra su cargo/rol/departamento en la lista, crea una sugerencia. El admin la aprueba o rechaza. Al aprobar, el servicio crea el registro en la lista maestra correspondiente.

`entity_type` distingue a qué lista pertenece la sugerencia para poder tratarlas todas en un mismo modelo (evita tres tablas casi idénticas).

```prisma
model MasterListSuggestion {
  id           String           @id @default(cuid())
  org_id       String
  suggested_by String           // user_id del operario
  entity_type  MasterEntityType
  value        String           // el texto propuesto
  status       SuggestionStatus @default(PENDING)
  reviewed_by  String?          // user_id del admin que revisó
  reviewed_at  DateTime?
  created_at   DateTime         @default(now())

  org          Organization @relation(fields: [org_id], references: [id])
  suggester    User         @relation("SuggestedByUser", fields: [suggested_by], references: [id])
  reviewer     User?        @relation("ReviewedByUser", fields: [reviewed_by], references: [id])

  @@index([org_id, status])
  @@index([suggested_by])
  @@map("master_list_suggestions")
}

enum MasterEntityType {
  POSITION
  ROLE
  DEPARTMENT
}

enum SuggestionStatus {
  PENDING
  APPROVED
  REJECTED
}
```

**Relaciones inversas en `User`:**
```prisma
  suggestions_made     MasterListSuggestion[] @relation("SuggestedByUser")
  suggestions_reviewed MasterListSuggestion[] @relation("ReviewedByUser")
```

**Relación inversa en `Organization`:**
```prisma
  master_positions       MasterPosition[]
  master_roles           MasterRole[]
  master_list_suggestions MasterListSuggestion[]
```

---

## 8. Modelo: Ajuste FormSubmission

### 8.1 Nuevo estado en SubmissionStatus

**Problema crítico:** en PostgreSQL, los enums son tipos de datos del sistema. Agregar un nuevo valor a un enum existente requiere `ALTER TYPE ... ADD VALUE`. Prisma 6 genera esta sentencia en la migración automáticamente, pero hay una restricción: **`ALTER TYPE ... ADD VALUE` no puede ejecutarse dentro de una transacción en PostgreSQL < 12**. El servidor de producción de SEÑAL debe ser PostgreSQL 12+. Si hay duda, el implementador debe verificar la versión antes de ejecutar.

**Adicionalmente:** el nuevo valor `PENDING_SIGNATURES` debe insertarse en un lugar lógico del enum. PostgreSQL no permite reordenar valores de enum; se agrega al final internamente, pero Prisma lo lista en el orden del schema. Esto no afecta funcionalidad.

```prisma
enum SubmissionStatus {
  DRAFT
  SUBMITTED
  PENDING_SIGNATURES  // nuevo: en revisión, flujo de firmas incompleto
  APPROVED
  REJECTED
}
```

### 8.2 Campos nuevos en FormSubmission

```prisma
// Campos nuevos a agregar en el modelo FormSubmission existente:

  auto_approved_at     DateTime?
  rejected_at          DateTime?
  rejected_by_admin_id String?
  rejection_reason     String?   @db.Text

  // Relación nueva:
  rejected_by_admin User? @relation("RejectedByAdmin", fields: [rejected_by_admin_id], references: [id], onDelete: SetNull)
```

**Relación inversa ya declarada en User (sección 3):** `rejected_submissions FormSubmission[] @relation("RejectedByAdmin")`

**Nota de integridad:** `rejected_by_admin_id` usa `onDelete: SetNull` (no `Restrict`) porque si un admin es desactivado/eliminado, la evidencia de rechazo (reason + timestamp) sigue siendo válida aunque ya no se pueda navegar al admin. Esto preserva el historial de auditoría.

---

## 9. Orden de migraciones

Las migraciones deben ejecutarse en este orden estricto. Nunca en paralelo. Nunca con `--force`.

### M1: `add_notifications_model`

**Prerequisitos de datos:** ninguno. Es tabla nueva sin impacto en datos existentes.
**Script de datos previo:** no requerido.
**Contenido:** crear tabla `notifications`, enum `NotificationType`, agregar campos de relación en `User` (Prisma los gestiona automáticamente).

---

### M2: `add_oauth_fields_to_user`

**Prerequisitos de datos:** ninguno. Todos los campos nuevos son nullable.
**Script de datos previo:** no requerido.
**Contenido:** agregar campos `email`, `oauth_provider`, `oauth_provider_id`, `oauth_access_token`, `oauth_refresh_token`, `last_oauth_sync` al modelo `User`. Crear enum `OAuthProvider`. Agregar índice `@@index([oauth_provider, oauth_provider_id])`.

**Advertencia:** el campo `email @unique` genera un índice `UNIQUE` en la tabla `users`. Como todos los registros actuales tienen `email = NULL`, y `UNIQUE` en PostgreSQL permite múltiples `NULL`, esto es seguro sin backfill.

---

### M3: `add_electronic_signature_module`

**Prerequisitos de datos:** requiere que M2 esté aplicado (relación `User` en `SignatureRecord`).
**Script de datos previo:** no requerido.
**Contenido:** crear tablas `external_signers`, `signature_tokens`, `signature_records`, `signature_configs`. Crear enums `SignerType`, `SignatureLinkStatus`, `SignatureMode`. Agregar campos de relación en `FormSubmission`, `FormTemplate`, `WorkLocation`, `User`.

**Nota:** `FormSignature` existente no se modifica ni elimina.

---

### M4: `add_magic_link_model`

**Prerequisitos de datos:** requiere M2 (relación `User`).
**Script de datos previo:** no requerido.
**Contenido:** crear tabla `magic_link_tokens`, enum `MagicLinkPurpose`.

---

### M5: `add_org_config_and_plan_limits`

**Prerequisitos de datos:** requiere que existan filas en `organizations` (hay datos en producción/seed).
**Script de datos previo:** REQUERIDO. Antes de la migración de schema, ejecutar un script que cree una fila `OrgConfig` para cada `Organization` existente con valores por defecto:

```typescript
// prisma/scripts/seed-org-configs.ts
// Ejecutar ANTES de la migración add_org_config_and_plan_limits
const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
for (const org of orgs) {
  await prisma.orgConfig.upsert({
    where: { org_id: org.id },
    update: {},
    create: {
      org_id: org.id,
      plan: 'STARTER',
      max_users: 10,
      max_sites: 2,
      display_name: org.name,
    },
  });
}
```

Este script debe ejecutarse desde el código de la aplicación después de la migración (no antes, porque la tabla no existe aún). La solución correcta es: ejecutar la migración (crea la tabla con columnas nullable o con defaults), luego ejecutar el script de seed de OrgConfig como parte del proceso de deploy.

**Contenido de la migración:** crear tabla `org_configs`, enum `PlanTier`. Agregar relación inversa en `Organization`. Agregar relación `updated_by_super_admin_id` en `User`.

---

### M6: `add_master_lists_for_dropdowns`

**Prerequisitos de datos:** requiere M5 (relaciones con Organization).
**Script de datos previo:** REQUERIDO. El script de datos para listas maestras debe ejecutarse como parte del seed posterior a la migración. Ver sección de seed más adelante.

**Contenido de la migración:**
- Modificar `Department`: `org_id` de `String` a `String?`, `email` de `String` a `String?`, agregar `active Boolean @default(true)`.
- Crear tablas `master_positions`, `master_roles`, `master_list_suggestions`.
- Crear enums `MasterEntityType`, `SuggestionStatus`.
- Agregar campo `position_id String?` en `User` con FK a `master_positions`.
- Agregar relaciones inversas en `Organization` y `User`.

**Impacto sobre datos existentes en Department:**
- `org_id NOT NULL → nullable`: seguro, no requiere UPDATE de datos.
- `email NOT NULL → nullable`: seguro, no requiere UPDATE de datos.
- `active` nuevo con `@default(true)`: todos los departamentos existentes quedan activos automáticamente. Seguro.
- El `@@unique([org_id, name])` existente se mantiene; el comportamiento con nulls en PostgreSQL es correcto.

**Script de seed de listas maestras** (ejecutar después de la migración):

```typescript
// Departamentos globales
const globalDepts = ['Operaciones', 'SST', 'Recursos Humanos', 'Administración',
                     'Logística', 'Mantenimiento', 'Proyectos'];

// MasterRole globales
const globalRoles = ['Supervisor', 'Operario de Campo', 'Inspector SST',
                     'Residente de Obra', 'Director de Proyecto',
                     'Coordinador', 'Auxiliar Administrativo', 'Técnico'];

// MasterPosition globales
const globalPositions = ['Soldador', 'Electricista', 'Operador de Maquinaria',
                         'Topógrafo', 'Albañil', 'Plomero', 'Pintor',
                         'Ayudante General', 'Conductor', 'Mecánico'];
```

---

### M7: `update_form_submission_status_enum`

**Prerequisitos de datos:** requiere que todas las migraciones anteriores estén aplicadas.
**Script de datos previo:** REQUERIDO con cuidado especial.

**El problema:** `ALTER TYPE submission_status ADD VALUE 'PENDING_SIGNATURES'` en PostgreSQL requiere estar fuera de una transacción explícita en versiones < 12. Prisma 6 ejecuta las migraciones en transacciones. Hay dos opciones:

**Opción A (recomendada):** en la migración SQL generada por Prisma, agregar manualmente `-- @no-transaction` al principio del archivo de migración antes de ejecutar. Esto instruye a Prisma a ejecutar esta migración fuera de transacción. El implementador debe editar el archivo `.sql` generado antes de aplicar.

**Opción B:** crear la migración manualmente con `prisma migrate --create-only`, editar el SQL, luego `prisma migrate deploy`.

**Contenido de la migración:**
- `ALTER TYPE submission_status ADD VALUE 'PENDING_SIGNATURES';`
- `ALTER TABLE form_submissions ADD COLUMN auto_approved_at TIMESTAMPTZ;`
- `ALTER TABLE form_submissions ADD COLUMN rejected_at TIMESTAMPTZ;`
- `ALTER TABLE form_submissions ADD COLUMN rejected_by_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL;`
- `ALTER TABLE form_submissions ADD COLUMN rejection_reason TEXT;`

**No se hace UPDATE de datos existentes:** las filas con status `SUBMITTED` no se migran a `PENDING_SIGNATURES` automáticamente. El nuevo estado solo aplica a submissions futuras.

---

## 10. Riesgos e integridad

### Riesgo 1: Migración del enum SubmissionStatus (CRÍTICO)

**Descripción:** agregar `PENDING_SIGNATURES` a un enum PostgreSQL en uso dentro de una transacción de migración Prisma puede fallar con `ERROR: ALTER TYPE ... ADD VALUE cannot run inside a transaction block` en ciertos entornos.

**Mitigación obligatoria:** el implementador debe editar el SQL de la migración M7 para agregar `-- Prisma: no-transaction` como primera línea, o usar `prisma migrate --create-only` y editar manualmente antes de `migrate deploy`. Verificar en staging antes de producción.

**Índice de impacto:** si falla en producción, el sistema queda con schema desincronizado. Requiere rollback manual y potencial downtime.

---

### Riesgo 2: Extensión de Department con org_id nullable (MODERADO)

**Descripción:** el `@@unique([org_id, name])` existente con `org_id nullable` funciona correctamente en PostgreSQL (los NULLs no son iguales entre sí). Sin embargo, el código existente en el backend puede tener queries o DTOs que asumen `org_id` siempre presente en Department.

**Mitigación obligatoria:** el implementador debe auditar el servicio `DepartmentsService` existente. Específicamente:
1. Cualquier `findMany({ where: { org_id: ... } })` que no filtre `active = true` podría devolver departamentos globales inesperadamente si no se agrega filtro.
2. El endpoint `POST /admin/master/departments` que crea un departamento para la org del admin debe seguir poniendo `org_id` obligatorio — los globales solo los crea Kairos desde seed.

**Índice de impacto:** si no se audita, los admins podrían ver departamentos de otras organizaciones o departamentos globales duplicados.

---

### Riesgo 3: Integridad del hash de documento en SignatureRecord (ALTO — legal)

**Descripción:** el `document_hash` en `SignatureRecord` es la evidencia de integridad del permiso de trabajo. Si el objeto canónico definido en el backend cambia (se agregan campos a `FormSubmission`, cambia el orden de serialización), los hashes de firmas antiguas ya no son verificables.

**Mitigación obligatoria:**
1. El objeto canónico debe ser versionado. Agregar campo `hash_version Int @default(1)` a `SignatureRecord` para que en el futuro se pueda saber con qué versión del algoritmo se calculó el hash.
2. El servicio `verifyDocumentIntegrity` debe usar la misma versión del algoritmo con que se firmó.
3. Documentar el objeto canónico en código (no solo en FIRMA_ELECTRONICA.md) con un comentario que diga "NO modificar el orden ni la estructura de este objeto sin incrementar hash_version".

**Índice de impacto:** si el hash no puede verificarse, el documento pierde su validez legal como firma electrónica bajo el Decreto 2364 de 2012.

---

### Índices adicionales recomendados

| Tabla | Índice | Justificación |
|---|---|---|
| `notifications` | `(user_id, read, created_at DESC)` | Contador de no leídas + lista paginada |
| `signature_tokens` | `(token)` | Lookup en ruta pública /firma/:token (alta frecuencia) |
| `signature_records` | `(submission_id)` | Estado de firmas por submission |
| `external_signers` | `(org_id, work_location_id)` | Catálogo por obra |
| `magic_link_tokens` | `(token)` | Validación en callback público |
| `master_list_suggestions` | `(org_id, status)` | Dashboard de pendientes del admin |
| `org_configs` | ya tiene `@unique(org_id)` | Suficiente para PlanLimitsGuard |

### onDelete policies justificadas

| Relación | Policy | Justificación |
|---|---|---|
| `Notification → User` | Cascade | Si se elimina el usuario, sus notificaciones no tienen sentido |
| `SignatureRecord → FormSubmission` | Restrict | Una submission con firmas no puede eliminarse (evidencia legal) |
| `SignatureRecord → User (internal)` | SetNull | El registro de firma debe persistir aunque el usuario sea desactivado |
| `SignatureToken → FormSubmission` | Cascade | Si se cancela la submission, los tokens pendientes expiran |
| `MagicLinkToken → User` | Cascade | Si se elimina el usuario, sus tokens de acceso no tienen valor |
| `OrgConfig → Organization` | Cascade | La config es parte de la organización |
| `MasterPosition/Role → Organization` | Cascade | Los datos maestros por org se eliminan con la org |
| `FormSubmission.rejected_by_admin_id → User` | SetNull | El rechazo queda registrado aunque el admin sea eliminado |

---

## 11. Diagrama ER

El siguiente diagrama muestra los modelos nuevos y sus relaciones con los existentes (en cursiva). Solo se muestran las relaciones clave, no todos los campos.

```
+------------------+          +------------------+          +-------------------+
| *Organization*   |1--------N| OrgConfig        |          | *FormTemplate*    |
|                  |          | plan             |          |                   |
|                  |1--------N| *Department*     |1--------1| SignatureConfig    |
|                  |          | (ext: active,    |          | signature_mode    |
|                  |          |  org_id nullable)|          | min_reading_secs  |
+------------------+          +------------------+          +-------------------+
        |1                                                           |1
        |                                                            |N
        |N                                                    +------------------+
+------------------+          +------------------+           | *FormSubmission* |
| *User*           |1--------N| Notification     |           | +auto_approved_at|
| +email           |          | type             |           | +rejected_at     |
| +oauth_provider  |          | read             |           | +rejected_by_id  |
| +oauth_tokens    |1--------N| MagicLinkToken   |           | +rejection_reason|
| +position_id     |          | purpose          |           | status (+ enum)  |
+------------------+          +------------------+           +------------------+
        |                                                        |1    |1    |1
        |                                               +--------+     |     +--------+
        |                                               |N             |N            |N
        |                                    +-------------------+ +-----------+ +----------+
        |                                    | SignatureToken     | |*FormSig*  | |SignatureR|
        |                                    | token             | | (legacy)  | |ecord     |
        |                                    | link_status       | +-----------+ |signer_ty |
        |                                    | expires_at        |               |stroke    |
        |                                    +-------------------+               |doc_hash  |
        |                                             |N                         +----------+
        |N                                   +-------------------+                    |
+------------------+                        | ExternalSigner    |N-------------------+
| MasterPosition   |                        | identification_nu |
| (global/por-org) |                        | phone             |
| MasterRole       |                        | photo_id_key      |
| (global/por-org) |                        | selfie_key        |
+------------------+                        +-------------------+

+---------------------------+
| MasterListSuggestion      |
| entity_type (POSITION/    |
|   ROLE/DEPARTMENT)        |
| status (PENDING/APPROVED/ |
|   REJECTED)               |
+---------------------------+
```

---

## Apéndice: Código Prisma consolidado (listo para implementar)

El siguiente bloque contiene todo el código Prisma nuevo y las modificaciones al schema existente, organizado para facilitar la implementación. El implementador debe agregar este código al `schema.prisma` existente, respetando el orden de migraciones definido en la sección 9.

```prisma
// ════════════════════════════════════════════════════════════════
// SPRINT DE FUNCIONALIDADES — MODELOS NUEVOS Y MODIFICACIONES
// Implementar en el orden de migraciones documentado en data-design.md
// ════════════════════════════════════════════════════════════════

// ─── M1: NOTIFICACIONES ──────────────────────────────────────────

model Notification {
  id                  String           @id @default(cuid())
  user_id             String
  type                NotificationType
  title               String
  body                String           @db.Text
  read                Boolean          @default(false)
  read_at             DateTime?
  deep_link           String?
  created_at          DateTime         @default(now())
  created_by_admin_id String?

  user             User  @relation("UserNotifications", fields: [user_id], references: [id], onDelete: Cascade)
  created_by_admin User? @relation("AdminCreatedNotifications", fields: [created_by_admin_id], references: [id], onDelete: SetNull)

  @@index([user_id, read, created_at(sort: Desc)])
  @@index([created_by_admin_id])
  @@map("notifications")
}

enum NotificationType {
  FORM_SUBMITTED
  FORM_APPROVED
  FORM_REJECTED
  FORM_PENDING_SIGNATURE
  MAGIC_LINK_SENT
  SYSTEM_ALERT
  CUSTOM_ADMIN
}

// ─── M2: OAUTH EN USER (campos adicionales al modelo User) ──────
// Agregar dentro del modelo User existente:
//
//   email                String?       @unique
//   oauth_provider       OAuthProvider?
//   oauth_provider_id    String?
//   oauth_access_token   String?       @db.Text
//   oauth_refresh_token  String?       @db.Text
//   last_oauth_sync      DateTime?
//
// Agregar al bloque de relaciones de User:
//   notifications             Notification[]         @relation("UserNotifications")
//   sent_notifications        Notification[]         @relation("AdminCreatedNotifications")
//   magic_link_tokens         MagicLinkToken[]       @relation("UserMagicLinks")
//   rejected_submissions      FormSubmission[]       @relation("RejectedByAdmin")
//   internal_signature_records SignatureRecord[]     @relation("InternalSignerRecords")
//   position                  MasterPosition?       @relation("UserPosition", fields: [position_id], references: [id], onDelete: SetNull)
//   position_id               String?
//   suggestions_made          MasterListSuggestion[] @relation("SuggestedByUser")
//   suggestions_reviewed      MasterListSuggestion[] @relation("ReviewedByUser")
//   org_config_updates        OrgConfig[]            @relation("SuperAdminOrgConfigUpdates")
//
// Agregar al bloque de índices de User:
//   @@index([oauth_provider, oauth_provider_id])

enum OAuthProvider {
  GOOGLE
  MICROSOFT
}

// ─── M3: FIRMA ELECTRÓNICA ───────────────────────────────────────

model ExternalSigner {
  id                    String   @id @default(cuid())
  org_id                String
  work_location_id      String
  name                  String
  identification_number String
  phone                 String
  photo_id_key          String?
  selfie_key            String?
  is_registered         Boolean  @default(false)
  created_at            DateTime @default(now())
  updated_at            DateTime @updatedAt

  org              Organization     @relation(fields: [org_id], references: [id])
  work_location    WorkLocation     @relation(fields: [work_location_id], references: [id])
  signature_tokens SignatureToken[]
  signature_records SignatureRecord[] @relation("ExternalSignerRecords")

  @@unique([work_location_id, identification_number])
  @@index([org_id, work_location_id])
  @@map("external_signers")
}

model SignatureToken {
  id                  String              @id @default(cuid())
  token               String              @unique @default(cuid())
  submission_id       String
  external_signer_id  String
  link_status         SignatureLinkStatus @default(SENT)
  expires_at          DateTime
  viewed_at           DateTime?
  used_at             DateTime?
  created_at          DateTime            @default(now())

  submission       FormSubmission  @relation(fields: [submission_id], references: [id], onDelete: Cascade)
  external_signer  ExternalSigner  @relation(fields: [external_signer_id], references: [id], onDelete: Cascade)
  signature_record SignatureRecord? @relation("TokenSignatureRecord")

  @@index([submission_id])
  @@index([token])
  @@map("signature_tokens")
}

model SignatureRecord {
  id                  String     @id @default(cuid())
  submission_id       String
  signer_type         SignerType
  internal_user_id    String?
  external_signer_id  String?
  signature_token_id  String?    @unique
  ip_address          String?
  user_agent          String?    @db.Text
  geo_location        Json?
  webauthn_session    Boolean    @default(false)
  reading_log         Json
  min_reading_seconds Int        @default(30)
  stroke_image_base64 String     @db.Text
  stroke_vectors      Json
  document_hash       String
  hash_version        Int        @default(1)
  signed_at           DateTime   @default(now())

  submission      FormSubmission  @relation(fields: [submission_id], references: [id], onDelete: Restrict)
  internal_user   User?           @relation("InternalSignerRecords", fields: [internal_user_id], references: [id], onDelete: SetNull)
  external_signer ExternalSigner? @relation("ExternalSignerRecords", fields: [external_signer_id], references: [id], onDelete: SetNull)
  signature_token SignatureToken? @relation("TokenSignatureRecord", fields: [signature_token_id], references: [id], onDelete: SetNull)

  @@index([submission_id])
  @@index([internal_user_id])
  @@index([external_signer_id])
  @@map("signature_records")
}

model SignatureConfig {
  id                     String        @id @default(cuid())
  template_id            String        @unique
  signature_mode         SignatureMode @default(FLEXIBLE)
  min_reading_seconds    Int           @default(30)
  requires_internal_sign Boolean       @default(true)
  created_at             DateTime      @default(now())
  updated_at             DateTime      @updatedAt

  template FormTemplate @relation(fields: [template_id], references: [id], onDelete: Cascade)

  @@map("signature_configs")
}

enum SignerType {
  INTERNAL
  EXTERNAL
}

enum SignatureLinkStatus {
  SENT
  VIEWED
  SIGNED
}

enum SignatureMode {
  STRICT
  FLEXIBLE
}

// ─── M4: MAGIC LINK ──────────────────────────────────────────────

model MagicLinkToken {
  id                     String           @id @default(cuid())
  token                  String           @unique @default(cuid())
  user_id                String
  purpose                MagicLinkPurpose
  expires_at             DateTime
  used_at                DateTime?
  created_by_super_admin Boolean          @default(false)
  created_at             DateTime         @default(now())

  user User @relation("UserMagicLinks", fields: [user_id], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([user_id])
  @@map("magic_link_tokens")
}

enum MagicLinkPurpose {
  FIRST_ACCESS_ADMIN
  ADMIN_INVITE
}

// ─── M5: ORGCONFIG Y PLAN ────────────────────────────────────────

model OrgConfig {
  id                        String    @id @default(cuid())
  org_id                    String    @unique
  plan                      PlanTier  @default(STARTER)
  max_users                 Int       @default(10)
  max_sites                 Int       @default(2)
  display_name              String
  logo_url                  String?
  primary_color             String?
  updated_at                DateTime  @updatedAt
  updated_by_super_admin_id String?

  org                   Organization @relation(fields: [org_id], references: [id], onDelete: Cascade)
  updated_by_super_admin User?       @relation("SuperAdminOrgConfigUpdates", fields: [updated_by_super_admin_id], references: [id], onDelete: SetNull)

  @@map("org_configs")
}

enum PlanTier {
  STARTER
  PROFESSIONAL
  ENTERPRISE
}

// ─── M6: LISTAS MAESTRAS ─────────────────────────────────────────

// NOTA: Department se modifica (no se crea nuevo):
//   org_id: String → String?
//   email:  String → String?
//   Agregar: active Boolean @default(true)
//   Modificar: org Organization → Organization? (nullable)
//   Agregar: @@index([org_id, active])

model MasterPosition {
  id         String    @id @default(cuid())
  org_id     String?
  name       String
  active     Boolean   @default(true)
  created_at DateTime  @default(now())

  org   Organization? @relation(fields: [org_id], references: [id], onDelete: Cascade)
  users User[]        @relation("UserPosition")

  @@unique([org_id, name])
  @@index([org_id, active])
  @@map("master_positions")
}

model MasterRole {
  id         String    @id @default(cuid())
  org_id     String?
  name       String
  active     Boolean   @default(true)
  created_at DateTime  @default(now())

  org Organization? @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@unique([org_id, name])
  @@index([org_id, active])
  @@map("master_roles")
}

model MasterListSuggestion {
  id           String           @id @default(cuid())
  org_id       String
  suggested_by String
  entity_type  MasterEntityType
  value        String
  status       SuggestionStatus @default(PENDING)
  reviewed_by  String?
  reviewed_at  DateTime?
  created_at   DateTime         @default(now())

  org       Organization @relation(fields: [org_id], references: [id])
  suggester User         @relation("SuggestedByUser", fields: [suggested_by], references: [id])
  reviewer  User?        @relation("ReviewedByUser", fields: [reviewed_by], references: [id])

  @@index([org_id, status])
  @@index([suggested_by])
  @@map("master_list_suggestions")
}

enum MasterEntityType {
  POSITION
  ROLE
  DEPARTMENT
}

enum SuggestionStatus {
  PENDING
  APPROVED
  REJECTED
}

// ─── M7: AJUSTE FORMSUBMISSION ───────────────────────────────────

// NOTA: SubmissionStatus se modifica (agregar valor):
//   PENDING_SIGNATURES (nuevo, entre SUBMITTED y APPROVED)
//
// Campos nuevos en FormSubmission:
//   auto_approved_at     DateTime?
//   rejected_at          DateTime?
//   rejected_by_admin_id String?
//   rejection_reason     String?    @db.Text
//   rejected_by_admin    User?      @relation("RejectedByAdmin", fields: [rejected_by_admin_id], references: [id], onDelete: SetNull)
```

---

*Documento generado por el agente data-architect. Para implementación, invocar al agente postgres-expert con este documento como contexto.*
