import express from "express";
import cors from "cors";
import pkg from "pg";
import bcrypt from "bcrypt";
import webpush from "web-push";
import cron from "node-cron";
import permisoTrabajoRouter from "./routes/compartido/permiso_trabajo.js";
import adminUsuariosRouter from "./routes/administrador/admin_usuarios.js";
import adminObrasRouter from "./routes/administrador/admin_obras.js";
import adminDashboardRouter from "./routes/administrador/admin_dashboard.js";
// adminHorasExtraRouter se importa dinámicamente dentro del IIFE de inicio para
// garantizar que global.db esté disponible antes de que se evalúe el módulo.
import webauthnRouter from './routes/webauthn.js';
import registrosDiariosRouter from './routes/administrador/registros_diarios.js';
import authPinRouter from './routes/auth_pin.js';

import dotenv from "dotenv";
if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: ".env" });
} else {
  dotenv.config({ path: [".env.local", ".env"] });
}

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Envía una notificación Web Push a una suscripción con un TTL de 24 horas
 * y urgencia alta.
 * @param {object} subscription - Objeto PushSubscription (endpoint + keys).
 * @param {{ title: string, body: string, icon?: string, url?: string }} payload
 * @returns {Promise<void>}
 */
async function sendPushNotification(subscription, payload) {
  const options = {
    TTL: 86400,
    headers: {
      'Content-Type': 'application/json',
      'Urgency': 'high'
    }
  };
  return webpush.sendNotification(
    subscription,
    JSON.stringify(payload),
    options
  );
}

const { Pool } = pkg;
const app = express();

/**
 * Orígenes CORS permitidos. Las solicitudes sin cabecera de origen (Postman, apps móviles)
 * y cualquier origen de localhost o 127.0.0.1 siempre se permiten.
 */
const allowedOrigins = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use('/webauthn', webauthnRouter);
app.use('/auth/pin', authPinRouter);
app.use('/api', registrosDiariosRouter);

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.PGHOST || "localhost",
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "",
      database: process.env.PGDATABASE || "postgres",
      port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
    });

global.db = pool;

