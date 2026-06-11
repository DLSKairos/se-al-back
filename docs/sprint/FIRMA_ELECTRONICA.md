# SEÑAL — Módulo de Firma Electrónica
## Contexto para Claude Code

---

## 1. ¿Qué es SEÑAL?

SEÑAL es un SaaS B2B colombiano de gestión de permisos de trabajo y formularios operacionales SST (Seguridad y Salud en el Trabajo). Está orientado a empresas constructoras, petroleras y cualquier sector con operaciones de alto riesgo reguladas por el Ministerio de Trabajo colombiano.

La app tiene dos modos de UX:
- **Modo Juego**: las preguntas del formulario se escriben progresivamente (efecto typewriter) y el campo de respuesta aparece solo al terminar la animación.
- **Modo Lite**: formulario tipo Google Forms, campo por campo.

Stack: React/Vite (frontend), NestJS (backend), PostgreSQL + Prisma (base de datos), Redis (cache/sesiones).

---

## 2. ¿Qué se va a implementar?

Un módulo completo de firma electrónica legalmente válida bajo la Ley 527 de 1999 y el Decreto 2364 de 2012 colombianos, construido internamente sin dependencias de plataformas externas como Auco, DocuSign o Signio.

El módulo cubre dos tipos de firmantes:
1. **Usuario interno**: operario con cuenta activa en SEÑAL.
2. **Firmante externo**: SISO, residente, inspector u otro tercero sin cuenta en SEÑAL.

---

## 3. Marco legal y por qué este diseño

### Requisitos legales (Decreto 2364 de 2012)

Una firma electrónica es válida en Colombia si:
1. **Identifica al firmante** de manera única.
2. **Demuestra voluntad** — acción afirmativa y consciente del firmante.
3. **Garantiza integridad** — cualquier modificación posterior al documento es detectable.

### Por qué NO se usa WebAuthn para firmar

WebAuthn es robusto para autenticación (login), pero insuficiente como mecanismo principal de firma en documentos SST de alto riesgo porque:
- Autentica el dispositivo y la biometría registrada, no la identidad civil de la persona.
- No captura biometría de comportamiento (trazo, velocidad, presión).
- No demuestra que el firmante leyó el contenido antes de firmar.
- Ante una ARL o juez colombiano en un accidente grave, un assertion WebAuthn es más fácil de impugnar que un trazo manuscrito con logs de lectura.

**WebAuthn se mantiene exclusivamente para login y autenticación de sesión.**

### Por qué este diseño sí es válido

El conjunto de evidencias capturadas por el módulo construye un stack probatorio sólido:
- Trazo manuscrito con datos vectoriales (biometría de comportamiento).
- Log de tiempo por pregunta/sección (prueba de lectura consciente).
- Timestamp del servidor (cuándo).
- Geolocalización (desde dónde).
- Hash del documento (integridad).
- Foto de cédula + selfie en registro de externos (identidad civil).

No requiere certificación ONAC para ser legalmente válido como firma electrónica simple.

---

## 4. Flujo de firma — Usuario interno

El usuario ya está autenticado vía WebAuthn (login). Al llegar al paso de firma del permiso:

1. El sistema presenta el contenido del permiso según el modo activo:
   - **Modo Juego**: cada pregunta se muestra con su animación. Se registra `timestamp_inicio_pregunta`, `timestamp_campo_visible` y `timestamp_respuesta` por cada pregunta.
   - **Modo Lite**: se registra `timestamp_render_campo`, `timestamp_primera_interaccion` y `timestamp_completado` por cada campo.
2. El botón "Firmar" permanece deshabilitado hasta que todas las preguntas/campos hayan sido vistos por un tiempo mínimo configurable (definido por el SST de la empresa cliente).
3. Al habilitar el botón, aparece un canvas de trazo manuscrito.
4. El usuario firma con el dedo o mouse. Se capturan los datos vectoriales del trazo (array de puntos con coordenadas x, y y timestamp de cada punto).
5. El usuario confirma la firma.

