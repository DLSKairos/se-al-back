# Contrato — Módulo `site-selection-ux`

## Responsabilidad única

Proveer al operario una pantalla de selección de obra táctil, visual e inequívoca como primer paso de su jornada. Reemplaza la pantalla actual `LocationSelectPage` con una UX rediseñada para condiciones de campo (sol, guantes, baja alfabetización digital).

## Capa

Solo Frontend (React). No requiere cambios en el backend: consume los endpoints existentes de `work-locations` y `attendance`.

## Dependencias

| Recurso | Motivo |
|---|---|
| `GET /work-locations` (EXISTENTE) | Lista las sedes activas disponibles para el usuario |
| `GET /attendance/today` (EXISTENTE) | Verifica si el usuario ya registró entrada hoy (para mostrar badge "Ya ingresaste hoy ✓") |
| `authStore` (Zustand, EXISTENTE) | Lee el `orgId` del JWT para filtrar sedes |
| Framer Motion (EXISTENTE) | Animaciones de entrada stagger y feedback de selección |

## Superficie pública

No tiene endpoints propios. Es una página React (`/location-select`) que reemplaza o actualiza `LocationSelectPage`.

## Comportamiento esperado

- Grid de tarjetas grandes (2 columnas en móvil 375px, 3 en tablet).
- Cada tarjeta: nombre de la obra en bold grande, ciudad, indicador "Activa" (punto verde pulsante) / "Inactiva", badge "Ya ingresaste hoy ✓" si corresponde.
- Buscador con filtrado local (sin llamada adicional al backend).
- Si solo hay una sede activa: pantalla de confirmación de obra única con botón grande.
- Si no hay sedes: ilustración + mensaje "Habla con tu administrador para que te asigne a una obra."
- Skeleton de tarjetas mientras carga (nunca spinner solitario).
- Al seleccionar: feedback háptico vía `navigator.vibrate(50)` si disponible + animación de checkmark.
- Animación de entrada: stagger desde abajo con Framer Motion (variante `fadeInUp`, delay escalonado por tarjeta).

## Notas de implementación

- La foto de cada obra es opcional (campo `photo_url` en `WorkLocation` si se agrega en el sprint de datos). Si no existe, usar gradiente generativo por tipo de proyecto (basado en el nombre).
- El componente debe funcionar correctamente en el navegador embebido de WhatsApp (sin WebAuthn, sin APIs avanzadas) porque los operarios pueden llegar desde un link compartido.
- Los textos en español, cortos, sin jerga técnica.