/**
 * IIFE de inicio: ejecuta todas las migraciones idempotentes CREATE TABLE / ALTER TABLE,
 * luego importa y monta dinámicamente los routers que dependen de global.db.
 */
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS empresas (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(50) UNIQUE NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS obras (
      id SERIAL PRIMARY KEY,
      nombre_obra VARCHAR(150) UNIQUE NOT NULL,
      latitud DECIMAL(10,6) NOT NULL,
      longitud DECIMAL(10,6) NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trabajadores (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) UNIQUE NOT NULL,
      empresa_id INT REFERENCES empresas(id),
      obra_id INT REFERENCES obras(id),
      numero_identificacion VARCHAR(50) UNIQUE,
      empresa VARCHAR(50) NOT NULL DEFAULT ''
    );
  `);

  await pool.query(`ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS pin_habilitado BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
  await pool.query(`ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(100)`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS horas_jornada (
      id SERIAL PRIMARY KEY,
      nombre_cliente VARCHAR(100) NOT NULL,
      nombre_proyecto VARCHAR(150) NOT NULL,
      fecha_servicio DATE NOT NULL,
      nombre_operador VARCHAR(100) NOT NULL,
      cargo VARCHAR(100),
      empresa_id INT REFERENCES empresas(id),
      hora_ingreso TIME NOT NULL,
      hora_salida TIME,
      minutos_almuerzo INT CHECK (minutos_almuerzo >= 1 AND minutos_almuerzo <= 60)
    );
  `);
  await pool.query(`ALTER TABLE horas_jornada ADD COLUMN IF NOT EXISTS id SERIAL`).catch(() => {});
  await pool.query(`ALTER TABLE horas_jornada ALTER COLUMN hora_salida DROP NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE horas_jornada ALTER COLUMN cargo DROP NOT NULL`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS permiso_trabajo (
      id SERIAL PRIMARY KEY,
      nombre_cliente VARCHAR(100) NOT NULL,
      nombre_proyecto VARCHAR(150) NOT NULL,
      fecha_servicio DATE NOT NULL,
      nombre_operador VARCHAR(100) NOT NULL,
      cargo VARCHAR(100) NOT NULL,
      trabajo_rutinario VARCHAR(10) CHECK (trabajo_rutinario IN ('SI','NO','NA')),
      tarea_en_alturas VARCHAR(10) CHECK (tarea_en_alturas IN ('SI','NO','NA')),
      altura_inicial VARCHAR(20),
      altura_final VARCHAR(20),
      herramientas_seleccionadas TEXT,
      herramientas_otros VARCHAR(200),
      certificado_alturas VARCHAR(10) CHECK (certificado_alturas IN ('SI','NO','NA')),
      seguridad_social_arl VARCHAR(10) CHECK (seguridad_social_arl IN ('SI','NO','NA')),
      casco_tipo1 VARCHAR(10) CHECK (casco_tipo1 IN ('SI','NO','NA')),
      gafas_seguridad VARCHAR(10) CHECK (gafas_seguridad IN ('SI','NO','NA')),
      proteccion_auditiva VARCHAR(10) CHECK (proteccion_auditiva IN ('SI','NO','NA')),
      proteccion_respiratoria VARCHAR(10) CHECK (proteccion_respiratoria IN ('SI','NO','NA')),
      guantes_seguridad VARCHAR(10) CHECK (guantes_seguridad IN ('SI','NO','NA')),
      botas_punta_acero VARCHAR(10) CHECK (botas_punta_acero IN ('SI','NO','NA')),
      ropa_reflectiva VARCHAR(10) CHECK (ropa_reflectiva IN ('SI','NO','NA')),
      arnes_cuerpo_entero VARCHAR(10) CHECK (arnes_cuerpo_entero IN ('SI','NO','NA')),
      arnes_cuerpo_entero_dielectico VARCHAR(10) CHECK (arnes_cuerpo_entero_dielectico IN ('SI','NO','NA')),
      mosqueton VARCHAR(10) CHECK (mosqueton IN ('SI','NO','NA')),
      arrestador_caidas VARCHAR(10) CHECK (arrestador_caidas IN ('SI','NO','NA')),
      eslinga_absorbedor VARCHAR(10) CHECK (eslinga_absorbedor IN ('SI','NO','NA')),
      eslinga_posicionamiento VARCHAR(10) CHECK (eslinga_posicionamiento IN ('SI','NO','NA')),
      linea_vida VARCHAR(10) CHECK (linea_vida IN ('SI','NO','NA')),
      eslinga_doble VARCHAR(10) CHECK (eslinga_doble IN ('SI','NO','NA')),
      verificacion_anclaje VARCHAR(10) CHECK (verificacion_anclaje IN ('SI','NO','NA')),
      procedimiento_charla VARCHAR(10) CHECK (procedimiento_charla IN ('SI','NO','NA')),
      medidas_colectivas_prevencion VARCHAR(10) CHECK (medidas_colectivas_prevencion IN ('SI','NO','NA')),
      epp_epcc_buen_estado VARCHAR(10) CHECK (epp_epcc_buen_estado IN ('SI','NO','NA')),
      equipos_herramienta_buen_estado VARCHAR(10) CHECK (equipos_herramienta_buen_estado IN ('SI','NO','NA')),
      inspeccion_sistema VARCHAR(10) CHECK (inspeccion_sistema IN ('SI','NO','NA')),
      plan_emergencia_rescate VARCHAR(10) CHECK (plan_emergencia_rescate IN ('SI','NO','NA')),
      medidas_caida VARCHAR(10) CHECK (medidas_caida IN ('SI','NO','NA')),
      kit_rescate VARCHAR(10) CHECK (kit_rescate IN ('SI','NO','NA')),
      permisos VARCHAR(10) CHECK (permisos IN ('SI','NO','NA')),
      condiciones_atmosfericas VARCHAR(10) CHECK (condiciones_atmosfericas IN ('SI','NO','NA')),
      distancia_vertical_caida VARCHAR(10) CHECK (distancia_vertical_caida IN ('SI','NO','NA')),
      otro_precausiones TEXT,
      vertical_fija VARCHAR(10) CHECK (vertical_fija IN ('SI','NO','NA')),
      vertical_portatil VARCHAR(10) CHECK (vertical_portatil IN ('SI','NO','NA')),
      andamio_multidireccional VARCHAR(10) CHECK (andamio_multidireccional IN ('SI','NO','NA')),
      andamio_colgante VARCHAR(10) CHECK (andamio_colgante IN ('SI','NO','NA')),
      elevador_carga VARCHAR(10) CHECK (elevador_carga IN ('SI','NO','NA')),
      canasta VARCHAR(10) CHECK (canasta IN ('SI','NO','NA')),
      ascensores VARCHAR(10) CHECK (ascensores IN ('SI','NO','NA')),
      otro_equipos TEXT,
      observaciones TEXT,
      motivo_suspension TEXT,
      nombre_suspende VARCHAR(100) NOT NULL,
      nombre_responsable VARCHAR(100) NOT NULL,
      nombre_coordinador VARCHAR(100)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_passwords (
      id SERIAL PRIMARY KEY,
      password_hash VARCHAR(255) NOT NULL,
      rol VARCHAR(30) NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      trabajador_id INT PRIMARY KEY,
      subscription JSONB NOT NULL,
      FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cron_locks (
      lock_id VARCHAR(100) PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`DELETE FROM cron_locks WHERE created_at < NOW() - INTERVAL '1 day'`).catch(() => {});

  const { default: adminHorasExtraRouter } = await import("./routes/administrador/admin_horas_extra.js");
  app.use("/administrador/admin_horas_extra", adminHorasExtraRouter);

  const { default: horaJornadaRouter } = await import("./routes/compartido/hora_llegada_salida.js");
  app.use("/horas_jornada", horaJornadaRouter);
})();

/**
 * POST /push/test
 * Envía una notificación push de prueba a un trabajador específico identificado por numero_identificacion.
 * @body {{ numero_identificacion: string, title: string, body: string }}
 * @returns {{ success: boolean, message: string }}
 */
app.post("/push/test", async (req, res) => {
  const { numero_identificacion, title, body } = req.body;
  if (!numero_identificacion || !title || !body) {
    return res.status(400).json({ error: "Faltan parámetros obligatorios (numero_identificacion, title, body)" });
  }
  try {
    const workerRes = await pool.query(
      `SELECT ps.subscription FROM trabajadores t JOIN push_subscriptions ps ON ps.trabajador_id = t.id WHERE t.numero_identificacion = $1`,
      [String(numero_identificacion)]
    );
    if (workerRes.rows.length === 0) {
      return res.status(404).json({ error: "Suscripción no encontrada para ese trabajador" });
    }
    const subscription = workerRes.rows[0].subscription;
    try {
      await sendPushNotification(subscription, {
        title,
        body,
        icon: `${process.env.FRONTEND_URL || ''}/icon-192.png`,
        url: "/"
      });
      return res.json({ success: true, message: "Notificación enviada" });
    } catch (err) {
      console.error("Error enviando notificación de prueba:", err);
      return res.status(500).json({ error: "Error enviando notificación", detalle: err.message });
    }
  } catch (error) {
    console.error("Error en /push/test:", error);
    return res.status(500).json({ error: "Error interno", detalle: error.message });
  }
});

app.use("/admin/dashboard", adminDashboardRouter);
app.use("/admin_usuarios", adminUsuariosRouter);
app.use("/admin_obras", adminObrasRouter);
// /administrador/admin_horas_extra se monta dentro del IIFE de inicio
app.use("/compartido/permiso_trabajo", permisoTrabajoRouter);
// /horas_jornada se monta dentro del IIFE de inicio

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`API corriendo en http://localhost:${PORT} (PostgreSQL conectado)`)
);

/**
 * GET /nombres_trabajadores
 * Retorna los nombres de todos los trabajadores activos, opcionalmente filtrados por empresa_id.
 * @query {{ empresa_id?: number }}
 * @returns {{ nombres: string[] }}
 */
app.get("/nombres_trabajadores", async (req, res) => {
  try {
    const { empresa_id } = req.query;
    let result;
    if (empresa_id) {
      result = await pool.query(
        `SELECT nombre FROM trabajadores WHERE empresa_id = $1 AND activo = true`,
        [empresa_id]
      );
    } else {
      result = await pool.query(`SELECT nombre FROM trabajadores WHERE activo = true`);
    }
    const nombres = result.rows.map(row => row.nombre);
    res.json({ nombres });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener los nombres de trabajadores" });
  }
});

/**
 * POST /datos_basicos
 * Hace upsert de un registro de trabajador. Crea la fila si el trabajador no existe;
 * de lo contrario actualiza empresa_id, obra_id, numero_identificacion y empresa
 * solo cuando los valores almacenados difieren de los de la solicitud entrante.
 * @body {{ nombre: string, empresa: string, empresa_id: number, obra_id: number, numero_identificacion: string }}
 * @returns {{ message: string, trabajadorId: number, nombre: string, empresa: string, empresa_id: number, obra_id: number, numero_identificacion: string }}
 */
app.post("/datos_basicos", async (req, res) => {
  const { nombre, empresa, empresa_id, obra_id, numero_identificacion } = req.body;

  if (!nombre || !empresa || !empresa_id || !obra_id || !numero_identificacion) {
    return res.status(400).json({ error: "Faltan parámetros obligatorios" });
  }

  try {
    const trabajador = await pool.query(
      `SELECT id, empresa_id, obra_id, numero_identificacion FROM trabajadores WHERE nombre = $1`,
      [nombre]
    );
    let trabajadorId;
    if (trabajador.rows.length === 0) {
      const result = await pool.query(
        `INSERT INTO trabajadores (nombre, empresa_id, obra_id, numero_identificacion, empresa)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [nombre, empresa_id, obra_id, numero_identificacion, empresa]
      );
      trabajadorId = result.rows[0].id;
    } else {
      trabajadorId = trabajador.rows[0].id;
      if (trabajador.rows[0].empresa_id !== empresa_id)
        await pool.query(`UPDATE trabajadores SET empresa_id = $1 WHERE id = $2`, [empresa_id, trabajadorId]);
      if (trabajador.rows[0].obra_id !== obra_id)
        await pool.query(`UPDATE trabajadores SET obra_id = $1 WHERE id = $2`, [obra_id, trabajadorId]);
      if (trabajador.rows[0].numero_identificacion !== numero_identificacion)
        await pool.query(`UPDATE trabajadores SET numero_identificacion = $1 WHERE id = $2`, [numero_identificacion, trabajadorId]);
      if (trabajador.rows[0].empresa !== empresa)
        await pool.query(`UPDATE trabajadores SET empresa = $1 WHERE id = $2`, [empresa, trabajadorId]);
    }

    res.json({
      message: "Datos básicos guardados",
      trabajadorId,
      nombre,
      empresa,
      empresa_id,
      obra_id,
      numero_identificacion,
    });
  } catch (error) {
    res.status(500).json({ error: "Error al guardar los datos" });
  }
});

/**
 * GET /trabajador_id
 * Resuelve el ID de base de datos de un trabajador coincidiendo los cuatro campos de identidad.
 * @query {{ nombre: string, empresa: string, obra: string, numero_identificacion: string }}
 * @returns {{ trabajadorId: number, nombre: string, empresa: string, obra: string, numero_identificacion: string }}
 */
app.get("/trabajador_id", async (req, res) => {
  const { nombre, empresa, obra, numero_identificacion } = req.query;
  if (!nombre || !empresa || !obra || !numero_identificacion) {
    return res.status(400).json({ error: "Faltan parámetros obligatorios" });
  }
  try {
    const empresaRows = await pool.query(`SELECT id FROM empresas WHERE nombre = $1`, [empresa]);
    const obraRows = await pool.query(`SELECT id FROM obras WHERE nombre_obra = $1`, [obra]);

    if (empresaRows.rows.length === 0 || obraRows.rows.length === 0)
      return res.status(404).json({ error: "Empresa u obra no encontrada" });

    const empresa_id = empresaRows.rows[0].id;
    const obra_id = obraRows.rows[0].id;

    const trabajador = await pool.query(
      `SELECT id, nombre, empresa_id, obra_id, numero_identificacion, empresa
       FROM trabajadores WHERE nombre = $1 AND empresa_id = $2 AND obra_id = $3 AND numero_identificacion = $4`,
      [nombre, empresa_id, obra_id, numero_identificacion]
    );

    if (trabajador.rows.length === 0)
      return res.status(404).json({ error: "Trabajador no encontrado" });

    const empresaObj = await pool.query(`SELECT nombre FROM empresas WHERE id = $1`, [empresa_id]);
    const obraObj = await pool.query(`SELECT nombre_obra FROM obras WHERE id = $1`, [obra_id]);

    res.json({
      trabajadorId: trabajador.rows[0].id,
      nombre: trabajador.rows[0].nombre,
      empresa: empresaObj.rows[0]?.nombre || empresa,
      obra: obraObj.rows[0]?.nombre_obra || obra,
      numero_identificacion: trabajador.rows[0].numero_identificacion,
    });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener trabajador" });
  }
});

/**
 * GET /obras
 * Retorna todas las obras registradas con su constructora, empresa_id y estado activo.
 * @returns {{ obras: Array<{ id: number, nombre_obra: string, constructora: string, empresa_id: number, activa: boolean }> }}
 */
app.get("/obras", async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, nombre_obra, constructora, empresa_id, activa FROM obras`);
    res.json({ obras: result.rows });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener las obras" });
  }
});

/**
 * POST /validar_ubicacion
 * Valida que una coordenada GPS dada se encuentre dentro de los 500 m de la ubicación registrada de la obra.
 * Las obras que coincidan con la variable de entorno OBRA_BYPASS_NOMBRE omiten la geolocalización por completo.
 * @body {{ obra_id: number, lat: number, lon: number }}
 * @returns {{ ok: boolean, message?: string }}
 */
app.post("/validar_ubicacion", async (req, res) => {
  const { obra_id, lat, lon } = req.body;
  if (!obra_id || typeof lat !== "number" || typeof lon !== "number") {
    return res.status(400).json({ ok: false, message: "Parámetros inválidos" });
  }
  try {
    const OBRA_BYPASS = process.env.OBRA_BYPASS_NOMBRE || "LA CENTRAL";
    const obraCheck = await pool.query(`SELECT nombre_obra FROM obras WHERE id = $1`, [obra_id]);
    if (obraCheck.rows.length > 0 && obraCheck.rows[0].nombre_obra === OBRA_BYPASS) {
      return res.json({ ok: true });
    }

    const result = await pool.query(`SELECT latitud, longitud FROM obras WHERE id = $1`, [obra_id]);
    if (result.rows.length === 0 || result.rows[0].latitud == null || result.rows[0].longitud == null) {
      return res.status(404).json({ ok: false, message: "Obra no encontrada o sin coordenadas" });
    }
    const { latitud, longitud } = result.rows[0];
    const distancia = getDistanceFromLatLonInMeters(lat, lon, latitud, longitud);
    if (distancia <= 500) {
      res.json({ ok: true });
    } else {
      res.status(403).json({ ok: false, distancia: Math.round(distancia), message: "No estás en la ubicación de la obra seleccionada" });
    }
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al validar ubicación" });
  }
});

/**
 * Calcula la distancia de gran círculo entre dos puntos geográficos usando la fórmula de Haversine.
 * @param {number} lat1 - Latitud del punto 1 en grados decimales.
 * @param {number} lon1 - Longitud del punto 1 en grados decimales.
 * @param {number} lat2 - Latitud del punto 2 en grados decimales.
 * @param {number} lon2 - Longitud del punto 2 en grados decimales.
 * @returns {number} Distancia en metros.
 */
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convierte grados a radianes.
 * @param {number} deg
 * @returns {number}
 */
function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * GET /datos_basicos
 * Retorna los datos de identidad de todos los trabajadores activos, opcionalmente filtrados por empresa_id.
 * @query {{ empresa_id?: number }}
 * @returns {{ datos: Array<{ nombre: string, empresa_id: number, numero_identificacion: string, activo: boolean, cargo: string }> }}
 */
app.get("/datos_basicos", async (req, res) => {
  try {
    const { empresa_id } = req.query;
    let result;
    if (empresa_id) {
      result = await pool.query(
        `SELECT nombre, empresa_id, numero_identificacion, activo, cargo FROM trabajadores WHERE empresa_id = $1`,
        [empresa_id]
      );
    } else {
      result = await pool.query(
        `SELECT nombre, empresa_id, numero_identificacion, activo, cargo FROM trabajadores`
      );
    }
    res.json({ datos: result.rows });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener los datos básicos de trabajadores" });
  }
});

/**
 * Limitador de tasa en memoria para POST /admin/login.
 * Clave: IP del cliente. Valor: { count: number, resetAt: number }.
 * @type {Map<string, { count: number, resetAt: number }>}
 */
const adminLoginAttempts = new Map();

/**
 * POST /admin/login
 * Autentica a un usuario administrador comparando la contraseña proporcionada contra todos
 * los hashes bcrypt almacenados. Aplica un limitador de tasa en memoria de 10 intentos por IP
 * por ventana de 15 minutos.
 * @body {{ password: string }}
 * @returns {{ success: boolean, rol: string }}
 */
app.post("/admin/login", async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Falta la contraseña" });

  const ipKey = req.ip;
  const now = Date.now();
  const adminAttempt = adminLoginAttempts.get(ipKey) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > adminAttempt.resetAt) {
    adminAttempt.count = 0;
    adminAttempt.resetAt = now + 15 * 60 * 1000;
  }
  if (adminAttempt.count >= 10) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  }
  adminAttempt.count++;
  adminLoginAttempts.set(ipKey, adminAttempt);

  try {
    const result = await pool.query("SELECT id, password_hash, rol FROM admin_passwords");
    for (const row of result.rows) {
      const match = await bcrypt.compare(password, row.password_hash);
      if (match) {
        adminLoginAttempts.delete(ipKey);
        return res.json({ success: true, rol: row.rol });
      }
    }
    return res.status(401).json({ error: "Contraseña incorrecta" });
  } catch (error) {
    res.status(500).json({ error: "Error en el login" });
  }
});

