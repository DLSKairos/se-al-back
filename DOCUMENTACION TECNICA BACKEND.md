# Documentación Técnica - prueba1gye-back

**Fecha de generación:** 2026-03-29
**Versión documentada:** rama `main` (commit `737feda`)

---

## Tabla de Contenidos

1. [Descripción General del Proyecto](#1-descripción-general-del-proyecto)
2. [Arquitectura](#2-arquitectura)
3. [Instalación y Configuración](#3-instalación-y-configuración)
4. [Base de Datos](#4-base-de-datos)
5. [API REST - Endpoints](#5-api-rest---endpoints)
6. [Autenticación y Autorización](#6-autenticación-y-autorización)
7. [Middlewares](#7-middlewares)
8. [Servicios Externos](#8-servicios-externos)
9. [Manejo de Errores](#9-manejo-de-errores)
10. [Variables de Entorno](#10-variables-de-entorno)
11. [Tareas Programadas (Cron)](#11-tareas-programadas-cron)

---

## 1. Descripción General del Proyecto

### Propósito

Backend de la aplicación **GruaMan/Bomberman**, un sistema de formularios digitales para gestión de seguridad y operaciones de campo en empresas de grúas y equipos de construcción. Permite a los operadores registrar:

- Permisos de trabajo y chequeos de seguridad (alturas, EPCC, izaje, torregrúas, elevadores).
- Planillas de bombeo de concreto.
- Control de inventarios en obra.
- Análisis de Trabajo Seguro (ATS).
- Registro de jornada laboral (horas de entrada/salida y cálculo de horas extras).
- PQR (Peticiones, Quejas y Reclamos) de seguridad y salud en el trabajo.

Los datos se pueden descargar como archivos Excel y PDF, y los documentos más importantes pueden enviarse a firma electrónica mediante la integración con Signio.

### Stack Tecnológico

| Componente | Tecnología | Versión |
|---|---|---|
| Runtime | Node.js | 20 (imagen Docker) |
| Framework HTTP | Express | ^5.1.0 |
| Base de datos | PostgreSQL | (servidor externo Render) |
| Cliente BD | pg (node-postgres) | ^8.16.3 |
| Autenticación hardware | @simplewebauthn/server | ^13.2.2 |
| Hashing de contraseñas/PIN | bcrypt | ^6.0.0 |
| Notificaciones push | web-push | ^3.6.7 |
| Tareas programadas | node-cron | ^4.2.1 |
| Generación Excel | ExcelJS | ^4.4.0 |
| Generación PDF (programático) | pdfkit | ^0.17.2 |
| Generación PDF (desde plantillas) | libreoffice-convert + ExcelJS | ^1.7.0 / ^4.4.0 |
| Manipulación PDF | pdf-lib | ^1.17.1 |
| Plantillas Word/Excel | docxtemplater + pizzip | ^3.67.6 / ^3.2.0 |
| Envío de emails | nodemailer | ^7.0.9 |
| HTTP cliente | node-fetch | ^3.3.2 |
| Manejo de fechas/zonas horarias | luxon + moment-timezone | ^3.7.2 / ^0.6.0 |
| Compresión ZIP | archiver | ^7.0.1 |
| Módulos | ES Modules (`"type": "module"`) | - |
| CORS | cors | ^2.8.5 |
| Configuración env | dotenv | ^17.2.3 |
| Contenedorización | Docker | node:20 base |

---

## 2. Arquitectura

### Estructura de Carpetas y Archivos

```
prueba1gye-back/
├── index.js                          # Punto de entrada: configuración Express, pool BD,
│                                     # migraciones idempotentes, rutas globales, cron jobs
├── package.json                      # Manifesto del proyecto (ES Modules)
├── Dockerfile                        # Imagen Docker basada en node:20 con LibreOffice
├── .env                              # Variables de entorno de producción (no commitear)
├── .env.local                        # Variables de entorno locales de desarrollo
├── .gitignore
│
├── helpers/
│   ├── dateUtils.js                  # Utilidades de fecha: formatDateOnly, parseDateLocal,
│   │                                 # todayDateString — sin desfase de zona horaria
│   ├── queryBuilder.js               # buildWhere: construye cláusulas WHERE parametrizadas
│   │                                 # a partir de query params con lista blanca de campos
│   └── pdfGenerator.js               # generarPDF: XLSX template → PDF via LibreOffice;
│                                     # generarPDFYEnviarAFirmar: PDF + envío a Signio
│
├── routes/
│   ├── auth_pin.js                   # Autenticación por PIN numérico (4-8 dígitos)
│   ├── webauthn.js                   # Passkeys/WebAuthn: registro y autenticación
│   ├── signio.js                     # Integración firma electrónica Signio (API v2)
│   │
│   ├── administrador/
│   │   ├── admin_usuarios.js         # CRUD de trabajadores (listar, agregar, estado, PIN)
│   │   ├── admin_obras.js            # CRUD de obras con geocodificación automática
│   │   ├── admin_horas_extra.js      # Cálculo de horas extras con lógica festivos Colombia,
│   │   │                             # exportación Excel/PDF/ZIP, envío email
│   │   └── registros_diarios.js      # Resumen de cumplimiento de formularios por trabajador
│   │                                 # y fecha, exportación a Excel streaming
│   │
│   ├── administrador_bomberman/
│   │   ├── planilla_bombeo_admin.js  # Consulta/descarga/PDF admin de planillas bombeo
│   │   ├── inventarios_obra_admin.js # Consulta/descarga admin de inventarios de obra
│   │   ├── inspeccion_epcc_bomberman_admin.js  # Consulta admin EPCC Bomberman
│   │   ├── checklist_admin.js        # Consulta/descarga admin de checklists
│   │   ├── herramientas_mantenimiento_admin.js # Consulta admin herramientas
│   │   └── kit_limpieza_admin.js     # Consulta admin kits de limpieza
│   │
│   ├── adminsitrador_gruaman/        # (typo en nombre: "adminsitrador")
│   │   ├── permiso_trabajo_admin.js  # Consulta/búsqueda/descarga/PDF admin permisos
│   │   ├── inspeccion_izaje_admin.js # Consulta/búsqueda/descarga admin inspecciones izaje
│   │   ├── inspeccion_EPCC_admins.js # Consulta/búsqueda/descarga admin EPCC
│   │   ├── chequeo_torregruas_admin.js  # Consulta/descarga admin chequeo torregrúas
│   │   ├── chequeo_elevador_admin.js    # Consulta/descarga admin chequeo elevador
│   │   └── chequeo_alturas_admin.js     # Consulta/descarga admin chequeo alturas
│   │
│   ├── compartido/
│   │   ├── permiso_trabajo.js        # POST permiso de trabajo (Gruaman + Bomberman)
│   │   ├── chequeo_alturas.js        # POST chequeo de alturas
│   │   └── hora_llegada_salida.js    # POST ingreso/salida jornada, cron completar salidas
│   │
│   ├── gruaman/
│   │   ├── ats.js                    # POST/GET ATS (Análisis de Trabajo Seguro)
│   │   ├── chequeo_torregruas.js     # POST chequeo torregrúas Gruaman
│   │   ├── chequeo_elevador.js       # POST chequeo elevador Gruaman
│   │   ├── inspeccion_epcc.js        # POST inspección EPCC Gruaman
│   │   └── inspeccion_izaje.js       # POST inspección izaje Gruaman
│   │
│   ├── bomberman/
│   │   ├── planillabombeo.js         # POST/GET planilla bombeo, generación PDF, envío email
│   │   ├── checklist.js              # POST/GET checklist Bomberman
│   │   ├── inventariosobra.js        # POST/GET inventarios de obra
│   │   ├── inspeccion_epcc_bomberman.js  # POST inspección EPCC Bomberman
│   │   ├── herramientas_mantenimiento.js # POST herramientas de mantenimiento
│   │   └── kit_limpieza.js           # POST kit de limpieza
│   │
│   └── sst/
│       └── pqr.js                    # POST/GET PQR (Petición, Queja o Reclamo)
│
├── scripts/
│   ├── geocode_colombia.js           # geocodeColombia: dirección → lat/lon via LocationIQ
│   ├── crear_admin_passwords.js      # Script utilitario para crear hashes de contraseñas admin
│   └── test_signio.js                # Script de prueba de la integración Signio
│
└── templates/
    ├── checklist_admin_template.xlsx        # Plantilla Excel para PDF de checklist
    └── inventario_obras_admin_template.xlsx # Plantilla Excel para PDF de inventario
```

### Patrón Arquitectónico

El proyecto no sigue una separación estricta de capas (Controller / Service / Repository). En cambio, cada módulo de ruta contiene directamente la lógica de negocio y las queries a base de datos, lo que es un patrón pragmático para un proyecto de escala media.

La única capa transversal separada son los `helpers/`, que encapsulan utilidades reutilizables de fechas, construcción de queries y generación de documentos.

La conexión a la base de datos se expone mediante `global.db` (el pool de pg), inicializado en `index.js` antes de que carguen los módulos de rutas dependientes. Los routers que necesitan la BD antes de su primer request (como `hora_llegada_salida.js`) usan un proxy diferido que resuelve `global.db` en tiempo de llamada.

---

## 3. Instalación y Configuración

### Requisitos Previos

- Node.js >= 20
- PostgreSQL >= 14 (o conexión a instancia remota)
- LibreOffice instalado en la máquina/contenedor (para generación de PDF desde plantillas XLSX)
- npm

### Instalación Local

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd prueba1gye-back

# 2. Instalar dependencias
npm install

# 3. Crear archivo de variables de entorno local
cp .env.local .env.local
# Editar .env.local con las credenciales locales

# 4. Iniciar el servidor en modo desarrollo
npm run dev

# 5. Iniciar en modo producción
npm start
```

### Con Docker

```bash
# Construir la imagen (incluye LibreOffice)
docker build -t prueba1gye-back .

# Ejecutar el contenedor
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host/db" \
  -e VAPID_PUBLIC_KEY="..." \
  -e VAPID_PRIVATE_KEY="..." \
  -e VAPID_EMAIL="mailto:..." \
  prueba1gye-back
```

La imagen Docker instala LibreOffice automáticamente y configura `LIBREOFFICE_PATH=/usr/bin/soffice`.

### Migraciones de Base de Datos

No existe un sistema de migraciones independiente. Las tablas se crean mediante sentencias `CREATE TABLE IF NOT EXISTS` ejecutadas en un IIFE asíncrono al arranque de `index.js`. Las columnas nuevas se agregan con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, lo que hace las migraciones idempotentes y seguras de ejecutar en arranques sucesivos.

---

## 4. Base de Datos

### Conexión

El pool de PostgreSQL se configura con dos modos de conexión:

- **Producción (variable `DATABASE_URL`):** Cadena de conexión completa con SSL habilitado (`rejectUnauthorized: false`).
- **Desarrollo (variables individuales):** `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT`.

### Tablas

#### `empresas`
Catálogo de empresas del sistema.

| Columna | Tipo | Restricciones |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| nombre | VARCHAR(50) | UNIQUE, NOT NULL |

Empresas configuradas: `id=1` → Gruaman, `id=2` → Bomberman.

---

#### `obras`
Catálogo de obras/proyectos con ubicación geográfica.

| Columna | Tipo | Restricciones |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| nombre_obra | VARCHAR(150) | UNIQUE, NOT NULL |
| latitud | DECIMAL(10,6) | NOT NULL |
| longitud | DECIMAL(10,6) | NOT NULL |
| constructora | VARCHAR | - |
| empresa_id | INT | FK → empresas(id) |
| activa | BOOLEAN | DEFAULT true |

---

#### `trabajadores`
Catálogo de operadores y personal de campo.

| Columna | Tipo | Restricciones |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| nombre | VARCHAR(100) | UNIQUE, NOT NULL |
| empresa_id | INT | FK → empresas(id) |
| obra_id | INT | FK → obras(id) |
| numero_identificacion | VARCHAR(50) | UNIQUE |
| empresa | VARCHAR(50) | DEFAULT '' |
| activo | BOOLEAN | - |
| cargo | VARCHAR | - |
| pin_habilitado | BOOLEAN | DEFAULT false |
| pin_hash | VARCHAR(100) | nullable (hash bcrypt del PIN) |

---

#### `horas_jornada`
Registro de jornada laboral diaria por operador.

| Columna | Tipo | Restricciones |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| nombre_cliente | VARCHAR(100) | NOT NULL |
| nombre_proyecto | VARCHAR(150) | NOT NULL |
| fecha_servicio | DATE | NOT NULL |
| nombre_operador | VARCHAR(100) | NOT NULL |
| cargo | VARCHAR(100) | nullable |
| empresa_id | INT | FK → empresas(id) |
| hora_ingreso | TIME | NOT NULL |
| hora_salida | TIME | nullable (null = jornada abierta) |
| minutos_almuerzo | INT | CHECK 1-60 |

---

#### `planilla_bombeo`
Registros de planillas de bombeo de concreto.

| Columna | Tipo | Descripción |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| nombre_cliente, nombre_proyecto | VARCHAR | Identificación del servicio |
| fecha_servicio | DATE | Fecha del trabajo |
| bomba_numero | VARCHAR(20) | Identificador de la bomba |
| hora_llegada_obra, hora_salida_obra | TIME | nullable |
| hora_inicio_acpm, hora_final_acpm | NUMERIC | Horas de consumo ACPM |
| horometro_inicial, horometro_final | DECIMAL(10,2) | Lectura del horómetro |
| nombre_operador, nombre_auxiliar | VARCHAR | Personal |
| total_metros_cubicos_bombeados | DECIMAL(10,2) | Producción |
| remision, observaciones | VARCHAR/TEXT | - |

---

#### `permiso_trabajo`
Formulario completo de permiso de trabajo en alturas.

Contiene ~50 campos: datos generales del servicio, listas de verificación de EPP/EPCC (cada uno con restricción CHECK en `'SI','NO','NA'`), equipos de acceso en altura, y firmas (nombre_suspende, nombre_responsable, nombre_coordinador).

---

#### `chequeo_alturas`
Formulario de chequeo preoperacional para trabajo en alturas (~30 campos SI/NO/NA).

---

#### `chequeo_torregruas`
Formulario de inspección de torregrúas (~25 campos SI/NO/NA).

---

#### `inspeccion_epcc`
Inspección de Equipos de Protección Contra Caídas. Incluye campos de número de serie por elemento (arnés, arrestador, mosquetón, eslinga) y campos SI/NO/NA de condición.

---

#### `inspeccion_izaje`
Inspección de elementos de izaje. Contiene datos de hasta 2 baldes de concreto, balde de escombro, canasta de material, eslingas de cadena, eslingas sintéticas y grilletes.

---

#### `chequeo_elevador`
Chequeo preoperacional de elevador de carga (~25 campos SI/NO/NA).

---

#### `ats`
Análisis de Trabajo Seguro. Contiene:
- Metadatos: tipo_ats, fecha_elaboracion, lugar_obra, contratista, operador, empresa_id.
- ~40 campos booleanos de riesgos identificados (físicos, químicos, biomecánicos, psicosociales, mecánicos, biológicos).
- 6 grupos de herramientas (TEXT).
- ~11 campos booleanos de EPP requerido.
- 9 pasos de verificación confirmados (booleanos).

Índices: `idx_ats_tipo`, `idx_ats_empresa`, `idx_ats_fecha`.

---

#### `admin_passwords`
Contraseñas de administrador hasheadas.

| Columna | Tipo | Restricciones |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| password_hash | VARCHAR(255) | NOT NULL |
| rol | VARCHAR(30) | CHECK IN ('gruaman','bomberman') |

---

#### `push_subscriptions`
Suscripciones Web Push por trabajador.

| Columna | Tipo | Restricciones |
|---|---|---|
| trabajador_id | INT | PRIMARY KEY, FK → trabajadores(id) ON DELETE CASCADE |
| subscription | JSONB | NOT NULL |

---

#### `cron_locks`
Bloqueos distribuidos para evitar ejecución duplicada de tareas cron en múltiples instancias.

| Columna | Tipo | Restricciones |
|---|---|---|
| lock_id | VARCHAR(100) | PRIMARY KEY |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

Los registros se limpian automáticamente al inicio con `DELETE WHERE created_at < NOW() - INTERVAL '1 day'`.

---

#### `pqr`
Peticiones, Quejas y Reclamos de SST.

| Columna | Tipo | Restricciones |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| nombre_cliente, nombre_proyecto | VARCHAR(255) | NOT NULL |
| fecha_servicio | DATE | NOT NULL |
| nombre_operador, nombre_director | VARCHAR(255) | NOT NULL |
| area | VARCHAR(255) | NOT NULL |
| pqr | TEXT | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

---

#### `webauthn_credenciales`
Credenciales de passkeys (WebAuthn). Creada implícitamente por el router de WebAuthn.

| Columna | Tipo | Descripción |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| numero_identificacion | VARCHAR | Identificador del trabajador |
| credential_id | TEXT | ID de credencial en formato base64url |
| public_key | TEXT | Clave pública en base64 |
| sign_count | INT | Contador anti-replay |
| tipo_autenticador | VARCHAR | Tipo de dispositivo |

---

#### `signio_documentos`
Estado de transacciones de firma electrónica. Creada por el webhook de Signio.

| Columna | Tipo | Descripción |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| id_transaccion | VARCHAR(100) | UNIQUE, ID en Signio |
| external_id | VARCHAR(100) | ID de referencia local |
| estado | VARCHAR(50) | Estado actual de la firma |
| documentos | JSONB | Datos de documentos firmados |
| fecha_actualizacion | TIMESTAMP | Última actualización |

---

#### Tablas adicionales de formularios Bomberman

Las siguientes tablas siguen el mismo patrón (campos generales + listas de verificación SI/NO/NA):

- `checklist` — Checklist diario de Bomberman.
- `inventario_obra` — Inventario de materiales y equipos en obra.
- `inspeccion_epcc_bomberman` — EPCC específico para Bomberman.
- `herramientas_mantenimiento` — Registro de herramientas en mantenimiento.
- `kit_limpieza` — Registro de kit de limpieza.

---

### Relaciones Principales

```
empresas (1) ──→ (N) trabajadores
empresas (1) ──→ (N) obras
obras    (1) ──→ (N) trabajadores
trabajadores (1) ──→ (1) push_subscriptions
```

Todos los formularios operacionales (permiso_trabajo, horas_jornada, planilla_bombeo, etc.) referencian trabajadores y obras por **nombre** (VARCHAR), no por clave foránea. Esto permite flexibilidad pero sacrifica integridad referencial estricta.

---

## 5. API REST - Endpoints

### Convenciones Generales

- **Content-Type:** `application/json` en todas las peticiones y respuestas.
- **Formato de respuesta exitosa:** `{ success: true, data, message }` o variantes según el endpoint.
- **Formato de respuesta de error:** `{ error: string, detalle?: string }` o `{ success: false, error: string }`.
- **Autenticación:** No existe JWT. Los formularios de campo son de acceso abierto. La autenticación de administrador se hace con contraseña por `POST /admin/login`. La identidad del trabajador se verifica mediante PIN o WebAuthn antes de acceder a funciones críticas.
- **Base URL:** `http://localhost:3000` (desarrollo) / `https://gruaman-bomberman-back.onrender.com` (producción).

---

### Endpoints Globales (definidos en index.js)

#### Datos Básicos de Trabajadores

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/nombres_trabajadores` | Lista nombres de trabajadores activos |
| GET | `/datos_basicos` | Datos de identidad de trabajadores activos |
| POST | `/datos_basicos` | Upsert de trabajador (crear o actualizar) |
| GET | `/trabajador_id` | Resolver ID de trabajador por 4 campos de identidad |

**GET /nombres_trabajadores**
- Query: `empresa_id` (opcional) — filtra por empresa.
- Respuesta: `{ nombres: string[] }`

**GET /datos_basicos**
- Query: `empresa_id` (opcional).
- Respuesta: `{ datos: Array<{ nombre, empresa_id, numero_identificacion, activo, cargo }> }`

**POST /datos_basicos**
- Body: `{ nombre, empresa, empresa_id, obra_id, numero_identificacion }`
- Respuesta: `{ message, trabajadorId, nombre, empresa, empresa_id, obra_id, numero_identificacion }`

**GET /trabajador_id**
- Query: `nombre`, `empresa`, `obra`, `numero_identificacion` (todos requeridos).
- Respuesta: `{ trabajadorId, nombre, empresa, obra, numero_identificacion }`

---

#### Catálogos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/obras` | Lista todas las obras con constructora y estado |
| GET | `/bombas` | Lista todos los números de bomba registrados |

---

#### Geolocalización

**POST /validar_ubicacion**
- Body: `{ obra_id: number, lat: number, lon: number }`
- Valida que las coordenadas estén dentro de 500 m de la obra registrada.
- Respuesta: `{ ok: true }` o `{ ok: false, distancia: number, message: string }`
- Las obras con nombre igual a `OBRA_BYPASS_NOMBRE` (env var) omiten la validación.

---

#### Autenticación de Administrador

**POST /admin/login**
- Body: `{ password: string }`
- Compara contra todos los hashes en `admin_passwords`.
- Respuesta: `{ success: true, rol: 'gruaman'|'bomberman' }` o `{ error: 'Contraseña incorrecta' }`
- Rate limiting: 10 intentos por IP cada 15 minutos. HTTP 429 al superar el límite.

---

#### Notificaciones Push

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/push/subscribe` | Registra/actualiza suscripción Web Push |
| GET | `/push/subscribe/schema` | Documentación del payload esperado |
| POST | `/push/test` | Envía notificación push de prueba |

**POST /push/subscribe**
- Body: `{ numero_identificacion: string, subscription: object }`
- La suscripción puede ser objeto JSON o string JSON serializado.
- Respuesta: `{ success: true, action: 'inserted'|'updated' }`

**POST /push/test**
- Body: `{ numero_identificacion: string, title: string, body: string }`
- Respuesta: `{ success: true, message: string }`

---

### Autenticación PIN (/auth/pin)

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/auth/pin/status` | Estado del PIN del trabajador | No |
| POST | `/auth/pin/set` | Crear/actualizar PIN del trabajador | No |
| POST | `/auth/pin/verify` | Verificar PIN | No |

**GET /auth/pin/status**
- Query: `numero_identificacion`
- Respuesta: `{ pinHabilitado: boolean, pinConfigurado: boolean }`

**POST /auth/pin/set**
- Body: `{ numero_identificacion: string, pin: string }` (PIN: 4-8 dígitos numéricos)
- Requiere que `pin_habilitado = true` en la BD.
- Respuesta: `{ success: true }`

**POST /auth/pin/verify**
- Body: `{ numero_identificacion: string, pin: string }`
- Rate limiting: 10 intentos por IP cada 15 minutos.
- Respuesta exitosa: `{ success: true }`
- Errores: `401` PIN incorrecto, `403` PIN no habilitado, `400` PIN no configurado (`requiereCrearPin: true`).

---

### WebAuthn / Passkeys (/webauthn)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/webauthn/hasCredential` | Verifica si el trabajador tiene passkey registrada |
| POST | `/webauthn/register/options` | Genera opciones de registro WebAuthn |
| POST | `/webauthn/register/verify` | Verifica y persiste nueva credencial |
| POST | `/webauthn/authenticate/options` | Genera opciones de autenticación |
| POST | `/webauthn/authenticate/verify` | Verifica assertion y actualiza contador |

**POST /webauthn/hasCredential**
- Body: `{ numero_identificacion: string }`
- Respuesta: `{ hasCredential: boolean }`

**POST /webauthn/register/options**
- Body: `{ numero_identificacion: string, nombre: string }`
- Respuesta: Objeto `PublicKeyCredentialCreationOptions` estándar de WebAuthn.

**POST /webauthn/register/verify**
- Body: `{ numero_identificacion: string, attestationResponse: object }`
- Respuesta: `{ success: true }`

**POST /webauthn/authenticate/options**
- Body: `{ numero_identificacion: string }`
- Respuesta: Objeto `PublicKeyCredentialRequestOptions` estándar. `404` si no hay credenciales registradas.

**POST /webauthn/authenticate/verify**
- Body: `{ numero_identificacion: string, assertionResponse: object }`
- Actualiza `sign_count` en la BD anti-replay.
- Respuesta: `{ success: true }`

---

### Firma Electrónica Signio (/signio)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/signio/enviar-firma` | Envía PDF a firma en Signio |
| POST | `/signio/webhook` | Recibe notificaciones de estado de Signio |
| GET | `/signio/estado/:id_transaccion` | Consulta estado de transacción |
| GET | `/signio/documento/:id_transaccion` | Retorna enlaces del documento firmado |
| GET | `/signio/listar` | Lista transacciones por estado |

**POST /signio/enviar-firma**
- Body:
  ```json
  {
    "nombre_documento": "string",
    "external_id": "string (opcional)",
    "pdf_base64": "string",
    "nombre_archivo": "string (opcional)",
    "firmante_principal": { "nombre": "string", "identificacion": "string", "email": "string", "tipo_identificacion": "CC", "celular": "string (opcional)" },
    "firmantes_externos": []
  }
  ```
- Respuesta: `{ success: true, id_transaccion, url_firma, mensaje }`

**POST /signio/webhook**
- Body: payload de Signio `{ id_transaccion, external_id, estado, documentos }`.
- Siempre retorna `200` para evitar reintentos.

**GET /signio/listar**
- Query: `estado` (0=todas, 2=pendientes, 3=firmadas, 4=rechazadas)

---

### Jornada Laboral (/horas_jornada)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/horas_jornada` | Últimos 100 registros |
| POST | `/horas_jornada/ingreso` | Registrar hora de entrada |
| POST | `/horas_jornada/salida` | Registrar hora de salida |
| POST | `/horas_jornada/completar-salidas` | Completar salidas pendientes manualmente |

**POST /horas_jornada/ingreso**
- Body: `{ nombre_proyecto, fecha_servicio, nombre_operador, empresa_id, hora_ingreso, nombre_cliente?, cargo?, minutos_almuerzo? }`
- Rechaza si ya existe un registro abierto para ese operador/fecha.
- Respuesta: `{ success: true, id: number }`

**POST /horas_jornada/salida**
- Body: `{ nombre_operador, fecha_servicio, hora_salida }`
- Busca el último registro abierto por `hora_ingreso DESC`.
- Respuesta: `{ success: true, id: number }`

**POST /horas_jornada/completar-salidas**
- Body: `{ fecha?: string }` (YYYY-MM-DD, por defecto ayer)
- Respuesta: `{ success: true, fecha, actualizados: number, detalle: Array }`

---

### Administración de Usuarios (/admin_usuarios)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/admin_usuarios/listar` | Lista paginada de trabajadores |
| POST | `/admin_usuarios/agregar` | Crear trabajador |
| PATCH | `/admin_usuarios/estado/:id` | Activar/desactivar trabajador |
| PATCH | `/admin_usuarios/pin/:id` | Habilitar/deshabilitar PIN |

**GET /admin_usuarios/listar**
- Query: `empresa_id` (default 1), `offset` (default 0), `limit` (default 10), `busqueda`.
- Respuesta: `{ success: true, total: number, trabajadores: Array }`

**POST /admin_usuarios/agregar**
- Body: `{ nombre, empresa_id, numero_identificacion, activo? }`
- Respuesta: `{ success: true, trabajador: object }`

**PATCH /admin_usuarios/estado/:id**
- Body: `{ activo: boolean }`

**PATCH /admin_usuarios/pin/:id**
- Body: `{ pin_habilitado: boolean }`
- Al deshabilitar, limpia el `pin_hash` almacenado.

---

### Administración de Obras (/admin_obras)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/admin_obras/listar` | Lista paginada de obras |
| POST | `/admin_obras/agregar` | Crear obra con geocodificación automática |
| PATCH | `/admin_obras/estado/:id` | Activar/desactivar obra |

**POST /admin_obras/agregar**
- Body: `{ nombre_obra, empresa_id, direccion, ciudad, constructora, activa? }`
- Geocodifica automáticamente `${direccion}, ${ciudad}, Colombia` via LocationIQ.
- Respuesta: `{ success: true, obra: object }`

---

### Horas Extra (/administrador/admin_horas_extra)

Este router provee endpoints de consulta, cálculo de horas extras y exportación de informes.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/administrador/admin_horas_extra` | Lista registros con filtros y cálculo de extras |
| GET | `/administrador/admin_horas_extra/descargar` | Descarga Excel con horas extras |
| GET | `/administrador/admin_horas_extra/descargar-pdf` | Descarga PDF individual |
| GET | `/administrador/admin_horas_extra/descargar-zip` | Descarga ZIP con todos los PDFs |
| GET | `/administrador/admin_horas_extra/enviar-email` | Envía informe por correo |

Lógica de cálculo:
- Jornada base: 7 horas 20 minutos (440 minutos).
- Festivos colombianos: fijos + móviles por año (Ley Emiliani) definidos en el código.
- Clasificación por minuto: **extra diurna** (06:00-18:59), **extra nocturna** (19:00-05:59), **extra festiva** (cualquier hora en festivo o domingo).

---

### Registros Diarios (/api)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/buscar` | Resumen de cumplimiento por trabajador/fecha |
| POST | `/api/descargar` | Exporta resumen como XLSX (streaming) |

**POST /api/buscar**
- Body: `{ nombre?, fecha_inicio?, fecha_fin?, limit? (default 200), offset? }`
- Respuesta: `{ success: true, count: number, rows: Array<{ fecha, nombre, empresa, nombre_proyecto, total_registros, formatos_llenos: string[], formatos_faltantes: string[] }> }`

**POST /api/descargar**
- Body: `{ nombre?, fecha_inicio?, fecha_fin?, limit? (default 10000) }`
- Respuesta: Archivo XLSX adjunto (`Content-Disposition: attachment`).

---

### Formularios Gruaman

#### Permiso de Trabajo Compartido
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/compartido/permiso_trabajo` | Registrar permiso de trabajo |
| GET | `/compartido/permiso_trabajo` | Listar registros |

#### Chequeo de Alturas Compartido
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/compartido/chequeo_alturas` | Registrar chequeo |
| GET | `/compartido/chequeo_alturas` | Listar registros |

#### Formularios exclusivos Gruaman
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/gruaman/chequeo_torregruas` | Chequeo preoperacional de torregrúas |
| GET | `/gruaman/chequeo_torregruas` | Listar registros |
| POST | `/gruaman/inspeccion_epcc` | Inspección EPCC Gruaman |
| GET | `/gruaman/inspeccion_epcc` | Listar registros |
| POST | `/gruaman/inspeccion_izaje` | Inspección de izaje |
| GET | `/gruaman/inspeccion_izaje` | Listar registros |
| POST | `/gruaman/chequeo_elevador` | Chequeo de elevador de carga |
| GET | `/gruaman/chequeo_elevador` | Listar registros |
| POST | `/gruaman/ats` | Análisis de Trabajo Seguro |
| GET | `/gruaman/ats` | Listar registros (query: `limit`) |

**POST /gruaman/ats** valida columnas dinámicamente contra `information_schema` para evitar inyección de campos desconocidos.

---

### Formularios Bomberman

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/bomberman/planillabombeo` | Registrar planilla de bombeo |
| GET | `/bomberman/planillabombeo` | Listar planillas |
| POST | `/bomberman/planillabombeo/:id/pdf` | Generar PDF de planilla |
| POST | `/bomberman/checklist` | Registrar checklist |
| GET | `/bomberman/checklist` | Listar checklists |
| POST | `/bomberman/inventariosobra` | Registrar inventario de obra |
| GET | `/bomberman/inventariosobra` | Listar inventarios |
| POST | `/bomberman/inspeccion_epcc_bomberman` | Inspección EPCC Bomberman |
| POST | `/bomberman/herramientas_mantenimiento` | Registro de herramientas |
| POST | `/bomberman/kit_limpieza` | Registro de kit de limpieza |

La planilla de bombeo incluye generación de PDF con PDFKit y envío automático por email a lista fija de destinatarios.

---

### Administración de Formularios (Gruaman Admin)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/administrador/permiso_trabajo` | Lista permisos (paginada) |
| GET | `/administrador/permiso_trabajo/:id` | Obtener permiso por ID |
| GET | `/administrador/permiso_trabajo/search` | Búsqueda flexible por query |
| GET | `/administrador/permiso_trabajo/:id/pdf` | Descargar PDF del permiso |
| GET | `/inspeccion_izaje_admin/...` | Mismos endpoints para izaje |
| GET | `/inspeccion_epcc_admins/...` | Mismos endpoints para EPCC |
| GET | `/chequeo_torregruas_admin/...` | Mismos endpoints para torregrúas |
| GET | `/chequeo_elevador_admin/...` | Mismos endpoints para elevador |
| GET | `/chequeo_alturas_admin/...` | Mismos endpoints para alturas |

**Búsqueda flexible (search):**
- Query params: `nombre_cliente`, `nombre_proyecto`, `fecha`, `fecha_from`, `fecha_to`, `nombre_operador`, etc.
- Implementada con `buildWhere` del helper `queryBuilder.js`.
- Si se proporciona `fecha_from` sin `fecha_to`, `fecha_to` se asigna automáticamente a la fecha de hoy.

---

### Administración de Formularios (Bomberman Admin)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/planilla_bombeo_admin/...` | Consulta/búsqueda/descarga planillas |
| GET | `/inventarios_obra_admin/...` | Consulta/búsqueda/descarga inventarios |
| GET | `/inspeccion_epcc_bomberman_admin/...` | Consulta EPCC Bomberman |
| GET | `/checklist_admin/...` | Consulta/búsqueda/descarga checklists |
| GET | `/herramientas_mantenimiento_admin/...` | Consulta herramientas |
| GET | `/kit_limpieza_admin/...` | Consulta kits de limpieza |

---

### SST (Seguridad y Salud en el Trabajo)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/sst/pqr` | Registrar PQR |
| GET | `/sst/pqr` | Listar PQR |

**POST /sst/pqr**
- Body: `{ nombre_cliente, nombre_proyecto, fecha_servicio, nombre_operador, nombre_director, area, pqr }`
- Respuesta: `{ ok: true, id: number }` — HTTP 201.

---

## 6. Autenticación y Autorización

El proyecto implementa tres mecanismos de autenticación independientes, sin JWT central:

### 6.1 Contraseña de Administrador

- **Endpoint:** `POST /admin/login`
- **Mecanismo:** Comparación bcrypt de la contraseña enviada contra todos los hashes en `admin_passwords`.
- **Sesión:** Sin estado. El frontend recibe `{ success: true, rol }` y gestiona la sesión en el cliente (localStorage/sessionStorage).
- **Rate limiting:** 10 intentos por IP en ventana de 15 minutos (implementado en memoria, no persiste entre reinicios).
- **Sin middleware de verificación:** Los endpoints de administración NO verifican un token en la request. Se confía en que el frontend solo los llama cuando el usuario está autenticado.

### 6.2 PIN Numérico

- **Propósito:** Identificación rápida de trabajadores de campo desde la PWA.
- **Habilitación:** Un administrador debe activar `pin_habilitado = true` mediante `PATCH /admin_usuarios/pin/:id`.
- **Hash:** El PIN se hashea con bcrypt (10 salt rounds) antes de almacenarse en `trabajadores.pin_hash`.
- **Flujo:** `GET /auth/pin/status` → `POST /auth/pin/set` → `POST /auth/pin/verify`.
- **Rate limiting:** 10 intentos por IP por ventana de 15 minutos en `/auth/pin/verify`.

### 6.3 WebAuthn / Passkeys

- **Propósito:** Autenticación biométrica (huella, Face ID, etc.) para trabajadores de campo.
- **Librería:** `@simplewebauthn/server` v13.
- **Almacenamiento de challenges:** En memoria (`Map`), con TTL de 5 minutos. Se limpia cada 10 minutos. **Nota conocida:** Los challenges se pierden en reinicios del servidor (cold starts en Render free-tier).
- **Credenciales persistidas:** En tabla `webauthn_credenciales` en PostgreSQL.
- **Configuración:** `WEBAUTHN_RPID`, `WEBAUTHN_RPNAME`, `WEBAUTHN_ORIGIN` via variables de entorno.
- **Sin middleware de verificación de autenticación previa** en los endpoints de formularios. La verificación se hace exclusivamente en los endpoints `/webauthn/authenticate/*`.

---

## 7. Middlewares

### 7.1 CORS

Configurado en `index.js` con la librería `cors`. Permite:
- Peticiones sin cabecera `Origin` (Postman, apps móviles nativas).
- Cualquier origen `localhost` o `127.0.0.1` en cualquier puerto.
- Origenes explícitamente listados en `allowedOrigins`:
  - Valor de `process.env.FRONTEND_URL` (si está configurado).
  - `https://gruaman-bomberman-front.onrender.com`

Rechaza con error `Not allowed by CORS` cualquier otro origen.

### 7.2 express.json()

Parser de cuerpos JSON activado globalmente. Sin límite de tamaño personalizado (usa el default de Express 5: 100kb).

### 7.3 Middleware de Disponibilidad de BD (por router)

Varios routers implementan un middleware local que verifica que `global.db` esté disponible antes de procesar cualquier request. Si no está disponible, responde:

```json
{ "error": "Base de datos no inicializada. Intenta nuevamente en unos segundos." }
```

Con código HTTP **503**. Esta verificación existe porque algunos routers se importan dinámicamente dentro del IIFE de inicio y podrían recibir requests antes de que el pool esté inicializado.

Los routers con este middleware son:
- `routes/administrador/registros_diarios.js`
- `routes/bomberman/planillabombeo.js`
- `routes/compartido/permiso_trabajo.js`
- `routes/compartido/chequeo_alturas.js`
- `routes/gruaman/ats.js`
- `routes/sst/pqr.js`

### 7.4 Rate Limiting en Memoria

Implementado manualmente (sin librería externa) en dos lugares:

- `POST /admin/login`: `adminLoginAttempts` Map en `index.js`.
- `POST /auth/pin/verify`: `pinLoginAttempts` Map en `routes/auth_pin.js`.

Patrón: ventana deslizante de 15 minutos, máximo 10 intentos por IP. HTTP 429 al superar. El contador se limpia al autenticarse con éxito.

**Limitación:** El estado se almacena en memoria. En despliegues con múltiples instancias o tras un reinicio, el contador se reinicia.

---

## 8. Servicios Externos

### 8.1 Signio - Firma Electrónica

- **URL base:** `https://signio.stage.legops.com/api/v2` (staging, configurable via `SIGNIO_API_URL`)
- **Propósito:** Enviar documentos PDF para firma electrónica de operadores y responsables.
- **Autenticación:** Token Bearer obtenido via `POST /token/crear` con email/password. Caché en memoria con TTL de 1 hora 50 minutos.
- **Flujo completo (función `enviarDocumentoAFirmar`):**
  1. `POST /transacciones/crear` — crea el sobre de firma.
  2. `POST /transacciones/cargar_documento` — sube el PDF.
  3. `POST /transacciones/registrar_contacto` — registra firmante principal + externos.
  4. `POST /transacciones/vincular` — vincula cada firmante al documento con posición de firma.
  5. `POST /transacciones/distribuir` — notifica a firmantes externos por email.
  6. `PUT /envelope/onpremise/get-signed-url` — intenta obtener URL de firma on-premise (firma en el navegador). Retorna null si el endpoint no está disponible.
- **Webhook:** Signio notifica cambios de estado a `POST /signio/webhook`.
- **Constantes de posición:** Exportadas como `POSICIONES_FIRMA` para posicionar campos de firma en coordenadas PDF (sistema de coordenadas con origen en esquina inferior izquierda, unidades pt).

### 8.2 LocationIQ - Geocodificación

- **URL:** `https://us1.locationiq.com/v1/search`
- **Propósito:** Convertir dirección textual en coordenadas lat/lon para registrar la ubicación de obras.
- **Clave API:** Hardcodeada en `scripts/geocode_colombia.js` (`pk.647f45aa...`).
- **Uso:** Solo al crear una nueva obra via `POST /admin_obras/agregar`. La dirección se envía siempre con `, Colombia` al final.

### 8.3 Web Push / VAPID - Notificaciones Push

- **Librería:** `web-push`
- **Configuración:** Claves VAPID (pública, privada, email) en variables de entorno.
- **Uso:** Notificaciones programadas vía cron jobs (ver sección 11) y endpoint de prueba `POST /push/test`.
- **TTL:** 24 horas por notificación. Urgencia: `high`.

### 8.4 SMTP - Envío de Emails

- **Librería:** `nodemailer`
- **Servidor:** Gmail (`smtp.gmail.com:465` con SSL).
- **Uso principal:** Envío de planillas de bombeo en PDF al correo `desarrolloit@gruasyequipos.com`.
- **Configuración:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

### 8.5 LibreOffice - Conversión XLSX a PDF

- **Librería:** `libreoffice-convert`
- **Propósito:** Convertir archivos Excel (.xlsx) con plantillas a PDF.
- **Ruta del ejecutable:** Configurable via `LIBREOFFICE_PATH`. Default macOS: `/Applications/LibreOffice.app/Contents/MacOS/soffice`. En Docker: `/usr/bin/soffice`.
- **Uso:** `helpers/pdfGenerator.js` lo invoca después de rellenar los marcadores `{{campo}}` en las celdas de la plantilla XLSX.

---

## 9. Manejo de Errores

### Patrón General

```javascript
try {
  // lógica
  res.json({ success: true, data });
} catch (err) {
  console.error('Mensaje descriptivo:', err);
  res.status(500).json({ error: 'Mensaje para el cliente', detalle: err.message });
}
```

Los errores se loguean con `console.error` en el servidor. No existe un sistema de logging estructurado (Winston, Pino, etc.).

### Códigos HTTP Utilizados

| Código | Cuándo se usa |
|---|---|
| 200 | Éxito general |
| 201 | Recurso creado (`POST /sst/pqr`) |
| 400 | Parámetros faltantes o inválidos |
| 401 | Credenciales incorrectas |
| 403 | Acción no permitida (PIN no habilitado, ubicación fuera de rango) |
| 404 | Recurso no encontrado |
| 409 | Conflicto (registro duplicado, inserción concurrente) |
| 429 | Rate limit excedido |
| 500 | Error interno del servidor |
| 503 | Base de datos no disponible |

### Errores de Base de Datos

Solo el endpoint `POST /push/subscribe` maneja explícitamente el código de error de PostgreSQL `23505` (unique violation) para hacer upsert en lugar de fallo. Los demás endpoints exponen el mensaje de error crudo de PostgreSQL en `detalle`.

### Webhook de Signio

El webhook `POST /signio/webhook` siempre retorna HTTP 200, incluso en caso de error interno, para evitar que Signio reintente la notificación indefinidamente.

### Errores de Geocodificación

En `POST /admin_obras/agregar`, si LocationIQ no encuentra la dirección, se retorna HTTP 400 con el mensaje de error de la API externa encapsulado en `{ success: false, error: "No se pudo obtener lat/lon: ..." }`.

---

## 10. Variables de Entorno

### Archivo de configuración

El proyecto carga variables según el entorno:
- **Producción** (`NODE_ENV=production`): `.env`
- **Desarrollo** (cualquier otro valor): `.env.local` (prioritario) + `.env` como fallback.

### Listado Completo

| Variable | Descripción | Requerida | Ejemplo |
|---|---|---|---|
| `DATABASE_URL` | Cadena de conexión completa PostgreSQL. Tiene prioridad sobre las variables `PG*` individuales. | En producción | `postgresql://user:pass@host/db` |
| `PGHOST` | Host de PostgreSQL | En desarrollo | `localhost` |
| `PGUSER` | Usuario de PostgreSQL | En desarrollo | `postgres` |
| `PGPASSWORD` | Contraseña de PostgreSQL | En desarrollo | `mi_password` |
| `PGDATABASE` | Nombre de la base de datos | En desarrollo | `postgres` |
| `PGPORT` | Puerto de PostgreSQL | No (default 5432) | `5432` |
| `PORT` | Puerto en que escucha el servidor HTTP | No (default 3000) | `3000` |
| `FRONTEND_URL` | URL del frontend permitida en CORS | No | `https://mi-frontend.com` |
| `WEBAUTHN_RPID` | ID del Relying Party WebAuthn (dominio sin protocolo) | Sí para WebAuthn | `localhost` |
| `WEBAUTHN_RPNAME` | Nombre legible del Relying Party WebAuthn | Sí para WebAuthn | `Mi App` |
| `WEBAUTHN_ORIGIN` | Origen completo permitido para WebAuthn | Sí para WebAuthn | `https://localhost:4000` |
| `VAPID_PUBLIC_KEY` | Clave pública VAPID para Web Push | Sí para push | `BAX23s_g...` |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID para Web Push | Sí para push | `Cy9oSIZD...` |
| `VAPID_EMAIL` | Email de contacto VAPID (formato `mailto:`) | Sí para push | `mailto:dev@empresa.com` |
| `LIBREOFFICE_PATH` | Ruta al ejecutable `soffice` de LibreOffice | Sí para PDF | `/usr/bin/soffice` |
| `SMTP_HOST` | Host del servidor SMTP | Sí para email | `smtp.gmail.com` |
| `SMTP_PORT` | Puerto SMTP | Sí para email | `465` |
| `SMTP_USER` | Usuario/cuenta SMTP | Sí para email | `cuenta@gmail.com` |
| `SMTP_PASS` | Contraseña o App Password SMTP | Sí para email | `xxxx xxxx xxxx xxxx` |
| `SMTP_FROM` | Dirección de remitente de emails | Sí para email | `cuenta@gmail.com` |
| `SIGNIO_API_URL` | URL base de la API de Signio | No (tiene default) | `https://signio.stage.legops.com/api/v2` |
| `SIGNIO_EMAIL` | Email de autenticación en Signio | Sí para Signio | `api@empresa.com` |
| `SIGNIO_PASSWORD` | Contraseña de autenticación en Signio | Sí para Signio | `password_signio` |
| `OBRA_BYPASS_NOMBRE` | Nombre exacto de obra que omite validación de geolocalización | No (default "LA CENTRAL") | `MI OBRA CENTRAL` |
| `WA_PHONE_NUMBER_ID` | ID de número de teléfono de WhatsApp Business API | Legado/no activo | `860177...` |
| `WA_TOKEN` | Token de WhatsApp Business API | Legado/no activo | - |
| `WA_DESTINATARIO` | Número(s) destinatario WhatsApp | Legado/no activo | `573...` |

> **Nota de seguridad:** Las variables `DATABASE_URL`, `SMTP_PASS`, `SIGNIO_PASSWORD`, `VAPID_PRIVATE_KEY` son credenciales sensibles. No deben exponerse en logs ni en respuestas de la API. El archivo `.env` no debe commitarse al repositorio (está en `.gitignore`).

---

## 11. Tareas Programadas (Cron)

Todas las tareas usan la zona horaria `America/Bogota`. Para entornos multi-instancia, se utiliza `ejecutarConLock` que inserta un registro en `cron_locks` como mutex distribuido.

### Notificaciones Push Motivacionales

| Horario Bogotá | Lock ID | Mensaje |
|---|---|---|
| 06:30 | `buenos_dias_630` | "Buenos dias! no olvides llenar todos tus permisos el dia de hoy" |
| 10:00 | `motivacion_1000` | "Animo super heroe! hoy es un gran dia..." |
| 14:00 | `seguimiento_1400` | "Como vas? todo marchando" |
| 15:25 | `progreso_1525` | "somos progreso!" |
| 17:00 | `cierre_1700` | "ya terminaste todos tus registros?" |

Destinatarios: todos los trabajadores con suscripción registrada en `push_subscriptions`.

### Notificación de Formularios Faltantes (16:00)

- Lock ID: `faltantes_1600`
- Para cada trabajador suscrito, verifica cuáles de los 7 formularios definidos (`registros_horas`, `planilla_bombeo`, `permiso_trabajo`, `chequeo_alturas`, `chequeo_torregruas`, `inspeccion_epcc`, `inspeccion_izaje`) no tienen registro en la fecha de hoy.
- Si hay faltantes, envía una notificación con la lista.

### Completar Horas de Salida (00:00 / 05:00 UTC)

- **Cron:** `0 5 * * *` (00:00 Bogotá)
- Definido en `routes/compartido/hora_llegada_salida.js`.
- Para cada operador con registro abierto del día anterior (sin `hora_salida`), calcula `hora_salida = hora_ingreso + 7h 20min` y actualiza el registro.
- También se ejecuta al iniciar el servidor (startup recovery) con un delay de 8 segundos, procesando ayer y anteayer.

---

## Notas Técnicas Adicionales

### Pool de Base de Datos como Variable Global

El pool de `pg` se expone como `global.db` para que todos los módulos de ruta puedan acceder a él sin importar el pool directamente. Esto se debe a que algunos módulos se importan dinámicamente dentro del IIFE de inicio y no pueden importar el pool estático sin crear dependencias circulares.

### Challenges WebAuthn en Memoria

Los challenges de WebAuthn se almacenan en un `Map` en memoria con TTL de 5 minutos. Esto es correcto para instancias únicas pero **pierde los challenges** en reinicios del servidor (frecuentes en Render free-tier por inactividad). Para producción robusta, los challenges deberían persistirse en la BD.

### Importación Dinámica de Routers

Dos routers se importan dinámicamente dentro del IIFE asíncrono de inicio para garantizar que `global.db` esté disponible:
- `routes/administrador/admin_horas_extra.js` → montado en `/administrador/admin_horas_extra`
- `routes/compartido/hora_llegada_salida.js` → montado en `/horas_jornada`

### Typo en Nombre de Carpeta

La carpeta de rutas admin de Gruaman se llama `adminsitrador_gruaman` (con typo: "adminsitrador" en lugar de "administrador"). Este typo está presente en toda la base de código y en las importaciones.

### Geocodificación con Clave Hardcodeada

La clave de API de LocationIQ está hardcodeada directamente en `scripts/geocode_colombia.js`. Para producción, debería migrarse a una variable de entorno.
