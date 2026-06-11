# Contrato — Módulo `loading-feedback`

## Responsabilidad única

Proveer feedback visual claro durante las dos operaciones más críticas de la UX: la carga de sesión inicial (login / bootstrap) y el envío/firma de formularios. Reemplaza spinners genéricos con overlays informativos y progresivos.

## Capa

Principalmente Frontend (React — componente `<VerifyingOverlay />`). Backend contribuye con un endpoint mínimo (`GET /status/user-context`).

## Dependencias

### Frontend
| Recurso | Motivo |
|---|---|
| `authStore` (Zustand, EXISTENTE) | Detecta el estado de autenticación para mostrar/ocultar el overlay de sesión |
| `GET /status/user-context` (NUEVO) | Contexto mínimo del usuario para confirmar que la sesión es válida |
| Framer Motion (EXISTENTE) | Animación de la barra de progreso y transición del overlay |

### Backend
| Módulo | Motivo |
|---|---|
| `users` (EXISTENTE) | Nombre del usuario autenticado |
| `organizations` (EXISTENTE) | Nombre de la organización |
| `work-locations` (EXISTENTE) | Sede/obra actualmente asignada |
| `redis` (EXISTENTE) | Caché del resultado con clave `user_context:<userId>`, TTL 60s |

## Superficie pública (backend)

```
GET /status/user-context
  Guard: JWT
  Cache: Redis TTL 60s, clave user_context:<userId>
  Objetivo de rendimiento: < 300ms
  Respuesta:
  {
    userId: string;
    name: string;
    orgId: string;
    orgName: string;
    role: UserRole;
    workLocationId: string | null;
    workLocationName: string | null;
  }
  — Consultas en Promise.all([getUser, getOrg, getWorkLocation]).
  — Sin relaciones pesadas; solo los campos listados.
```

## Comportamiento del componente `<VerifyingOverlay />`

### Escenario 1 — Login / carga de sesión

- Overlay pantalla completa.
- Logo SEÑAL centrado.
- Texto: "Verificando tu información..."
- Barra de progreso animada (no indeterminada, sino interpolada de 0 a 90% en 2s, luego salta a 100% cuando llega la respuesta).
- Si la respuesta tarda más de 4s: texto adicional "Esto está tardando más de lo habitual..."
- Operario: tipografía grande (`text-2xl`). Admin: tipografía normal.

### Escenario 2 — Envío de formulario o firma

- Overlay parcial (solo el área de contenido; el sidebar del admin permanece visible).
- Icono de escudo animado o checkmark giratorio.
- Texto: "Registrando tu información de forma segura..."
- Sin barra de progreso (operación puntual).

## Notas de implementación

- `<VerifyingOverlay />` es un componente de `src/components/ui/` en el frontend (compartido).
- Se controla con un estado local del componente padre o con un flag en `authStore` (`isBootstrapping: boolean`).
- El overlay de firma lo activa el componente de firma electrónica cuando llama a `POST /firma/:token/sign` o `POST /signature/sign/internal`.
