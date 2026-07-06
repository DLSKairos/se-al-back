import { BadRequestException } from '@nestjs/common';
import { promises as dns } from 'dns';
import * as ipaddr from 'ipaddr.js';

/**
 * Guard anti-SSRF para URLs salientes (webhooks — Fix seguridad M2).
 *
 * Mejoras sobre el filtro anterior basado en regex del hostname:
 *  - Solo permite esquemas http/https.
 *  - Resuelve el hostname por DNS y valida CADA IP resuelta, de modo que las
 *    codificaciones alternativas (decimal `2130706433`, hex `0x7f000001`) y los
 *    nombres que apuntan a IPs privadas quedan cubiertos (la resolución las
 *    normaliza a la IP real).
 *  - Cubre loopback, privadas (RFC1918), link-local (169.254 / metadata cloud),
 *    unique-local IPv6, CGNAT (100.64/10) y reservadas.
 *  - Debe reinvocarse INMEDIATAMENTE ANTES de cada entrega para mitigar DNS
 *    rebinding (no confiar solo en la validación de creación).
 */

/** Rangos considerados NO públicos. */
function isBlockedRange(range: string): boolean {
  // ipaddr.range() clasifica en: unicast, loopback, private, linkLocal,
  // uniqueLocal, reserved, broadcast, carrierGradeNat, multicast, unspecified…
  // Solo 'unicast' (global) se considera público seguro.
  return range !== 'unicast';
}

function assertIpAllowed(ip: string): void {
  let addr = ipaddr.parse(ip);

  // IPv6 que mapea IPv4 (::ffff:127.0.0.1) → evaluar como IPv4.
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }

  if (isBlockedRange(addr.range())) {
    throw new BadRequestException(
      'No se permiten URLs que resuelvan a direcciones de red internas o reservadas',
    );
  }
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('URL inválida');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('Solo se permiten URLs http(s)');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // quita corchetes IPv6

  // Si el hostname ya es una IP literal, valídala directamente.
  if (ipaddr.isValid(hostname)) {
    assertIpAllowed(hostname);
    return;
  }

  // Resolver TODAS las direcciones y validar cada una. dns.lookup normaliza
  // además formas numéricas (decimal/hex/octal) a la IP real.
  let resolved: { address: string }[];
  try {
    resolved = await dns.lookup(hostname, { all: true });
  } catch {
    throw new BadRequestException('No se pudo resolver el host de la URL');
  }

  if (resolved.length === 0) {
    throw new BadRequestException('El host de la URL no resuelve a ninguna IP');
  }

  for (const { address } of resolved) {
    assertIpAllowed(address);
  }
}
