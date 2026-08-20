# SEÑAL — Backend

## Qué es este proyecto

SEÑAL es el primer producto del ecosistema **Kairos DLS Group**. Es un SaaS B2B de automatización de formularios operacionales para empresas del sector SST (Seguridad y Salud en el Trabajo) en Colombia. Permite crear formularios configurables (sin código), registrar asistencia, firmar digitalmente y exportar reportes.

El backend fue refactorizado de Express puro + raw SQL a **NestJS + Prisma**, porque el sistema legacy tenía cada formulario hardcodeado como tabla + ruta + componente. El objetivo es un sistema data-driven donde el admin crea formularios desde el panel.

---

## Stack

- **Framework:** NestJS 11 (TypeScript)
- **BD:** PostgreSQL — `senal_db` (dev), `senal_test` (test)
- **ORM:** Prisma v6
- **Cache / sesiones:** Redis (ioredis)
- **Auth:** JWT + PIN (bcrypt + rate limiter) + WebAuthn (SimpleWebAuthn)
- **Email:** Resend (`resend` SDK)
- **Push:** Web Push API (web-push, VAPID)
- **AI:** Codex API via `@anthropic-ai/sdk` — extracción y generación de formularios
- **Storage:** Cloudinary (archivos subidos a la IA)
- **Dates:** Luxon (timezone-aware, Colombia/Bogotá)
- **Export:** pdfmake (PDF), exceljs + xlsx (Excel), mammoth (docx → texto)
- **Testing:** Jest — unit, integration (BD real), e2e (servidor vivo)
- **Infra:** Docker (Node 20 + LibreOffice), HTTPS local con certificados PEM

---

## Estructura de carpetas

```
src/
├── main.ts                          # Bootstrap, HTTPS, CORS, ValidationPipe global
├── app.module.ts                    # Raíz con todos los módulos
│
├── auth/                            # Autenticación
│   ├── pin/                         # Login por PIN con rate limiting (Redis)
│   ├── webauthn/                    # Biometría (SimpleWebAuthn)
│   ├── jwt.strategy.ts              # Passport JWT
│   └── dto/
│
├── organizations/                   # Multitenancy — raíz de todo
├── departments/                     # Departamentos por org
├── users/                           # Usuarios con roles
├── work-locations/                  # Ubicaciones (lat/lng, contractors)
│
├── attendance/                      # Módulo DEDICADO — NO usa FormTemplate
│   ├── attendance.service.ts        # CRUD registros entrada/salida
│   ├── attendance-config.service.ts # Config por org (turnos, festivos)
│   ├── attendance-overtime.service.ts  # Cálculo recargos colombianos
│   └── attendance-cron.service.ts   # Jobs programados (cierre de jornadas)
│
├── form-templates/                  # Plantillas de formularios (DRAFT/ACTIVE/ARCHIVED)
├── form-fields/                     # Campos dentro de templates
├── form-categories/                 # Categorías (SST, Operaciones, etc.)
├── form-submissions/                # Envíos
│   └── form-validity.service.ts     # Valida frecuencias (DAILY, WEEKLY, etc.)
├── form-signatures/                 # Firmas digitales en envíos
├── form-notifications/              # Notificaciones por triggers
├── form-exports/                    # PDF / Excel
├── form-blueprints/                 # Plantillas globales reutilizables
│
├── form-ai/                         # IA con Codex API
│   ├── form-ai.service.ts           # Extracción PDF/DOCX/Excel → campos
│   ├── ai-prompts.constants.ts      # Prompts del sistema
│   ├── field-type.map.ts            # Mapeo tipos IA → FieldType enum
│   ├── cloudinary.config.ts
│   └── file-storage.service.ts      # Upload/download Cloudinary
│
├── push-notifications/              # Web Push (VAPID)
├── webhooks/                        # Webhooks outbound (integración Kairos)
├── redis/                           # Módulo global Redis
├── prisma/                          # Módulo global Prisma
│
└── common/
    ├── decorators/                  # @Public, @Roles, @CurrentUser
    ├── guards/                      # JwtAuthGuard, RolesGuard
    ├── filters/                     # HttpExceptionFilter
    ├── interceptors/                # ResponseTransformInterceptor
    └── utils/                       # slug, period-key, form-keys

prisma/
├── schema.prisma                    # 17 modelos + 6 enums
├── seed.ts                          # Datos demo (Kairos Demo org)
└── migrations/

test/
├── integration/                     # Tests con BD real (senal_test)
├── e2e/                             # Tests con servidor vivo
└── helpers/
```

