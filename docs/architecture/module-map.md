# SEÑAL — Mapa de módulos

> Fecha: 2026-06-10  
> Repos: `señal-back` (NestJS + Prisma + PostgreSQL + Redis) y `señal-front` (React 19 + Vite + Zustand + TanStack Query). NO es monorepo.

---

## Leyenda

| Símbolo | Significado |
|---|---|
| BE | Solo backend |
| FE | Solo frontend |
| BE+FE | Módulo con partes en ambos repos |
| EXISTENTE | Ya existe en el codebase |
| NUEVO (sprint) | Se crea en este sprint |
| EXTIENDE | Nuevo código que agrega funcionalidad a un módulo existente sin reemplazarlo |
| REEMPLAZA | El módulo nuevo asume la responsabilidad del existente; el existente queda deprecado o reducido |

---

## 1. Módulos existentes (señal-back/src/)

| Módulo | Tipo | Descripción |
|---|---|---|
| `auth` | BE EXISTENTE | Login con `identification_number` + PIN (bcrypt) o WebAuthn. Emite JWT. Guards `JwtAuthGuard` y `RolesGuard` compartidos. |
| `users` | BE EXISTENTE | CRUD de usuarios de una organización. Roles: `SUPER_ADMIN`, `ADMIN`, `OPERATOR`. |
| `organizations` | BE EXISTENTE | CRUD de organizaciones (multi-tenant). Un usuario pertenece a una `Organization`. |
| `work-locations` | BE EXISTENTE | Sedes/obras por organización. "Sede" = `WorkLocation`. |
| `departments` | BE EXISTENTE | Departamentos por organización. |
| `form-templates` | BE EXISTENTE | Plantillas de formularios (DRAFT/ACTIVE/ARCHIVED). |
| `form-fields` | BE EXISTENTE | Campos de una plantilla (tipos: TEXT, SELECT, SIGNATURE, PHOTO, etc.). |
| `form-submissions` | BE EXISTENTE | Envíos de formularios. Estados actuales: DRAFT, SUBMITTED, APPROVED, REJECTED. |
| `form-signatures` | BE EXISTENTE | Firma simple embebida en submissions: nombre, rol, imagen de firma. **Sin validez probatoria completa.** Ve nota de relación con `electronic-signature`. |
| `form-notifications` | BE EXISTENTE | Notificaciones por trigger de plantilla (ON_SUBMIT, ON_APPROVE, etc.) vía email (nodemailer). **Ve nota de relación con `notifications`.** |
| `form-ai` | BE EXISTENTE | OCR de archivos, generación de plantillas desde descripción, chat asistente del editor. |
| `form-blueprints` | BE EXISTENTE | Plantillas globales reutilizables (blueprints de Kairos). |
| `form-categories` | BE EXISTENTE | Categorías de formularios por organización. |
| `form-exports` | BE EXISTENTE | Exportación a PDF y Excel de submissions. |
| `attendance` | BE EXISTENTE | Control de asistencia completo (clock-in/clock-out, configuración, cálculo de horas extra). |
| `push-notifications` | BE EXISTENTE | Web Push via web-push. `PushSubscription` por usuario. **Ve nota de relación con `notifications`.** |
| `redis` | BE EXISTENTE | Módulo de acceso a Redis (ioredis). Usado para caché y pub/sub. |
| `webhooks` | BE EXISTENTE | Webhooks salientes por organización. |
| `inventarios` | BE EXISTENTE | Módulo de inventarios aduaneros (dominio separado). |
| `prisma` | BE EXISTENTE | Servicio PrismaClient compartido. |
| `common` | BE EXISTENTE | Guards (`JwtAuthGuard`, `RolesGuard`), decoradores (`@Roles`), filtros de excepción. |

---

## 2. Módulos nuevos del sprint

### 2.1 Backend