/**
 * POST /push/subscribe
 * Registra o actualiza una suscripción Web Push para un trabajador identificado por
 * numero_identificacion. Acepta la suscripción como objeto JSON o como cadena JSON serializada.
 * @body {{ numero_identificacion: string, subscription: object|string }}
 * @returns {{ success: boolean, action: 'inserted'|'updated' }}
 */
app.post("/push/subscribe", async (req, res) => {
  const { numero_identificacion, subscription } = req.body;

  if (!numero_identificacion) {
    return res.status(400).json({ error: "Falta numero_identificacion" });
  }
  if (subscription == null) {
    return res.status(400).json({ error: "Falta subscription" });
  }

  let subscriptionObj = subscription;
  if (typeof subscription === "string") {
    try {
      subscriptionObj = JSON.parse(subscription);
    } catch (err) {
      console.error("Subscription string inválida:", subscription);
      return res.status(400).json({ error: "subscription debe ser un objeto JSON o un string JSON válido" });
    }
  }

  if (typeof subscriptionObj !== "object" || Array.isArray(subscriptionObj)) {
    return res.status(400).json({ error: "Formato de subscription inválido" });
  }

  try {
    console.log("POST /push/subscribe payload:", { numero_identificacion, subscription: subscriptionObj });

    const workerRes = await pool.query(
      `SELECT id FROM trabajadores WHERE numero_identificacion = $1`,
      [String(numero_identificacion)]
    );
    if (workerRes.rows.length === 0) {
      return res.status(404).json({ error: "Trabajador no encontrado" });
    }
    const trabajador_id = workerRes.rows[0].id;

    try {
      await pool.query(
        `INSERT INTO push_subscriptions (trabajador_id, subscription) VALUES ($1, $2)`,
        [trabajador_id, subscriptionObj]
      );
      return res.json({ success: true, action: "inserted" });
    } catch (insertErr) {
      if (insertErr.code === "23505") {
        try {
          await pool.query(
            `UPDATE push_subscriptions SET subscription = $1, fecha_suscripcion = COALESCE(fecha_suscripcion, CURRENT_TIMESTAMP) WHERE trabajador_id = $2`,
            [subscriptionObj, trabajador_id]
          );
          return res.json({ success: true, action: "updated" });
        } catch (updateErr) {
          console.error("Error actualizando suscripción:", updateErr);
          return res.status(500).json({ error: "Error actualizando suscripción", detalle: updateErr.message });
        }
      } else {
        console.error("Error insertando suscripción:", insertErr);
        return res.status(500).json({ error: "Error guardando suscripción", detalle: insertErr.message });
      }
    }
  } catch (error) {
    console.error("Error en /push/subscribe:", error);
    res.status(500).json({ error: "Error guardando suscripción", detalle: error.message });
  }
});