---

## Modelos Prisma (schema.prisma)

### Modelos principales

| Modelo | Descripción |
|---|---|
| `Organization` | Raíz del multitenancy. Todo tiene `org_id`. |
| `Department` | Departamentos dentro de una org. |
| `WorkLocation` | Ubicación con lat/lng, contractor. |
| `User` | Roles: `SUPER_ADMIN`, `ADMIN`, `OPERATOR`. Clave: `identification_number` (cédula). |
| `WebAuthnCredential` | Tabla separada — N credenciales por usuario. |
| `PushSubscription` | Subscripciones Web Push por usuario. |
| `AttendanceConfig` | Config de asistencia por org (horas estándar, turnos, festivos JSON). |
| `AttendanceRecord` | Registro entrada/salida con recargos calculados. |
| `FormCategory` | Categorías (SST, Operaciones, etc.). |
| `FormTemplate` | Plantilla de formulario (`DRAFT` → `ACTIVE` → `ARCHIVED`). |
| `FormField` | Campo dentro de un template (11 tipos). |
| `FormNotification` | Notificaciones por trigger (`ON_SUBMIT`, `ON_APPROVE`, etc.). |
| `FormBlueprint` | Plantillas globales reutilizables (no ligadas a una org). |
| `FormSubmission` | Envío de un formulario por un usuario. |
| `FormSubmissionValue` | Valor por campo dentro de un submission. |
| `FormSignature` | Firma digital en un submission. |
| `WebhookEndpoint` | Endpoints outbound para ecosistema Kairos. |

### Enums

```
UserRole:          SUPER_ADMIN | ADMIN | OPERATOR
FormTemplateStatus: DRAFT | ACTIVE | ARCHIVED
FieldType:         TEXT | NUMBER | DATE | DATETIME | SELECT | MULTISELECT |
                   BOOLEAN | SIGNATURE | PHOTO | GEOLOCATION | FILE
Frequency:         INHERIT | NONE | DAILY | WEEKLY | MONTHLY | PER_EVENT | ONCE
NotificationTrigger: ON_SUBMIT | ON_APPROVE | ON_REJECT | SCHEDULED
SubmissionStatus:  DRAFT | SUBMITTED | APPROVED | REJECTED
```

---

## Decisiones arquitecturales clave

**No cambiar estas decisiones sin entender el contexto:**

1. **Attendance es módulo DEDICADO** — tiene cálculos de horas extras con clasificación colombiana (diurna/nocturna/dominical/festiva) y `AttendanceConfig` por org. NO es un `FormTemplate`.

2. **`identification_number` (cédula colombiana) es la clave portátil universal** del ecosistema Kairos. Se usa para identificar al usuario en todos los productos.

3. **WebAuthnCredential es tabla separada** (N credenciales por usuario), no JSON en `User`.

4. **Redis como mutex distribuido** para cron locks — no hay tabla `cron_locks`.

5. **Multitenancy por `org_id`** — cada query a la BD debe filtrar por `org_id`. El `JwtAuthGuard` inyecta `orgId` en el request.

6. **Webhooks outbound** hacia ecosistema Kairos (FLUJO) — sin event bus centralizado hasta que ambos productos existan.

---

## Mapeo legacy → nuevo (para no repetir el análisis)

