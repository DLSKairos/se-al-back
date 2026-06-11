# Contrato — Módulo `plan-limits`

## Responsabilidad única

Proveer un guard reutilizable (`PlanLimitsGuard`) que verifica, antes de crear usuarios o sedes, que la organización no ha superado los límites definidos en su `OrgConfig`. No tiene endpoints propios.

## Capa

Backend (NestJS — guard transversal).

## Dependencias

| Módulo | Motivo |
|---|---|
| `superadmin` / `OrgConfig` (NUEVO) | Lee `max_users` y `max_sites` del `OrgConfig` de la organización |
| `users` (EXISTENTE) | Cuenta usuarios activos de la org para comparar contra `max_users` |
| `work-locations` (EXISTENTE) | Cuenta sedes activas de la org para comparar contra `max_sites` |
| `redis` (EXISTENTE) | Caché de conteos con clave `plan_limits:<orgId>:users` y `plan_limits:<orgId>:sites`, TTL 30s |

## Interfaz pública

No tiene endpoints REST. Se usa como guard NestJS en los controladores correspondientes:

```typescript
// Ejemplo de uso en AdminManagementController
@Post('administrators')
@UseGuards(JwtAuthGuard, RolesGuard, PlanLimitsGuard)
@PlanLimitResource('users')   // custom decorator — indica qué recurso limitar
async createAdmin(...) { }

// Ejemplo en WorkLocationsController
@Post()
@UseGuards(JwtAuthGuard, RolesGuard, PlanLimitsGuard)
@PlanLimitResource('sites')
async createWorkLocation(...) { }
```

## Lógica del guard

```
1. Leer orgId del JWT (request.user.orgId).
2. Obtener OrgConfig de la org (con caché Redis TTL 30s).
   — Si no existe OrgConfig → permitir (org sin configuración de plan no tiene restricción activa).
3. Según el recurso decorado ('users' o 'sites'):
   — Contar activos en BD (con caché TTL 30s).
   — Si count >= max → throw ForbiddenException con mensaje:
     "Tu plan [STARTER/PROFESSIONAL] permite hasta X [usuarios/sedes].
      Contacta a Kairos para ampliar tu plan."
4. Si count < max → dejar pasar.
```

## Eventos Redis pub/sub

No emite ni consume eventos.

## Notas de implementación

- El caché de conteos (TTL 30s) acepta una leve inconsistencia (race condition entre dos creaciones simultáneas). Para el volumen esperado de SEÑAL (decenas de admins, no miles) esto es aceptable sin transacciones distribuidas.
- Si `OrgConfig` no existe para la org (ej: organizaciones creadas antes del sprint), el guard permite. Las organizaciones antiguas deben recibir un `OrgConfig` con defaults razonables en el seed/migración.
- SUPER_ADMIN está exento del guard (puede crear recursos sin restricción).