/**
 * GET /push/subscribe/schema
 * Retorna una descripción para desarrolladores del payload esperado en POST /push/subscribe.
 * @returns {{ description: string, contentType: string, bodyExample: object, frontendNotes: string[] }}
 */
app.get("/push/subscribe/schema", (req, res) => {
  res.json({
    description: "POST /push/subscribe espera JSON con numero_identificacion y subscription.",
    contentType: "application/json",
    bodyExample: {
      numero_identificacion: "12345678",
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/....",
        keys: {
          p256dh: "BASE64_P256DH",
          auth: "BASE64_AUTH"
        }
      }
    },
    frontendNotes: [
      "En frontend: const sub = await registration.pushManager.getSubscription();",
      "Enviar fetch(..., { headers: {'Content-Type':'application/json'}, body: JSON.stringify({ numero_identificacion, subscription: sub?.toJSON() }) })",
      "No enviar subscription como stringified JSON dentro de otro string (evitar doble stringify)."
    ]
  });
});

/**
 * Zona horaria usada para todos los cron jobs de notificaciones push programadas.
 * @type {string}
 */
const CRON_TIMEZONE = 'America/Bogota';

/**
 * Adquiere un bloqueo distribuido por hora mediante la tabla cron_locks antes de ejecutar
 * una tarea programada. Previene ejecuciones duplicadas en múltiples instancias del servidor.
 * Ejecuta sin bloqueo si la tabla cron_locks no existe (código 42P01).
 * @param {string} nombreTarea - Nombre único de la tarea usado como parte de la clave del bloqueo.
 * @param {() => Promise<void>} callback - Trabajo asíncrono a ejecutar bajo el bloqueo.
 * @returns {Promise<void>}
 */
