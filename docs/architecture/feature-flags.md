# SEÑAL — Diseño del sistema de feature flags

> Este documento describe el diseño para implementación por el backend-dev. No contiene código fuente a crear.

---

## 1. Motivación

Las credenciales de OAuth (Google, Microsoft) y la configuración de firma electrónica aún no están disponibles. El sistema de feature flags permite desplegar el código completo en producción y activar cada funcionalidad cuando las credenciales estén listas, sin necesidad de un nuevo deploy.

---

## 2. Flags definidos para este sprint

| Flag Redis | Funcionalidad que controla | Valor por defecto (ausente) |
|---|---|---|
| `feature:oauth_google` | Login OAuth con Google para ADMIN/SUPER_ADMIN | `off` |
| `feature:oauth_microsoft` | Login OAuth con Microsoft para ADMIN/SUPER_ADMIN | `off` |
| `feature:electronic_signature` | Módulo de firma electrónica completo | `off` |
| `feature:magic_link` | Generación y validación de magic links para admins | `off` |
| `feature:superadmin_panel` | Secciones nuevas del panel /super (OrgConfig, métricas, magic link) | `off` |

**Regla de ausencia:** si la clave no existe en Redis, el flag se trata como `off`. Nunca lanzar error por clave ausente.

---

## 3. Estructura de claves en Redis

```
feature:<nombre>   →   valor: "on" | "off"
```

Ejemplos:
```
feature:oauth_google          "on"
feature:oauth_microsoft       "off"
feature:electronic_signature  "off"
feature:magic_link            "on"
feature:superadmin_panel      "on"
```

No se usan estructuras complejas (hashes, listas). Valor string simple, lectura O(1).

---

## 4. Servicio NestJS — `FeatureFlagsService`

### Ubicación sugerida

`src/common/feature-flags/feature-flags.service.ts` (dentro de `CommonModule` que ya exporta guards y decoradores).

### Interfaz esperada

```typescript
class FeatureFlagsService {
  // Lee el flag. Si no existe en Redis → false.
  isEnabled(flag: string): Promise<boolean>

  // Equivalente síncrono usando caché local.
  isEnabledSync(flag: string): boolean

  // Refresca la caché local con todos los flags conocidos.
  // Llamar al arrancar la app y cada 30s en segundo plano.
  refreshCache(): Promise<void>
}
```

### Caché local (en memoria)

Para no golpear Redis en cada request, `FeatureFlagsService` mantiene un `Map<string, boolean>` en memoria con TTL de 30 segundos. El ciclo de vida:

```
Al arrancar NestJS (onModuleInit):
  1. Leer todos los flags conocidos de Redis (MGET o GET individual por cada uno).
  2. Poblar el Map interno.
  3. Iniciar un setInterval de 30s que llama a refreshCache().

En isEnabled(flag):
  1. Si el flag está en el Map y no expiró → retornar del Map (sin Redis).
  2. Si no → leer de Redis, actualizar Map, retornar.

En isEnabledSync(flag):
  — Solo consulta el Map. Si no está → retorna false (conservador).
  — Usar solo donde no se puede await.
```

El TTL de 30s significa que activar un flag tarde como máximo 30 segundos en propagarse a todas las instancias. Aceptable para este caso de uso (activación manual por admin de Kairos).

---

## 5. Uso en controladores NestJS

### Opción A — Guard por endpoint

```typescript
// Implementar un FeatureFlagGuard reutilizable
@Get('auth/google')
@UseGuards(FeatureFlagGuard('oauth_google'))
async googleAuth() { ... }
```

El guard llama a `featureFlagsService.isEnabled(flagName)`. Si `false` → `NotFoundException` (404, no 403 — no revelar que el endpoint existe pero está desactivado).

### Opción B — Verificación en servicio

Para lógica condicional dentro de un método de servicio:

```typescript
if (!(await this.featureFlags.isEnabled('electronic_signature'))) {
  // usar flujo legado form-signatures
  return this.legacySignatureFlow(dto);
}
// usar flujo nuevo electronic-signature
return this.newSignatureFlow(dto);
```

---

## 6. Endpoint público para el frontend

El frontend necesita saber qué features están activas para mostrar u ocultar elementos de UI (botones OAuth, sección de firma, etc.).

```
GET /feature-flags
  — Público (sin guard JWT). Cache-Control: max-age=30.
  — Devuelve solo los flags relevantes para la UI (no todos los flags internos).
  Respuesta:
  {
    oauth_google: boolean;
    oauth_microsoft: boolean;
    electronic_signature: boolean;
    magic_link: boolean;
    superadmin_panel: boolean;
  }
```

El frontend consulta este endpoint al arrancar (una sola vez, con caché TanStack Query staleTime 30s) y usa los valores para renderizado condicional. No implementar feature flags complejos en el frontend: solo leer este endpoint y aplicar condiciones `if (flags.oauth_google)`.

---

## 7. Cómo activar / desactivar un flag

### Desde redis-cli (operación de Kairos)

```bash
# Activar
redis-cli SET feature:oauth_google "on"

# Desactivar
redis-cli SET feature:oauth_google "off"

# Verificar estado de todos los flags
redis-cli MGET feature:oauth_google feature:oauth_microsoft \
              feature:electronic_signature feature:magic_link \
              feature:superadmin_panel
```

### Desde endpoint superadmin (futuro, no en este sprint)

En un sprint posterior se puede agregar:
```
PATCH /superadmin/feature-flags/:flag
  Guard: SUPER_ADMIN
  Body: { enabled: boolean }
```
Por ahora, redis-cli es suficiente.

---

## 8. Estado inicial en el entorno

Al hacer el primer deploy del sprint, ejecutar manualmente:

```bash
# Todos off por defecto (confirma el estado conservador)
redis-cli SET feature:oauth_google "off"
redis-cli SET feature:oauth_microsoft "off"
redis-cli SET feature:electronic_signature "off"
redis-cli SET feature:magic_link "off"
redis-cli SET feature:superadmin_panel "off"
```

Activar uno a uno a medida que las credenciales estén disponibles y se hayan verificado en staging.

---

## 9. Variables de entorno relacionadas

Los flags en Redis controlan si el feature está activo. Las credenciales van en `.env`. Ambos son necesarios para que un feature funcione: el flag puede estar `on` pero si falta la variable de entorno, el servicio lanzará error en tiempo de ejecución.

```env
# Agregar a .env.example
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=

MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_CALLBACK_URL=
MICROSOFT_TENANT_ID=common

ENCRYPTION_KEY=           # 32 bytes hex — AES-256 para tokens OAuth
MAGIC_LINK_SECRET=        # clave HMAC si se usan JWT en lugar de UUID4
MAGIC_LINK_BASE_URL=      # ej: https://app.señal.co
```