| Módulo | Tipo | Relación con existentes |
|---|---|---|
| `notifications` | BE+FE NUEVO | Convive con `form-notifications` y `push-notifications`. Ver sección 3. |
| `admin-notifications` | BE+FE NUEVO | Subelemento de `notifications` para envíos manuales desde el panel admin. |
| `auth-oauth` | BE+FE NUEVO | EXTIENDE `auth`. Agrega flujos OAuth Google + Microsoft para ADMIN/SUPER_ADMIN. El login PIN/WebAuthn para OPERATOR y SUPER_ADMIN no cambia. |
| `electronic-signature` | BE+FE NUEVO | REEMPLAZA funcionalmente a `form-signatures`. Ver sección 4. |
| `magic-link` | BE+FE NUEVO | EXTIENDE `auth`. Tokens de primer acceso/invitación para admins. Usa nodemailer ya existente. |
| `superadmin` | BE+FE NUEVO | EXTIENDE `organizations` y el panel `/super` existente. Agrega `OrgConfig`, métricas de uso y gestión de magic links. |
| `admin-management` | BE+FE NUEVO | EXTIENDE `users`. Crea y gestiona administradores desde el panel admin. Depende de `magic-link` y `plan-limits`. |
| `plan-limits` | BE NUEVO | Transversal. `PlanLimitsGuard` que consulta `OrgConfig` antes de crear usuarios o sedes. Depende de `superadmin` (OrgConfig). |
| `form-approval-flow` | BE+FE NUEVO | EXTIENDE `form-submissions`. Lógica de auto-aprobación, rechazo con motivo y estados de firma. |
| `master-lists` | BE+FE NUEVO | Nuevo. Listas maestras (cargos, roles operativos, departamentos globales). EXTIENDE `departments` para soportar registros globales. |

### 2.2 Solo frontend (sin módulo NestJS propio)

| Módulo | Tipo | Descripción |
|---|---|---|
| `site-selection-ux` | FE NUEVO | Nueva pantalla de selección de obra para el operario. Consume endpoints existentes de `work-locations`. Sin cambios en backend. |
| `loading-feedback` | FE NUEVO | Componente `<VerifyingOverlay />` global. Consume `GET /status/user-context` (endpoint nuevo en backend, pero mínimo — ver contrato). |
| `operator-navbar` | FE NUEVO | Refactor de la navbar del operario. La tab de jornada pasa a primera posición. Consume endpoints existentes de `attendance`. Sin cambios en backend. |

---

## 3. Relación entre módulos de notificaciones

```
                         ┌─────────────────────────────────────────┐
                         │  SEÑAL — Capa de notificaciones          │
                         └─────────────────────────────────────────┘

┌──────────────────────────────┐    ┌──────────────────────────────┐
│  form-notifications          │    │  push-notifications           │
│  (EXISTENTE — no se toca)    │    │  (EXISTENTE — no se toca)     │
│                              │    │                               │
│  Trigger por plantilla:      │    │  Web Push vía web-push.       │
│  ON_SUBMIT, ON_APPROVE...    │    │  PushSubscription por user.   │
│  Canales: email (nodemailer) │    │  Sin centro de notificaciones │
└──────────────┬───────────────┘    └───────────────┬──────────────┘
               │ puede invocar                       │ puede invocar
               ▼                                     ▼
    ┌────────────────────────────────────────────────────────────┐
    │  notifications (NUEVO)                                      │
    │                                                             │
    │  Centro de notificaciones en-app + tiempo real (WebSocket)  │
    │  Tabla `notifications` en BD.                               │
    │  Emite: notification.created → Redis pub/sub                │
    │  Consume: eventos de otros módulos (firma, aprobación...)   │
    │  Gateway WebSocket: room por userId                         │
    └────────────────────────────────────────────────────────────┘
               ▲
               │ usa NotificationsService.create()
    ┌──────────┴─────────────────────────────────────────────────┐
    │  admin-notifications (NUEVO)                                │
    │                                                             │
    │  Envío manual desde panel admin a grupos de usuarios.       │
    │  Historial de envíos por admin.                             │
    └────────────────────────────────────────────────────────────┘
```