async function ejecutarConLock(nombreTarea, callback) {
  const lockId = `cron_${nombreTarea}_${new Date().toISOString().slice(0,13)}`;
  try {
    await pool.query(
      `INSERT INTO cron_locks (lock_id, created_at) VALUES ($1, NOW()) ON CONFLICT (lock_id) DO NOTHING`,
      [lockId]
    );
    const check = await pool.query(`SELECT 1 FROM cron_locks WHERE lock_id = $1 AND created_at > NOW() - INTERVAL '5 minutes'`, [lockId]);
    if (check.rows.length > 0) {
      await callback();
    }
  } catch (err) {
    if (err.code === '42P01') {
      await callback();
    } else {
      console.error(`Error en lock para ${nombreTarea}:`, err.message);
    }
  }
}

cron.schedule('30 6 * * *', async () => {
  await ejecutarConLock('buenos_dias_630', async () => {
    const result = await pool.query(`
      SELECT t.id, t.nombre, ps.subscription
      FROM trabajadores t
      JOIN push_subscriptions ps ON ps.trabajador_id = t.id
    `);
    for (const row of result.rows) {
      try {
        await sendPushNotification(row.subscription, {
          title: "Buenos dias!",
          body: "buenos dias super heroe, no olvides llenar todos tus permisos el dia de hoy",
          icon: `${process.env.FRONTEND_URL || ''}/icon-192.png`,
          url: "/"
        });
      } catch (err) {
        console.error("Error enviando notificación 6:30am:", err);
      }
    }
  });
}, { timezone: CRON_TIMEZONE });

