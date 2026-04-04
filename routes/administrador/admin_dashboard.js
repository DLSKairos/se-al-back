import express from "express";
const router = express.Router();

/**
 * Ejecuta una query contra el pool global y retorna las filas.
 * En caso de error retorna el valor por defecto proporcionado sin propagar la excepción,
 * de modo que un fallo parcial no cancele toda la respuesta del dashboard.
 * @template T
 * @param {string} sql
 * @param {Array} params
 * @param {T} fallback - Valor retornado si la query falla.
 * @returns {Promise<T>}
 */
async function safeQuery(sql, params, fallback) {
  try {
    const result = await global.db.query(sql, params);
    return result.rows;
  } catch {
    return fallback;
  }
}

/**
 * GET /admin/dashboard
 * Retorna estadísticas agregadas del panel de administración para una empresa dada.
 *
 * La tabla `permiso_trabajo` no tiene columna `estado` ni `empresa_id` propias.
 * El vínculo con la empresa se realiza mediante:
 *   nombre_operador IN (SELECT nombre FROM trabajadores WHERE empresa_id = $1)
 * El estado se deriva así:
 *   - 'rechazado'  cuando motivo_suspension IS NOT NULL AND motivo_suspension <> ''
 *   - 'aprobado'   en todos los demás casos
 *
 * @query {number} empresa_id - ID de la empresa (obligatorio, entero positivo).
 * @returns {object} Estadísticas del dashboard.
 */
router.get("/", async (req, res) => {
  const empresaId = parseInt(req.query.empresa_id);
  if (!empresaId || Number.isNaN(empresaId) || empresaId <= 0) {
    return res.status(400).json({
      success: false,
      error: "empresa_id es requerido y debe ser un número entero positivo",
    });
  }

  // ── 1. Totales de trabajadores ───────────────────────────────────────────
  const usuariosRows = await safeQuery(
    `SELECT
       COUNT(*)::int                                           AS total,
       COUNT(*) FILTER (WHERE activo = true)::int             AS activos
     FROM trabajadores
     WHERE empresa_id = $1`,
    [empresaId],
    [{ total: 0, activos: 0 }]
  );
  const totalUsers = usuariosRows[0]?.total ?? 0;
  const activeUsers = usuariosRows[0]?.activos ?? 0;

  // ── 2. Permisos por estado ───────────────────────────────────────────────
  // El estado se deriva: rechazado si hay motivo_suspension, aprobado en otro caso.
  const permisosStatusRows = await safeQuery(
    `SELECT
       CASE
         WHEN motivo_suspension IS NOT NULL AND TRIM(motivo_suspension) <> ''
         THEN 'rechazado'
         ELSE 'aprobado'
       END                     AS estado,
       COUNT(*)::int           AS cantidad
     FROM permiso_trabajo
     WHERE nombre_operador IN (
       SELECT nombre FROM trabajadores WHERE empresa_id = $1
     )
     GROUP BY estado`,
    [empresaId],
    []
  );

  let aprobados = 0;
  let rechazados = 0;
  for (const row of permisosStatusRows) {
    if (row.estado === "aprobado") aprobados = row.cantidad;
    if (row.estado === "rechazado") rechazados = row.cantidad;
  }
  const totalPermisos = aprobados + rechazados;
  const pendientes = 0; // El esquema actual no contempla estado pendiente

  // ── 3. Tendencia mensual — últimos 6 meses ───────────────────────────────
  const trendRows = await safeQuery(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', fecha_servicio), 'Mon') AS month,
       DATE_TRUNC('month', fecha_servicio)                 AS month_date,
       COUNT(*)::int                                       AS permisos
     FROM permiso_trabajo
     WHERE nombre_operador IN (
       SELECT nombre FROM trabajadores WHERE empresa_id = $1
     )
       AND fecha_servicio >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
     GROUP BY month_date, month
     ORDER BY month_date ASC`,
    [empresaId],
    []
  );

  // Usuarios nuevos por mes (fecha de creación no existe en el esquema,
  // por lo que se reporta 0 para no bloquear el endpoint).
  const monthlyTrend = trendRows.map((row) => ({
    month: row.month,
    permisos: row.permisos,
    usuarios: 0,
  }));

  // ── 4. Distribución por tipo de cargo ────────────────────────────────────
  // La tabla permiso_trabajo no tiene una columna "tipo_permiso".
  // Se agrupa por `cargo` del operador, que representa la categoría funcional
  // más cercana a un "tipo" dentro del esquema real.
  const byTypeRows = await safeQuery(
    `SELECT
       COALESCE(NULLIF(TRIM(cargo), ''), 'Sin especificar') AS type,
       COUNT(*)::int                                         AS count
     FROM permiso_trabajo
     WHERE nombre_operador IN (
       SELECT nombre FROM trabajadores WHERE empresa_id = $1
     )
     GROUP BY type
     ORDER BY count DESC
     LIMIT 10`,
    [empresaId],
    []
  );

  // ── 5. Permisos recientes ────────────────────────────────────────────────
  const recentRows = await safeQuery(
    `SELECT
       pt.id,
       pt.nombre_operador                                                    AS nombre,
       pt.cargo                                                              AS tipo,
       pt.nombre_proyecto                                                    AS obra,
       TO_CHAR(pt.fecha_servicio, 'YYYY-MM-DD')                             AS fecha,
       CASE
         WHEN pt.motivo_suspension IS NOT NULL AND TRIM(pt.motivo_suspension) <> ''
         THEN 'rechazado'
         ELSE 'aprobado'
       END                                                                   AS estado
     FROM permiso_trabajo pt
     WHERE pt.nombre_operador IN (
       SELECT nombre FROM trabajadores WHERE empresa_id = $1
     )
     ORDER BY pt.id DESC
     LIMIT 5`,
    [empresaId],
    []
  );

  return res.json({
    success: true,
    data: {
      totalUsers,
      activeUsers,
      totalPermisos,
      aprobados,
      pendientes,
      rechazados,
      monthlyTrend,
      byStatus: [
        { name: "Aprobados", value: aprobados },
        { name: "Pendientes", value: pendientes },
        { name: "Rechazados", value: rechazados },
      ],
      byType: byTypeRows.map((r) => ({ type: r.type, count: r.count })),
      recentPermisos: recentRows,
    },
  });
});

export default router;