**Regla de convivencia:**
- `form-notifications` sigue gestionando sus notificaciones vía email por trigger de plantilla. No se modifica.
- `push-notifications` sigue gestionando las suscripciones web-push. No se modifica.
- `notifications` (nuevo) es el canal de notificaciones en-app (base de datos + WebSocket). Los otros módulos del sprint (firma, aprobación) invocan `NotificationsService.create()` para crear notificaciones en-app además de cualquier otro canal que ya usen.
- No existe duplicación: cada canal es independiente.

---

## 4. Relación entre form-signatures y electronic-signature

```
┌─────────────────────────────────────────────────────────────┐
│  form-signatures (EXISTENTE)                                 │
│                                                              │
│  Firma simple: signer_name, signer_role, signature_url.      │
│  Sin log de lectura, sin hash de documento, sin evidencias   │
│  legales. Usado en submissions actuales.                     │
│                                                              │
│  ESTADO: se mantiene para submissions existentes.            │
│  No se elimina ni se migran datos históricos.                │
│  No se usa en nuevos flujos de firma.                        │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ coexiste (datos históricos)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  electronic-signature (NUEVO)                                │
│                                                              │
│  Firma legalmente válida (Ley 527/1999, Decreto 2364/2012). │
│  Tablas nuevas: firmantes_externos, firma_tokens,            │
│  registros_firma, logs_lectura.                              │
│                                                              │
│  Cubre: firmante interno (operario autenticado) y            │
│  firmante externo (tercero sin cuenta SEÑAL vía WhatsApp).   │
│                                                              │
│  Reemplaza a form-signatures para TODOS los nuevos           │
│  formularios que requieran firma formal.                     │
│  Depende de: form-submissions, notifications, redis.         │
└─────────────────────────────────────────────────────────────┘
```

**Regla de migración:**
- `form-signatures` no se elimina ni se toca. Sus datos históricos son válidos.
- Los formularios con `signature_frequency != NONE` pueden adoptar el nuevo módulo de forma gradual, controlado por el feature flag `feature:electronic_signature`.
- Cuando el flag está activo, el flujo de firma pasa por `electronic-signature`. Cuando está inactivo, el flujo legado (`form-signatures`) permanece.

---

## 5. Diagrama de dependencias entre módulos nuevos

```
superadmin
    └─▶ organizations (EXISTENTE)
    └─▶ OrgConfig (nuevo modelo)
    └─▶ magic-link (genera links de primer acceso)

plan-limits
    └─▶ superadmin / OrgConfig (consulta límites)
    └─▶ users / work-locations (guarda creación)

admin-management
    └─▶ users (EXISTENTE)
    └─▶ magic-link
    └─▶ plan-limits (PlanLimitsGuard)

auth-oauth
    └─▶ auth (EXISTENTE — emite el mismo JWT)
    └─▶ magic-link (activación tras consumir el token)
    └─▶ feature-flags (oauth_google, oauth_microsoft)

magic-link
    └─▶ users (EXISTENTE)
    └─▶ auth-oauth (el token lleva al flujo OAuth)
    └─▶ nodemailer (EXISTENTE)

electronic-signature
    └─▶ form-submissions (EXISTENTE)
    └─▶ notifications (emite evento al completar firma)
    └─▶ redis (caché de tokens activos)
    └─▶ cloudinary (EXISTENTE — fotos cédula/selfie privadas)
    └─▶ form-approval-flow (trigger de auto-aprobación)

form-approval-flow
    └─▶ form-submissions (EXISTENTE — actualiza status)
    └─▶ notifications (notifica al operario y admins)
    └─▶ electronic-signature (consulta estado de firmas)

notifications
    └─▶ redis (pub/sub — canal notification.created)
    └─▶ users (EXISTENTE — ownership)

admin-notifications
    └─▶ notifications
    └─▶ users / work-locations (EXISTENTE — destinatarios)

master-lists
    └─▶ departments (EXISTENTE — extiende para globales)
    └─▶ organizations (EXISTENTE — scope por org)

site-selection-ux
    └─▶ work-locations (EXISTENTE — solo consume API)

operator-navbar
    └─▶ attendance (EXISTENTE — solo consume API)

loading-feedback
    └─▶ /status/user-context (endpoint nuevo, mínimo)
        └─▶ users + organizations + work-locations (EXISTENTE)
```