cron.schedule('0 10 * * *', async () => {
  await ejecutarConLock('motivacion_1000', async () => {
    const result = await pool.query(`
      SELECT t.id, t.nombre, ps.subscription
      FROM trabajadores t
      JOIN push_subscriptions ps ON ps.trabajador_id = t.id
    `);
    for (const row of result.rows) {
      try {
        await sendPushNotification(row.subscription, {
          title: "Animo super heroe!",
          body: "hola super heroe, !tu puedes!, hoy es un gran dia para construir una catedral!",
          icon: `${process.env.FRONTEND_URL || ''}/icon-192.png`,
          url: "/"
        });
      } catch (err) {
        console.error("Error enviando notificación 10:00am:", err);
      }
    }
  });
}, { timezone: CRON_TIMEZONE });

cron.schedule('0 14 * * *', async () => {
  await ejecutarConLock('seguimiento_1400', async () => {
    const result = await pool.query(`
      SELECT t.id, t.nombre, ps.subscription
      FROM trabajadores t
      JOIN push_subscriptions ps ON ps.trabajador_id = t.id
    `);
    for (const row of result.rows) {
      try {
        await sendPushNotification(row.subscription, {
          title: "Como vas?",
          body: "como vas super heroe?, todo marchando",
          icon: `${process.env.FRONTEND_URL || ''}/icon-192.png`,
          url: "/"
        });
      } catch (err) {
        console.error("Error enviando notificación 2:00pm:", err);
      }
    }
  });
}, { timezone: CRON_TIMEZONE });

