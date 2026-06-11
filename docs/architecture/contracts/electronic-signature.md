# Contrato — Módulo `electronic-signature`

## Responsabilidad única

Gestionar el ciclo de vida completo de la firma electrónica legalmente válida (Ley 527/1999, Decreto 2364/2012 colombiano) para permisos de trabajo: identidad del firmante, evidencias probatorias, integridad del documento e integración con el flujo de aprobación.

> Fuente de verdad: `docs/sprint/FIRMA_ELECTRONICA.md`. En caso de conflicto, ese documento prevalece.

## Capa

Backend (NestJS) + Frontend (React — rutas del operario, ruta pública `/firma/:token`, panel admin).

## Dependencias

| Módulo | Motivo |
|---|---|
| `form-submissions` (EXISTENTE) | El registro de firma se vincula a un `FormSubmission` concreto |
| `form-approval-flow` (NUEVO) | Llama a `FormApprovalService.checkAutoApproval()` después de cada firma exitosa |
| `notifications` (NUEVO) | Notifica al operario y a los admins cuando el estado de firma cambia |
| `redis` (EXISTENTE) | Caché de tokens activos (clave `firma_token:<token>`, TTL = expiración del token) para validación rápida sin golpear BD |
| `cloudinary` (EXISTENTE) | Almacena foto de cédula y selfie en modo `authenticated`; acceso solo por URLs firmadas con expiración |
| `common` (EXISTENTE) | Guards de autenticación para endpoints protegidos |

## Tablas nuevas (BD)

| Tabla | Propósito |
|---|---|
| `firmantes_externos` | Catálogo reutilizable de terceros por obra: cédula, nombre, celular, foto_cedula_key, selfie_key |
| `firma_tokens` | Tokens de firma para externos: token, form_submission_id, firmante_externo_id, expires_at, used_at, estado (PENDING/SEEN/SIGNED/EXPIRED) |
| `registros_firma` | Una fila por firma completada: tipo (interno/externo), todos los campos de evidencia (IP, UA, geo, log_lectura JSON, trazo JSON/base64, hash SHA-256) |
| `logs_lectura` | Tiempo de lectura por pregunta/sección: firma_id, seccion_o_pregunta_id, segundos_vistos |

La tabla `form_signatures` (EXISTENTE) no se modifica. Convive para datos históricos.

## Superficie pública (endpoints)

```
— Firmantes externos (catálogo por obra)
GET    /signature/external-signers?workLocationId=xxx    — Catálogo reutilizable
POST   /signature/external-signers                       — Registrar nuevo firmante externo (nombre, cédula, celular)

— Tokens de firma
POST   /signature/tokens                                 — Generar token para un firmante externo en un submission
  Body: { formSubmissionId, firmanteExternoId }
  Guard: JWT (operario dueño del submission o admin)
  Devuelve: { token, link: "https://app.señal.co/firma/:token", expiresAt }

GET    /signature/tokens/:submissionId/status            — Estado de cada firmante del submission

— Firma (operario interno — autenticado)
POST   /signature/sign/internal
  Guard: JWT
  Body: { formSubmissionId, traceVectors, traceImageBase64, geoLat, geoLng, readingLog[] }

— Firma (firmante externo — ruta pública)
GET    /firma/:token                                     — Valida token, marca estado "SEEN", devuelve contenido del permiso
POST   /firma/:token/sign                                — Registrar firma del externo
  Body: { traceVectors, traceImageBase64, geoLat, geoLng, readingLog[], cedula }
  Pública (no requiere JWT SEÑAL)

— Identidad del externo (primera vez)
POST   /firma/:token/identity                            — Subir foto cédula + selfie a Cloudinary privado
  Body: multipart/form-data { fotoCedula, selfie }
  Pública (solo con token válido)

— Verificación de integridad
GET    /signature/:submissionId/verify                   — Recalcula SHA-256 y compara con el almacenado

— Panel admin — gestión
GET    /admin/submissions/:id/signers                    — Lista firmantes con estado
POST   /admin/submissions/:id/resend-signature           — Regenerar token (invalida anterior) y devolver nuevo link
  Body: { firmanteExternoId }
  Guard: ADMIN, SUPER_ADMIN
```

## Eventos Redis pub/sub

| Canal | Dirección | Trigger | Payload |
|---|---|---|---|
| `signature.completed` | Emite | Cuando `registros_firma` se crea exitosamente | `{ submissionId, firmanteId, tipo: 'interno' \| 'externo' }` |

`form-approval-flow` consume `signature.completed` (o `SignatureService` llama directamente a `FormApprovalService.checkAutoApproval()` — a decisión del backend-dev; la llamada directa es más simple para este tamaño de proyecto).

## Modo de activación del permiso

Configurable por `FormTemplate`. Dos modos:
- **Estricto**: el submission no pasa a `APPROVED` hasta que todos los firmantes requeridos hayan firmado.
- **Flexible**: el submission puede marcarse activo con firmas pendientes; queda registrado explícitamente en el documento.

El campo `signature_mode` se agrega a `FormTemplate` en el Bloque 2 del sprint.

## Hash de integridad

Se calcula sobre el objeto canónico (no sobre PDF):
```
SHA-256( JSON.stringify({ permiso_id, empresa_id, tipo_permiso, fecha_creacion, preguntas[], firmantes[] }) )
```

Se almacena en `registros_firma.hash_documento`. La verificación recalcula desde BD y compara.

## Storage Cloudinary (privado)

- Fotos de cédula: carpeta `firmas/cedulas/` — delivery type `authenticated`.
- Selfies: carpeta `firmas/selfies/` — delivery type `authenticated`.
- Acceso siempre por URL firmada con expiración (nunca URL pública directa).

## Feature flag

| Flag | Controla |
|---|---|
| `feature:electronic_signature` | Activa el flujo nuevo; si off, el formulario usa `form-signatures` legado |