| Legacy | Nuevo | Nota |
|---|---|---|
| `empresas` | `Organization` | Era mal usada como tabla de roles |
| `obras` | `WorkLocation` | Añade contractor, is_active, department_id |
| `departamentos` | `Department` | Routing de emails para notificaciones |
| `trabajadores` | `User` | Añade is_active, job_title, role enum |
| `webauthn_credenciales` | `WebAuthnCredential` | Tabla separada |
| `horas_jornada` | `AttendanceRecord` + `AttendanceConfig` | Módulo dedicado |
| `admin_passwords` | `UserRole` enum en `User` | Roles hardcodeados → enum |
| `cron_locks` | Redis SET NX EX | Sin tabla |
| `push_subscriptions` | `PushSubscription` | user_id como PK directo |
| `permiso_trabajo` | `FormTemplate` | Motivó toda la refactorización |

---

## Variables de entorno requeridas

```env
# PostgreSQL
DATABASE_URL=postgresql://postgres@localhost:5432/senal_db

# App
PORT=3000
NODE_ENV=development
FRONTEND_URL=https://localhost:4000

# JWT
JWT_SECRET=...
JWT_EXPIRY=8h

# Redis
REDIS_URL=redis://localhost:6379

# WebAuthn
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_NAME=SEÑAL
WEBAUTHN_ORIGIN=https://localhost:4000

# Push
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:...

# Email (Resend)
RESEND_API_KEY=re_...
RESEND_FROM=SEÑAL <no-reply@senal.kairosdls.com>

# Codex API
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=Codex-sonnet-4-5-20250514

# Cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Para tests: `.env.test` usa `senal_test` como BD y `Codex-haiku-4-5-20251001` para AI. Sin `RESEND_API_KEY`, los emails se omiten y se loggean en consola.

---

## Comandos frecuentes

```bash
# Dev
npm run start:dev

# Prisma
npm run prisma:migrate    # Aplicar migrations
npm run prisma:generate   # Regenerar cliente
npm run seed              # Cargar datos demo (Kairos Demo org)

# Tests
npm run test              # Unit tests
npm run test:integration  # Con BD real (senal_test)
npm run test:e2e          # Con servidor vivo
npm run test:all          # Todos
```

---

## Datos de prueba (seed)

La seed crea:
- **Org:** Kairos Demo
- **Departamentos:** SST, Operaciones
- **Ubicaciones:** Obra Norte, Obra Sur (con coordenadas)
- **Usuarios:** Admin Demo (PIN: 1234), Juan Pérez (OPERATOR, PIN: 1234), María García (OPERATOR)
- **AttendanceConfig:** 8h estándar, turno nocturno 21:00-06:00, 17 festivos Colombia 2026
- **FormTemplate:** "Permiso de Trabajo en Alturas" (ACTIVE, 10 campos)
- **7 FormBlueprints globales:** Alturas, Espacios Confinados, Trabajo en Caliente, Izaje, EPP, Inspección Preoperacional, Reporte de Incidente

---

## Notas importantes

- **`findOne` de submissions incluye la relación `field`** — `form-submissions.service.ts` hace `values: { include: { field: true } }`. El frontend depende de esto para mostrar el `label` legible en lugar del `field_id` (cuid). No eliminar ese include sin actualizar el frontend.
- Los `field_id` en `FormSubmissionValue` son cuids opacos generados por Prisma — no contienen semántica legible. El label del campo está en `FormField.label`.

---

## Contexto de negocio

- **Cliente objetivo:** Empresas colombianas con operaciones en campo (construcción, minería, industria)
- **Sector:** SST (Seguridad y Salud en el Trabajo) — normas colombianas
- **Segundo producto planeado:** FLUJO (gestor documental SG-SST), integración vía webhooks
- **Los recargos de asistencia** siguen el Código Sustantivo del Trabajo colombiano: horas extra diurnas/nocturnas, recargo dominical, recargo festivo
