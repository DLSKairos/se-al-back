# SEÑAL — Decisiones confirmadas del sprint (product owner: David, 2026-06-10)

Este documento registra las decisiones que **modifican o aclaran** lo escrito en `SPRINT_TAREAS.md` y `FIRMA_ELECTRONICA.md`. En caso de conflicto: **DECISIONES.md > FIRMA_ELECTRONICA.md > SPRINT_TAREAS.md**.

## Realidad del codebase (verificada)

- **NO es monorepo**: dos repos separados — `/Users/david/dev/señal/señal-front` (React 19 + Vite + Tailwind 4 + Zustand + TanStack Query) y `/Users/david/dev/señal/señal-back` (NestJS 11 + Prisma 6 + PostgreSQL + Redis vía ioredis).
- El modelo multi-tenant se llama **`Organization`** (no `Company`). Campos en **snake_case**, tablas con `@@map`.
- `UserRole` existente: `SUPER_ADMIN`, `ADMIN`, `OPERATOR`.
- Login actual: `identification_number` + PIN (bcrypt) o WebAuthn. **Los usuarios NO tienen email ni password.**
- Imágenes: **Cloudinary** ya integrado (NO hay S3).
- Email: **nodemailer** ya en dependencias (usado en form-notifications).
- Ya existen: `FormSignature` (firma simple embebida en submissions), `FormNotification` (notificaciones por trigger de plantilla), `PATCH /submissions/:id/status` (aprobar/rechazar manual), panel `/super` (CRUD de organizaciones), push notifications web-push, módulo `attendance` completo.
- Frontend: rutas y páginas listadas en `señal-front/CLAUDE.md`. Tipos centralizados en `src/types/index.ts`, endpoints en `src/lib/api.ts`, query keys en `src/lib/queryKeys.ts`.

## Decisiones

1. **Identidad de administradores — SOLO OAuth, sin contraseña.**
   - Se agrega `email` (único, nullable a nivel schema) al modelo `User`; obligatorio a nivel de servicio para ADMIN.
   - Los admins inician sesión únicamente con Google o Microsoft. NO se crea password para admins.
   - El magic link de activación (primer acceso o invitación) lleva a una pantalla donde el admin **vincula** su cuenta Google/Microsoft; ahí queda registrado su `oauth_provider` + `oauth_provider_id`.
   - En el login del frontend: debajo del botón "Ingresar" va un botón **"Ingreso administradores"** que reemplaza el campo de cédula por "Continuar con Google" / "Continuar con Microsoft".
   - **Operarios: sin cambios** (cédula + PIN/WebAuthn).
   - **SUPER_ADMIN: sin cambios en su login** (cédula + PIN/biometría). No se enforca "superadmin único desde .env".

2. **Firma externa — FIRMA_ELECTRONICA.md completo.**
   - Canal: WhatsApp (link wa.me con mensaje precompletado, generado en el cliente). NO email para firmantes externos.
   - Registro de externos: nombre + cédula + celular; primera vez foto de cédula + selfie.
   - Token de firma: 2 horas por defecto, un solo uso, ruta pública `/firma/:token`.
   - Estados: Link enviado → Visto → Firmado.
   - Evidencias completas: IP, user agent, geolocalización, log de lectura por sección/pregunta, trazo vectorial + imagen base64, hash SHA-256 de objeto canónico.
   - El `MagicLinkPurpose.EXTERNAL_SIGNER` del sprint original se elimina: los externos usan `firma_tokens`, no magic links.

3. **Storage de fotos sensibles (cédula/selfie): Cloudinary privado** — assets en modo `authenticated`, acceso por URLs firmadas con expiración. NO se agrega AWS S3.

4. **Aprobación de formularios: SOLO automática.**
   - Auto-aprobación cuando: todos los campos obligatorios llenos + todas las firmas requeridas completadas.
   - El admin solo puede **rechazar** (motivo obligatorio, mín 10 chars).
   - Se elimina la capacidad de aprobar manualmente del endpoint `PATCH /submissions/:id/status` y de la UI.
   - Nuevo estado `PENDING_SIGNATURES` (UI admin: "En revisión").

5. **Listas maestras — integradas con lo existente.**
   - `Department` existente se extiende: soporta registros globales (`org_id` null, seed de Kairos) + propios de cada org, con `active` para soft delete.
   - Nuevo `MasterPosition` (cargos) — reemplaza el texto libre de `job_title`.
   - Nuevo `MasterRole` (rol operativo: Supervisor, Inspector SST, etc.) — NO confundir con el `UserRole` de sistema.
   - Flujo "sugerir valor": el operario que no encuentra su cargo crea una solicitud que el admin aprueba.

6. **Credenciales OAuth/SMTP: el usuario aún no las tiene.**
   - Todo se implementa detrás de feature flags en Redis (`feature:oauth_google`, `feature:oauth_microsoft`, `feature:electronic_signature`, `feature:magic_link`, `feature:superadmin_panel`).
   - Debe quedar listo para que con solo llenar el `.env` y activar el flag, funcione.
   - Documentar paso a paso cómo crear las OAuth apps en Google Cloud Console y Azure AD.

7. **SuperAdmin: mantener y extender.**
   - El panel `/super` existente se extiende con: `OrgConfig` (plan STARTER/PROFESSIONAL/ENTERPRISE, max_users, max_sites, display_name, logo, color), métricas de uso (usuarios y sedes activas vs límite, con barras de progreso), generación de magic link al primer admin de la empresa cliente, historial de magic links.
   - `PlanLimitsGuard` en backend: bloquea crear usuarios/sedes por encima del límite con `ForbiddenException` y mensaje claro.
   - "Sedes" = `WorkLocation` existente. "Empresa" = `Organization` existente.

8. **Git: SIN commits.** Todo queda en el working tree de ambos repos; David hace los commits manualmente.

## Convenciones para todos los agentes

- Prisma: snake_case en campos, `@@map` a nombre de tabla en plural snake_case, `cuid()` para IDs — seguir el estilo del schema existente.
- NestJS: estructura modular existente (un folder por módulo: controller, service, module, dto/). Guards `JwtAuthGuard` + `RolesGuard` con decorator `@Roles(...)` existentes en `src/auth` / `src/common`.
- Frontend: tipos en `src/types/index.ts`, endpoints en `src/lib/api.ts` (el wrapper desenvuelve `{success, data}`), query keys en `src/lib/queryKeys.ts`, paleta y tokens de diseño en `señal-front/CLAUDE.md` (navy/signal/amber, fuentes syne/fraunces/dm).
- Idioma de UI: español. Textos cortos y claros para operarios.
- No romper módulos existentes: `FormTemplate`, `FormField`, `FormSubmission`, `FormSubmissionValue` solo se extienden.