cron.schedule('25 15 * * *', async () => {
  await ejecutarConLock('progreso_1525', async () => {
    const result = await pool.query(`
      SELECT t.id, t.nombre, ps.subscription
      FROM trabajadores t
      JOIN push_subscriptions ps ON ps.trabajador_id = t.id
    `);
    for (const row of result.rows) {
      try {
        await sendPushNotification(row.subscription, {
          title: "Hola super heroe!",
          body: "pasamos a recordarte que somos progreso!",
          icon: `${process.env.FRONTEND_URL || ''}/icon-192.png`,
          url: "/"
        });
      } catch (err) {
        console.error("Error enviando notificación 3:25pm:", err);
      }
    }
  });
}, { timezone: CRON_TIMEZONE });

cron.schedule('0 17 * * *', async () => {
  await ejecutarConLock('cierre_1700', async () => {
    const result = await pool.query(`
      SELECT t.id, t.nombre, ps.subscription
      FROM trabajadores t
      JOIN push_subscriptions ps ON ps.trabajador_id = t.id
    `);
    for (const row of result.rows) {
      try {
        await sendPushNotification(row.subscription, {
          title: "Terminaste?",
          body: "super heroe, ya terminaste todos tus registros?",
          icon: `${process.env.FRONTEND_URL || ''}/icon-192.png`,
          url: "/"
        });
      } catch (err) {
        console.error("Error enviando notificación 5:00pm:", err);
      }
    }
  });
}, { timezone: CRON_TIMEZONE });