**Evidencias almacenadas en BD:**
```json
{
  "firmante_id": "uuid_usuario",
  "tipo": "interno",
  "timestamp_servidor": "ISO8601",
  "geolocalizacion": { "lat": 0.0, "lng": 0.0 },
  "log_lectura": [
    { "pregunta_id": "uuid", "segundos_vistos": 12 }
  ],
  "trazo": {
    "imagen_base64": "...",
    "vectores": [{ "x": 10, "y": 20, "t": 1234567890 }]
  },
  "hash_documento": "sha256_de_datos_canonicos",
  "sesion_webauthn_activa": true
}
```

---

## 5. Flujo de firma — Firmante externo

### 5.1 Registro del firmante por el operario

Al crear el permiso, el operario agrega los firmantes externos requeridos:
- Nombre completo
- Número de cédula
- Número de celular

Los firmantes externos quedan guardados por obra/proyecto para reutilizarse en permisos futuros sin reingresarlos.

### 5.2 Generación y envío del link

Por cada firmante externo:
- El backend genera un **token único** firmado (JWT o UUID v4 almacenado en BD), vinculado al firmante y al permiso específico.
- El token tiene expiración configurable (por defecto: 2 horas).
- El link generado es una ruta pública de la misma app: `app.señal.co/firma/:token`

En la pantalla del operario aparece la lista de firmantes con el estado de cada uno. Por cada firmante hay un botón que abre WhatsApp del dispositivo con el número del firmante precompletado y el link listo en el mensaje. Al regresar a SEÑAL, ese firmante se marca como **"Link enviado"**.

### 5.3 Vista del firmante externo (ruta pública)

La ruta `/firma/:token` es pública (no requiere autenticación de cuenta SEÑAL). El backend valida el token antes de mostrar cualquier contenido.

**Primera vez que ese firmante usa SEÑAL:**
1. Pantalla de identificación: captura foto de cédula frontal + selfie. Estas imágenes se almacenan en storage privado (acceso solo por URL firmada). Se vinculan a la cédula del firmante para no pedirlas en usos futuros.
2. Accede a la vista del permiso.

**Firmante ya registrado previamente:**
1. Accede directamente a la vista del permiso.

**Vista del permiso (solo lectura, optimizada para móvil):**
- El contenido se muestra sección por sección con un botón "Continuar" para avanzar. No es un PDF renderizado en navegador.
- Se registra el tiempo por sección.
- El botón "Firmar" se habilita solo después del tiempo mínimo por sección.
- Canvas de trazo manuscrito al final.
- Confirmación → estado del firmante: **"Firmado"**.

**Estados del firmante:**
```
Link enviado → Visto → Firmado
```
- **Link enviado**: el operario abrió WhatsApp con el link.
- **Visto**: el firmante abrió el link (se registra en el backend al validar el token).
- **Firmado**: completó el trazo y confirmó.

**Evidencias almacenadas en BD:**
```json
{
  "firmante_id": "uuid_externo",
  "tipo": "externo",
  "cedula": "1234567890",
  "celular": "+573001234567",
  "foto_cedula_key": "firmas/cedulas/uuid.jpg",
  "selfie_key": "firmas/selfies/uuid.jpg",
  "timestamp_apertura_link": "ISO8601",
  "timestamp_servidor_firma": "ISO8601",
  "geolocalizacion": { "lat": 0.0, "lng": 0.0 },
  "ip_dispositivo": "x.x.x.x",
  "log_lectura": [
    { "seccion_id": "uuid", "segundos_vistos": 18 }
  ],
  "trazo": {
    "imagen_base64": "...",
    "vectores": [{ "x": 10, "y": 20, "t": 1234567890 }]
  },
  "hash_documento": "sha256_de_datos_canonicos",
  "token_usado": "uuid_token"
}
```

---

## 6. Integridad del documento (hash)

El hash **no** se calcula sobre el archivo PDF (que puede variar entre generaciones). Se calcula sobre un **objeto canónico de datos** definido en el backend:

