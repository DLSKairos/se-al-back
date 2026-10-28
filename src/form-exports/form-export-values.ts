import { DateTime } from 'luxon';

const TZ = 'America/Bogota';
const IMAGE_FETCH_TIMEOUT_MS = 5000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
// Solo descargamos imágenes de nuestro storage (evita SSRF desde valores enviados por usuarios)
const TRUSTED_IMAGE_HOSTS = ['res.cloudinary.com'];

export interface ExportField {
  key: string;
  label: string;
  type: string;
}

const DATA_URL_RE = /^data:image\/[a-z+.-]+;base64,/i;

/** Extrae el string de imagen de un valor (string, o { url } / { signature_url }). */
function imageSource(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    for (const k of ['url', 'signature_url', 'secure_url', 'data']) {
      if (typeof v[k] === 'string') return v[k] as string;
    }
  }
  return null;
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function detectMime(buf: Buffer): 'image/png' | 'image/jpeg' | null {
  if (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

/**
 * Devuelve un data URI PNG/JPEG listo para pdfmake, o null si no es una imagen
 * soportada (pdfkit solo soporta PNG y JPEG) o no se pudo obtener.
 * Acepta data URI, base64 "pelado" (stroke_image_base64) o URL https.
 * `trustAnyHost` solo para URLs configuradas por administradores (logo de la org).
 */
export async function resolvePdfImage(
  value: unknown,
  opts: { trustAnyHost?: boolean } = {},
): Promise<string | null> {
  const src = imageSource(value)?.trim();
  if (!src) return null;

  let buf: Buffer | null = null;

  if (isHttpUrl(src)) {
    buf = await fetchImage(src, opts.trustAnyHost ?? false);
  } else {
    const b64 = src.replace(DATA_URL_RE, '');
    if (/^[A-Za-z0-9+/=\s]+$/.test(b64) && b64.length > 8) {
      buf = Buffer.from(b64, 'base64');
    }
  }

  if (!buf) return null;
  const mime = detectMime(buf);
  return mime ? `data:${mime};base64,${buf.toString('base64')}` : null;
}

async function fetchImage(url: string, trustAnyHost: boolean): Promise<Buffer | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    if (!trustAnyHost && !TRUSTED_IMAGE_HOSTS.includes(parsed.hostname)) return null;

    const res = await fetch(parsed, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > IMAGE_MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > IMAGE_MAX_BYTES ? null : buf;
  } catch {
    return null;
  }
}

/** ¿El valor del campo es una imagen embebida (data URI) que no debe volcarse como texto? */
function isInlineImage(value: unknown): boolean {
  const src = imageSource(value);
  return !!src && DATA_URL_RE.test(src);
}

function formatDate(raw: unknown, withTime: boolean): string {
  const dt =
    raw instanceof Date
      ? DateTime.fromJSDate(raw, { zone: TZ })
      : DateTime.fromISO(String(raw), { zone: TZ });
  if (!dt.isValid) return String(raw);
  return dt.toFormat(withTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy');
}

export function formatDateTime(d: Date | string): string {
  return formatDate(d, true);
}

/** Texto legible de un valor según el tipo del campo (PDF y Excel). */
export function formatFieldValue(field: Pick<ExportField, 'type'>, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  switch (field.type) {
    case 'BOOLEAN':
      if (value === true || value === 'true') return 'Sí';
      if (value === false || value === 'false') return 'No';
      break;
    case 'DATE':
      return formatDate(value, false);
    case 'DATETIME':
      return formatDate(value, true);
    case 'SIGNATURE':
    case 'PHOTO':
    case 'FILE': {
      if (isInlineImage(value)) {
        return field.type === 'SIGNATURE' ? '[Firma adjunta]' : '[Imagen adjunta]';
      }
      const src = imageSource(value);
      if (src) return src;
      break;
    }
    case 'GEOLOCATION': {
      if (typeof value === 'object') {
        const v = value as Record<string, unknown>;
        const lat = v.lat ?? v.latitude;
        const lng = v.lng ?? v.lon ?? v.longitude;
        if (lat !== undefined && lng !== undefined) return `${lat}, ${lng}`;
      }
      break;
    }
  }

  if (Array.isArray(value)) return value.map((v) => formatFieldValue({ type: '' }, v)).join(', ');
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (value instanceof Date) return formatDate(value, false);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SUBMITTED: 'Enviado',
  PENDING_SIGNATURES: 'En revisión (firmas pendientes)',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};