/**
 * Forms checked daily at 4:00pm. For each subscribed worker, a notification
 * is sent listing any form that has no matching record for the current date.
 * @type {Array<{ nombre: string, tabla: string }>}
 */
const formularios = [
  { nombre: "registro de horas", tabla: "horas_jornada" },
  { nombre: "permiso de trabajo", tabla: "permiso_trabajo" },
];

cron.schedule('0 16 * * *', async () => {
  await ejecutarConLock('faltantes_1600', async () => {
    const hoy = new Date().toISOString().slice(0, 10);

    const trabajadores = await pool.query(`
      SELECT t.id, t.nombre, ps.subscription
      FROM trabajadores t
      JOIN push_subscriptions ps ON ps.trabajador_id = t.id
    `);

    for (const row of trabajadores.rows) {
      let faltantes = [];
      for (const form of formularios) {
        let existe = false;
        try {
          const res = await pool.query(
            `SELECT 1 FROM ${form.tabla} WHERE
              (${form.tabla}.trabajador_id = $1 OR
               ${form.tabla}.nombre_operador = $2 OR
               ${form.tabla}.nombre = $2)
              AND fecha_servicio = $3
              LIMIT 1`,
            [row.id, row.nombre, hoy]
          );
          existe = res.rows.length > 0;
        } catch (e) {
          // ignore tables that do not have the expected columns
        }
        if (!existe) faltantes.push(form.nombre);
      }

      if (faltantes.length > 0) {
        try {
          await sendPushNotification(row.subscription, {
            title: "Atencion super heroe!",
            body: `super heroe, te falta ${faltantes.join(", ")} por llenar, !llenalo, tu puedes!`,
            icon: `${process.env.FRONTEND_URL || ''}/icon-192.png`,
            url: "/"
          });
        } catch (err) {
          console.error("Error enviando notificación 4:00pm:", err);
        }
      }
    }
  });
}, { timezone: CRON_TIMEZONE });

/**
 * GET /vapid-public-key
 * Retorna la clave pública VAPID como texto plano para uso en la llamada
 * PushManager.subscribe() del navegador.
 * @returns {string}
 */
app.get('/vapid-public-key', (req, res) => {
  res.type('text/plain').send(process.env.VAPID_PUBLIC_KEY);
});