```typescript
// Ejemplo de estructura canónica
const datosCanonicos = {
  permiso_id: string,
  empresa_id: string,
  tipo_permiso: string,
  fecha_creacion: ISO8601,
  preguntas: [{ id: string, pregunta: string, respuesta: string }],
  firmantes: [{ cedula: string, nombre: string, rol: string }]
}

const hash = crypto.createHash('sha256')
  .update(JSON.stringify(datosCanonicos))
  .digest('hex')
```

Este hash se calcula en el momento de la firma y se almacena junto a cada registro de firma. Para verificar integridad, se regenera el objeto canónico desde BD y se compara el hash.

---

## 7. Generación del PDF

Los documentos **no se almacenan como archivos estáticos**. Se generan en el momento desde los datos en BD cuando alguien los solicita (operario, empresa, auditoría).

El PDF generado incluye:
- Contenido completo del permiso con todas las respuestas.
- Tabla de firmantes con: nombre, cédula, rol, timestamp de firma, geolocalización y hash del documento.
- Imagen del trazo manuscrito de cada firmante.
- Estado de firmas (completo/pendiente).

**Almacenamiento privado (solo lo necesario):**
- Foto cédula de firmantes externos (storage privado, acceso por URL firmada).
- Selfie de firmantes externos (mismo storage).

No se almacenan PDFs, ni trazos como archivos separados (los vectores y la imagen del trazo van en BD como JSON y base64 respectivamente).

> **NOTA DE DECISIÓN (2026-06-10):** el storage privado será **Cloudinary** (ya integrado en el backend) con assets en modo `authenticated` y URLs firmadas con expiración. NO se usa AWS S3.

---

## 8. Modo de activación del permiso

Configurable por **tipo de permiso** (no por empresa completa):

- **Modo estricto**: el permiso no se activa hasta que todos los firmantes requeridos hayan firmado. La operación no puede iniciarse formalmente en SEÑAL.
- **Modo flexible**: el permiso se activa al crearse. Las firmas se recolectan durante el tiempo de expiración del link. SEÑAL muestra alertas visuales de firmas pendientes pero no bloquea. Queda registrado explícitamente en el documento que la operación inició con firmas pendientes. La responsabilidad recae en el SST que configuró este modo.

---

## 9. Consideración de infraestructura

- La ruta `/firma/:token` es pública dentro del mismo frontend ya desplegado. No requiere un deploy adicional.
- El backend debe marcar esta ruta como pública en la configuración de autenticación (no redirigir al login de SEÑAL).
- El token expira y es de un solo uso. Si ya fue usado o expiró, se muestra pantalla de error clara con instrucciones de contacto.
- WebAuthn en el navegador embebido de WhatsApp tiene soporte limitado. Para la vista del firmante externo esto no aplica (no usa WebAuthn), pero si en algún flujo futuro se requiere, detectar el user agent y pedir al usuario que abra en Chrome/Safari.

---

## 10. Resumen de tablas nuevas en BD (referencia para el modelo de datos)

| Tabla | Propósito |
|---|---|
| `firma_tokens` | Tokens de firma externos: token, permiso_id, firmante_externo_id, expira_at, usado_at |
| `firmantes_externos` | Catálogo de externos por obra: cedula, nombre, celular, foto_cedula, selfie |
| `registros_firma` | Una fila por firma completada: todos los campos de evidencia |
| `logs_lectura` | Log tiempo por pregunta/sección: firma_id, seccion_id, segundos |

Las tablas `firma_tokens` y `firmantes_externos` son nuevas. `registros_firma` y `logs_lectura` pueden ser extensiones del modelo de permisos existente.

---

*Documento generado para handoff a Claude Code. Fecha: Abril 2026. ESTE DOCUMENTO ES LA FUENTE DE VERDAD para el módulo de firma electrónica; tiene prioridad sobre SPRINT_TAREAS.md en caso de conflicto.*
