# Contrato — Módulo `operator-navbar`

## Responsabilidad única

Refactorizar la navbar del operario para situar el control de jornada (entrada/salida) como primera tab, con indicadores de estado visuales de alta legibilidad en condiciones de campo.

## Capa

Solo Frontend (React). No requiere cambios en el backend: consume los endpoints existentes del módulo `attendance`.

## Dependencias

| Recurso | Motivo |
|---|---|
| `GET /attendance/today` (EXISTENTE) | Estado de la jornada del día actual del operario |
| `GET /attendance/open` (EXISTENTE) | Verifica si hay un clock-in abierto (sin clock-out) |
| `POST /attendance/clock-in` (EXISTENTE) | Registrar entrada |
| `POST /attendance/:id/clock-out` (EXISTENTE) | Registrar salida |
| `authStore` (Zustand, EXISTENTE) | `userId` para las queries de asistencia |
| TanStack Query (EXISTENTE) | Caché y refetch automático del estado de jornada |

## Superficie pública

No tiene endpoints propios.

## Comportamiento esperado — Navbar

La navbar del operario tiene 5 tabs. El orden nuevo es:

| Posición | Tab | Descripción |
|---|---|---|
| 1 | Jornada | **Nueva posición.** Antes era la 5ta o inexistente. |
| 2 | Home | Desplazada de posición 1 a 2. |
| 3 | Formularios | Sin cambio de funcionalidad. |
| 4 | Asistencia (historial) | Sin cambio de funcionalidad. |
| 5 | Perfil | Sin cambio de funcionalidad. |

### Tab "Jornada" — estados visuales

| Estado de jornada | Label | Indicador |
|---|---|---|
| Sin entrada marcada | "Entrada" | Punto rojo pulsante (`animate-pulse`, color `signal` o rojo) |
| Entrada sin salida | "Salida" + "Desde HH:mm" | Punto verde (`bg-green-400 animate-pulse`) |
| Ambas marcadas | "✓ HH:mm – HH:mm" | Sin punto pulsante; checkmark estático |

Altura mínima del área de tap: 48px.

### Home del operario — tarjeta de jornada prominente

En la parte superior del Home, antes de cualquier otro contenido:
- Sin entrada registrada: botón grande verde "Registrar entrada" con hora actual actualizada en tiempo real (cada segundo).
- Con entrada activa: card con hora de entrada, tiempo transcurrido en tiempo real, botón rojo "Registrar salida".
- Ambas registradas: card resumen (entrada, salida, duración).

## Notas de implementación

- El tiempo transcurrido se calcula en el cliente con `setInterval` de 1s; no requiere polling al backend.
- La hora actual en el botón de registro se formatea en colombiano: `HH:mm` (24h).
- Al registrar entrada o salida, invalidar la query de TanStack Query `attendance.today` y `attendance.open` para refrescar el estado.
- El componente de la tarjeta de jornada en Home puede ser el mismo que se usa en la tab de Jornada para evitar duplicación.
