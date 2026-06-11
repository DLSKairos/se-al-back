# Contrato — Módulo `form-approval-flow`

## Responsabilidad única

Gestionar la lógica de transición de estados de un `FormSubmission`: auto-aprobación cuando se cumplen todas las condiciones (campos completos + firmas), y rechazo manual por admin con motivo obligatorio. La aprobación manual no existe.

## Capa

Backend (NestJS — service + controller). Frontend (React — estados diferenciados en panel admin, botón de rechazo).

## Dependencias

| Módulo | Motivo |
|---|---|
| `form-submissions` (EXISTENTE) | Lee y actualiza el estado y campos del `FormSubmission` |
| `electronic-signature` (NUEVO) | Consulta el estado de cada firmante para determinar si las firmas están completas |
| `notifications` (NUEVO) | Notifica al operario (FORM_APPROVED / FORM_REJECTED) y a los admins (FORM_SUBMITTED) |
| `common` (EXISTENTE) | Guard `RolesGuard(ADMIN, SUPER_ADMIN)` para el endpoint de rechazo |

## Superficie pública (endpoints)

```
— Auto-aprobación (invocación interna, no expuesta directamente al cliente)
  FormApprovalService.checkAutoApproval(formSubmissionId: string): Promise<void>
  — Invocado por ElectronicSignatureService después de cada firma exitosa.
  — También invocado al crear/actualizar un FormSubmission con todos los campos completos.

— Rechazo manual
PATCH /admin/submissions/:id/reject
  Guard: ADMIN, SUPER_ADMIN
  Body: { reason: string }   // mínimo 10 caracteres
  — Solo aplicable a submissions en estado SUBMITTED o PENDING_SIGNATURES.
  — Actualiza status → REJECTED, rejected_at, rejected_by_admin_id, rejection_reason.
  — Crea notificación FORM_REJECTED para el operario con el motivo.

— Listado con filtro de estado (extensión del endpoint existente)
GET /admin/submissions?status=PENDING_SIGNATURES|SUBMITTED|APPROVED|REJECTED
  — El estado PENDING_SIGNATURES se muestra en UI como "En revisión".
  — Sin cambios en el endpoint base; solo se agrega el valor al enum de filtro.
```

## Lógica de auto-aprobación (`checkAutoApproval`)

```
1. Cargar FormSubmission con sus FormSubmissionValues y el FormTemplate asociado.
2. Verificar campos obligatorios:
   — Para cada FormField con required = true, debe existir un FormSubmissionValue
     con valor no nulo/vacío.
3. Verificar firmas (si el template tiene signature_frequency != NONE):
   — Obtener todos los registros de firma del submission (firmantes internos + externos).
   — Todos deben estar en estado SIGNED.
4. Si ambas condiciones se cumplen:
   — status → APPROVED, auto_approved_at → now().
   — Crear notificación FORM_APPROVED para el operario.
   — Crear notificación FORM_APPROVED para cada ADMIN de la organización.
5. Si hay al menos un firma_token en estado PENDING o SEEN:
   — status → PENDING_SIGNATURES (si aún no estaba así).
6. Si no hay firmas pendientes pero faltan campos:
   — No cambiar estado (permanece SUBMITTED).
```

## Eventos Redis pub/sub

No emite eventos propios. Recibe la invocación de forma directa desde `ElectronicSignatureService` (llamada de función, no pub/sub — suficiente para el tamaño del proyecto).

## Estados del submission y transiciones válidas

```
DRAFT
  → SUBMITTED         (al enviar el operario)

SUBMITTED
  → PENDING_SIGNATURES  (cuando hay firma pendiente detectada)
  → APPROVED            (auto: todos los campos + firmas OK)
  → REJECTED            (manual por admin)

PENDING_SIGNATURES
  → APPROVED            (auto: todas las firmas completadas)
  → REJECTED            (manual por admin)

APPROVED  → estado terminal
REJECTED  → estado terminal
```

## Cambios sobre endpoints existentes

- `PATCH /submissions/:id/status` (EXISTENTE): se elimina la capacidad de transicionar a `APPROVED`. Si el enum del body incluye `APPROVED`, el servicio lanza `ForbiddenException: "La aprobación es solo automática."`. Se conserva la transición a `REJECTED` mediante este endpoint legado hasta que esté listo el nuevo endpoint `/admin/submissions/:id/reject`.
