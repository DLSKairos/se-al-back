import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  SignatureLinkStatus,
  SignatureMode,
  SignerType,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FormApprovalService } from '../form-approval/form-approval.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SignatureFileStorageService } from './signature-file-storage.service';
import {
  calculateCanonicalHash,
  CanonicalDocument,
  CanonicalQuestion,
  CanonicalSigner,
  HASH_VERSION,
} from './canonical-hash.util';
import { CreateExternalSignerDto } from './dto/create-external-signer.dto';
import { CreateSignatureTokenDto } from './dto/create-signature-token.dto';
import { SignInternalDto } from './dto/sign-internal.dto';
import { SignExternalDto } from './dto/sign-external.dto';
import { UpdateSignatureConfigDto } from './dto/update-signature-config.dto';
import { ReadingLogEntryDto } from './dto/reading-log-entry.dto';
import { StrokeVectorDto } from './dto/stroke-vector.dto';

/** Clave Redis para cache de tokens activos: firma_token:<token> → submissionId */
const REDIS_TOKEN_PREFIX = 'firma_token:';

/** TTL por defecto del token de firma en horas (configurable vía env) */
const DEFAULT_TOKEN_TTL_HOURS = 2;

@Injectable()
export class ElectronicSignatureService {
  private readonly logger = new Logger(ElectronicSignatureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly fileStorage: SignatureFileStorageService,
    private readonly config: ConfigService,
    private readonly formApproval: FormApprovalService,
    private readonly notifications: NotificationsService,
  ) {}

  // ════════════════════════════════════════════════════════════════════════════
  // CATÁLOGO DE FIRMANTES EXTERNOS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Lista los firmantes externos de una obra, acotados por org del JWT.
   */
  async listExternalSigners(orgId: string, workLocationId: string) {
    // Verificar que la sede pertenece a la org
    await this.requireWorkLocation(workLocationId, orgId);

    return this.prisma.externalSigner.findMany({
      where: { org_id: orgId, work_location_id: workLocationId },
      select: {
        id: true,
        name: true,
        identification_number: true,
        phone: true,
        is_registered: true,
        created_at: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Registra un nuevo firmante externo.
   * La cédula debe ser única dentro de la misma obra (constraint BD).
   */
  async createExternalSigner(orgId: string, dto: CreateExternalSignerDto) {
    await this.requireWorkLocation(dto.work_location_id, orgId);

    try {
      return await this.prisma.externalSigner.create({
        data: {
          org_id: orgId,
          work_location_id: dto.work_location_id,
          name: dto.name,
          identification_number: dto.identification_number,
          phone: dto.phone,
        },
        select: {
          id: true,
          name: true,
          identification_number: true,
          phone: true,
          is_registered: true,
          created_at: true,
        },
      });
    } catch (err: unknown) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException(
          `Ya existe un firmante con cédula ${dto.identification_number} en esta sede`,
        );
      }
      throw err;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TOKENS DE FIRMA (EXTERNOS)
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Genera un token de firma para un firmante externo sobre un submission.
   * Si ya existe un token activo (no usado, no expirado) para este par
   * (submission, firmante), lo invalida y genera uno nuevo.
   *
   * Retorna el link de WhatsApp con mensaje precompletado.
   */
  async createSignatureToken(orgId: string, dto: CreateSignatureTokenDto) {
    const submission = await this.requireSubmission(dto.form_submission_id, orgId);
    const signer = await this.requireExternalSigner(dto.external_signer_id, orgId);

    // Invalidar tokens previos activos para el mismo par (evitar links huérfanos)
    await this.prisma.signatureToken.updateMany({
      where: {
        submission_id: dto.form_submission_id,
        external_signer_id: dto.external_signer_id,
        used_at: null,
      },
      data: { used_at: new Date() }, // marca como usados para invalidarlos
    });

    const ttlHours = this.config.get<number>(
      'SIGNATURE_TOKEN_TTL_HOURS',
      DEFAULT_TOKEN_TTL_HOURS,
    );
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const signatureToken = await this.prisma.signatureToken.create({
      data: {
        submission_id: dto.form_submission_id,
        external_signer_id: dto.external_signer_id,
        expires_at: expiresAt,
        link_status: SignatureLinkStatus.SENT,
      },
    });

    // Cachear en Redis para validación rápida en la ruta pública
    const ttlSeconds = ttlHours * 3600;
    await this.redis.set(
      `${REDIS_TOKEN_PREFIX}${signatureToken.token}`,
      dto.form_submission_id,
      ttlSeconds,
    );

    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'https://app.señal.co',
    );
    const link = `${frontendUrl}/firma/${signatureToken.token}`;

    // Construir el texto de WhatsApp
    const requesterName = submission.submitter.name;
    const templateName = submission.template.name;
    const waText = encodeURIComponent(
      `Hola ${signer.name}, ${requesterName} te solicita firmar el permiso "${templateName}".\n\nIngresa aquí para revisar y firmar:\n${link}\n\n_Este enlace expira en ${ttlHours} horas._`,
    );
    const waPhone = signer.phone.replace(/\D/g, '');
    const waLink = `https://wa.me/${waPhone}?text=${waText}`;

    this.logger.log(
      `Token de firma generado para submission=${dto.form_submission_id} signer=${dto.external_signer_id}`,
    );

    return {
      signature_token_id: signatureToken.id,
      token: signatureToken.token,
      link,
      expires_at: expiresAt,
      whatsapp_link: waLink,
      whatsapp_message: decodeURIComponent(waText),
      signer: {
        id: signer.id,
        name: signer.name,
        phone: signer.phone,
      },
    };
  }

  /**
   * Marca el estado del link como SENT (el operario abrió WhatsApp).
   * Idempotente: si ya estaba en SENT o más, no hace nada.
   */
  async markLinkSent(tokenId: string, orgId: string): Promise<void> {
    const token = await this.prisma.signatureToken.findFirst({
      where: { id: tokenId },
      include: {
        submission: { select: { org_id: true } },
      },
    });

    if (!token) throw new NotFoundException('Token de firma no encontrado');
    if (token.submission.org_id !== orgId) {
      throw new ForbiddenException('Sin acceso a este token');
    }

    // Solo actualizar si está en el estado inicial generado
    if (token.link_status === SignatureLinkStatus.SENT) {
      // Ya está en SENT desde la creación, no hay nada que cambiar —
      // pero sí podría no haberse marcado si el token venía de un resend.
      // Actualizamos para registrar el timestamp implícito (noop si ya SENT).
    }
    // Si viene de un estado previo a SENT por lógica futura, actualizar aquí.
    // Por ahora el estado SENT es el inicial, así que este endpoint es informativo.
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RUTA PÚBLICA — FIRMANTE EXTERNO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Valida el token público, marca como VIEWED en primera apertura,
   * y retorna el contenido del permiso en secciones de solo lectura.
   */
  async getPublicSignatureContent(token: string, ipAddress: string) {
    const signatureToken = await this.validateAndLoadToken(token);

    // Marcar como VIEWED en la primera apertura
    if (signatureToken.link_status === SignatureLinkStatus.SENT) {
      await this.prisma.signatureToken.update({
        where: { id: signatureToken.id },
        data: {
          link_status: SignatureLinkStatus.VIEWED,
          viewed_at: new Date(),
        },
      });
      this.logger.log(`Token ${token.slice(0, 8)}... marcado como VIEWED desde ${ipAddress}`);
    }

    const submission = signatureToken.submission;
    const template = submission.template;
    const signer = signatureToken.external_signer;
    const config = template.signature_config;

    // Agrupar valores por sección
    const sectionedContent = this.buildSectionedContent(
      submission.values,
      template.sections as Record<string, unknown> | null,
    );

    return {
      token_id: signatureToken.id,
      signer: {
        id: signer.id,
        name: signer.name,
        identification_number: signer.identification_number,
        identity_verified: signer.is_registered,
      },
      requester: {
        name: submission.submitter.name,
      },
      permit: {
        id: submission.id,
        template_name: template.name,
        submitted_at: submission.submitted_at,
        sections: sectionedContent,
      },
      signature_config: {
        min_reading_seconds: config?.min_reading_seconds ?? 30,
        mode: config?.signature_mode ?? SignatureMode.FLEXIBLE,
      },
    };
  }

  /**
   * Registra las fotos de identidad del firmante externo (cédula + selfie).
   * Se almacenan en Cloudinary privado y vinculan a la cédula para futuros usos.
   */
  async uploadExternalIdentity(
    token: string,
    photoCedulaBuffer: Buffer,
    selfieBuffer: Buffer,
  ) {
    const signatureToken = await this.validateAndLoadToken(token);
    const signer = signatureToken.external_signer;
    const orgId = signer.org_id;

    const [photoIdKey, selfieKey] = await Promise.all([
      this.fileStorage.uploadPrivate(photoCedulaBuffer, orgId, 'cedulas'),
      this.fileStorage.uploadPrivate(selfieBuffer, orgId, 'selfies'),
    ]);

    await this.prisma.externalSigner.update({
      where: { id: signer.id },
      data: {
        photo_id_key: photoIdKey,
        selfie_key: selfieKey,
        is_registered: true,
      },
    });

    this.logger.log(
      `Identidad registrada para signer=${signer.id} (cédula ${signer.identification_number})`,
    );

    return { identity_verified: true };
  }

  /**
   * Registra la firma del firmante externo.
   * Valida: token válido, tiempo mínimo de lectura, datos completos.
   *
   * S-01 (CRÍTICO): el consumo del token + creación del SignatureRecord ocurren
   * en una sola transacción Prisma con UPDATE condicional WHERE used_at IS NULL.
   * Si otro hilo ya consumió el token entre validateAndLoadToken y aquí,
   * Prisma lanza P2025 (record not found) → BadRequestException TOKEN_USED.
   */
  async signExternal(
    token: string,
    dto: SignExternalDto,
    ipAddress: string,
    userAgent: string,
    formApprovalService?: { checkAutoApproval(submissionId: string): Promise<void> },
  ) {
    const signatureToken = await this.validateAndLoadToken(token);
    const submission = signatureToken.submission;
    const signer = signatureToken.external_signer;
    const config = submission.template.signature_config;
    const minSeconds = config?.min_reading_seconds ?? 30;

    // Validar tiempo mínimo de lectura
    this.validateReadingTime(dto.reading_log, minSeconds);

    // S-05: validar section_or_field_id contra el conjunto real del documento
    this.validateReadingLogIds(dto.reading_log, submission);

    // Calcular hash canónico as-of ahora (momento de la firma)
    const documentHash = await this.computeDocumentHash(submission);

    // S-01: consumo atómico del token + creación del record en una transacción.
    // El UPDATE usa WHERE used_at IS NULL — si ya fue usado, P2025 → TOKEN_USED.
    let record: { id: string; signed_at: Date; document_hash: string };
    try {
      record = await this.prisma.$transaction(async (tx) => {
        // Actualización condicional: solo si el token todavía no ha sido usado
        await tx.signatureToken.update({
          where: { id: signatureToken.id, used_at: null },
          data: {
            used_at: new Date(),
            link_status: SignatureLinkStatus.SIGNED,
          },
        });

        return tx.signatureRecord.create({
          data: {
            submission_id: submission.id,
            signer_type: SignerType.EXTERNAL,
            external_signer_id: signer.id,
            signature_token_id: signatureToken.id,
            ip_address: ipAddress,
            user_agent: userAgent,
            geo_location: { lat: dto.geo_lat, lng: dto.geo_lng, accuracy: dto.geo_accuracy ?? null },
            reading_log: dto.reading_log as unknown as Prisma.InputJsonValue,
            min_reading_seconds: minSeconds,
            stroke_image_base64: dto.stroke_image_base64,
            stroke_vectors: dto.stroke_vectors as unknown as Prisma.InputJsonValue,
            document_hash: documentHash,
            hash_version: HASH_VERSION,
            webauthn_session: false,
          },
          select: { id: true, signed_at: true, document_hash: true },
        });
      });
    } catch (err: unknown) {
      if (this.isPrismaRecordNotFound(err)) {
        throw new BadRequestException({
          code: 'TOKEN_USED',
          message: 'Este enlace ya fue utilizado para firmar',
        });
      }
      throw err;
    }

    // Invalidar cache Redis del token
    await this.redis.del(`${REDIS_TOKEN_PREFIX}${token}`);

    this.logger.log(
      `Firma EXTERNA registrada: submission=${submission.id} signer=${signer.id} record=${record.id}`,
    );

    // Notificar al operario dueño del submission (best-effort)
    await this.tryNotifySubmissionOwner(submission, signer.name);

    // Auto-aprobación tras cada firma exitosa
    try {
      await (formApprovalService ?? this.formApproval).checkAutoApproval(submission.id);
    } catch (err: unknown) {
      this.logger.warn(
        `checkAutoApproval falló para submission=${submission.id}: ${String(err)}`,
      );
    }

    return {
      signature_record_id: record.id,
      signed_at: record.signed_at,
      document_hash: record.document_hash,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FIRMA INTERNA (USUARIO AUTENTICADO)
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Registra la firma de un usuario interno (operario o admin autenticado).
   *
   * S-01: el findFirst + create original no era atómico.
   * El unique constraint @@unique([submission_id, internal_user_id]) en la BD
   * garantiza atomicidad: si dos requests concurrentes intentan firmar al mismo
   * tiempo, uno de ellos recibe P2002 → ConflictException.
   * Se mantiene el findFirst previo como fast-path para dar el mensaje correcto
   * antes de llegar a BD, pero la garantía real es el constraint.
   */
  async signInternal(
    submissionId: string,
    userId: string,
    orgId: string,
    dto: SignInternalDto,
    ipAddress: string,
    userAgent: string,
    formApprovalService?: { checkAutoApproval(submissionId: string): Promise<void> },
  ) {
    const submission = await this.requireSubmission(submissionId, orgId);

    // Fast-path: verificar firma previa (no atómico, pero reduce carga en el constraint)
    const existing = await this.prisma.signatureRecord.findFirst({
      where: {
        submission_id: submissionId,
        internal_user_id: userId,
        signer_type: SignerType.INTERNAL,
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Ya has firmado este permiso anteriormente');
    }

    const config = submission.template.signature_config;
    const minSeconds = config?.min_reading_seconds ?? 30;

    // Validar tiempo mínimo de lectura
    this.validateReadingTime(dto.reading_log, minSeconds);

    // S-05: validar section_or_field_id contra el conjunto real del documento
    this.validateReadingLogIds(dto.reading_log, submission);

    // Calcular hash canónico as-of ahora (momento de la firma)
    const documentHash = await this.computeDocumentHash(submission);

    let record: { id: string; signed_at: Date; document_hash: string };
    try {
      record = await this.prisma.signatureRecord.create({
        data: {
          submission_id: submissionId,
          signer_type: SignerType.INTERNAL,
          internal_user_id: userId,
          ip_address: ipAddress,
          user_agent: userAgent,
          geo_location: {
            lat: dto.geo_lat,
            lng: dto.geo_lng,
            accuracy: dto.geo_accuracy ?? null,
          },
          reading_log: dto.reading_log as unknown as Prisma.InputJsonValue,
          min_reading_seconds: minSeconds,
          stroke_image_base64: dto.stroke_image_base64,
          stroke_vectors: dto.stroke_vectors as unknown as Prisma.InputJsonValue,
          document_hash: documentHash,
          hash_version: HASH_VERSION,
          webauthn_session: dto.webauthn_session_active ?? false,
        },
        select: { id: true, signed_at: true, document_hash: true },
      });
    } catch (err: unknown) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException('Ya has firmado este permiso anteriormente');
      }
      throw err;
    }

    this.logger.log(
      `Firma INTERNA registrada: submission=${submissionId} user=${userId} record=${record.id}`,
    );

    // Auto-aprobación tras cada firma exitosa
    try {
      await (formApprovalService ?? this.formApproval).checkAutoApproval(submissionId);
    } catch (err: unknown) {
      this.logger.warn(
        `checkAutoApproval falló para submission=${submissionId}: ${String(err)}`,
      );
    }

    return {
      signature_record_id: record.id,
      signed_at: record.signed_at,
      document_hash: record.document_hash,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ESTADO Y VERIFICACIÓN
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Lista todos los firmantes de un submission con su estado actual.
   */
  async getSubmissionSignatureStatus(submissionId: string, orgId: string) {
    await this.requireSubmission(submissionId, orgId);

    const [externalTokens, internalRecords, config] = await Promise.all([
      this.prisma.signatureToken.findMany({
        where: { submission_id: submissionId },
        include: {
          external_signer: {
            select: {
              id: true,
              name: true,
              identification_number: true,
              phone: true,
              is_registered: true,
            },
          },
          signature_record: {
            select: { id: true, signed_at: true },
          },
        },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.signatureRecord.findMany({
        where: {
          submission_id: submissionId,
          signer_type: SignerType.INTERNAL,
        },
        include: {
          internal_user: {
            select: { id: true, name: true, identification_number: true },
          },
        },
        orderBy: { signed_at: 'asc' },
      }),
      this.prisma.signatureConfig.findFirst({
        where: {
          template: {
            submissions: { some: { id: submissionId } },
          },
        },
      }),
    ]);

    const external = externalTokens.map((t) => ({
      type: 'EXTERNAL' as const,
      signer_id: t.external_signer.id,
      name: t.external_signer.name,
      identification_number: t.external_signer.identification_number,
      phone: t.external_signer.phone,
      identity_verified: t.external_signer.is_registered,
      status: t.link_status,
      token_id: t.id,
      expires_at: t.expires_at,
      viewed_at: t.viewed_at,
      signed_at: t.signature_record?.signed_at ?? null,
      is_expired: t.expires_at < new Date() && t.used_at === null,
    }));

    const internal = internalRecords.map((r) => ({
      type: 'INTERNAL' as const,
      signer_id: r.internal_user?.id ?? null,
      name: r.internal_user?.name ?? 'Usuario eliminado',
      identification_number: r.internal_user?.identification_number ?? null,
      status: SignatureLinkStatus.SIGNED,
      signed_at: r.signed_at,
      record_id: r.id,
    }));

    return {
      submission_id: submissionId,
      signature_mode: config?.signature_mode ?? SignatureMode.FLEXIBLE,
      requires_internal_sign: config?.requires_internal_sign ?? true,
      signers: [...internal, ...external],
    };
  }

  /**
   * Verifica la integridad del documento recalculando el hash canónico desde BD
   * y comparándolo contra cada SignatureRecord.
   *
   * BUG-1 / S-06: para cada record se recalcula el hash as-of = record.signed_at,
   * usando los firmantes que existían en ese momento. Esto garantiza que agregar
   * firmantes DESPUÉS no invalide una firma que ya fue registrada.
   *
   * Registros con hash_version === 1 no son verificables con v2 (stableStringify
   * vs JSON.stringify difieren). Se marcan con valid=null y reason=HASH_V1_NO_VERIFICABLE
   * para no romper el historial de auditoría pre-migración.
   */
  async verifyDocumentIntegrity(submissionId: string, orgId: string) {
    const submission = await this.requireSubmission(submissionId, orgId);

    const records = await this.prisma.signatureRecord.findMany({
      where: { submission_id: submissionId },
      select: {
        id: true,
        document_hash: true,
        hash_version: true,
        signed_at: true,
        signer_type: true,
      },
    });

    const validatedRecords = await Promise.all(
      records.map(async (r) => {
        // Registros v1: no verificables con el algoritmo v2
        if (r.hash_version === 1) {
          return {
            record_id: r.id,
            signer_type: r.signer_type,
            signed_at: r.signed_at,
            stored_hash: r.document_hash,
            current_hash: null as string | null,
            valid: null as boolean | null,
            reason: 'HASH_V1_NO_VERIFICABLE' as string | undefined,
            hash_version: r.hash_version,
          };
        }

        // v2+: recalcular con los firmantes as-of = signed_at
        const hashAtSignTime = await this.computeDocumentHash(submission, r.signed_at);
        return {
          record_id: r.id,
          signer_type: r.signer_type,
          signed_at: r.signed_at,
          stored_hash: r.document_hash,
          current_hash: hashAtSignTime,
          valid: (r.document_hash === hashAtSignTime) as boolean | null,
          reason: undefined as string | undefined,
          hash_version: r.hash_version,
        };
      }),
    );

    // allValid ignora records null (v1 — no verificables), solo falla si hay false explícito
    const allValid = validatedRecords.every((r) => r.valid !== false);

    if (!allValid) {
      this.logger.warn(
        `Integridad comprometida en submission=${submissionId}. ` +
          `Records inválidos: ${validatedRecords
            .filter((r) => r.valid === false)
            .map((r) => r.record_id)
            .join(', ')}`,
      );
    }

    return {
      submission_id: submissionId,
      valid: allValid,
      records: validatedRecords,
    };
  }

  /**
   * Retorna URLs firmadas de Cloudinary (10 min) para las fotos de identidad
   * de un firmante externo. Solo para ADMIN/SUPER_ADMIN en auditorías.
   */
  async getExternalSignerIdentityUrls(signerId: string, orgId: string) {
    const signer = await this.prisma.externalSigner.findFirst({
      where: { id: signerId, org_id: orgId },
      select: {
        id: true,
        name: true,
        identification_number: true,
        is_registered: true,
        photo_id_key: true,
        selfie_key: true,
      },
    });

    if (!signer) {
      throw new NotFoundException('Firmante externo no encontrado');
    }

    if (!signer.is_registered || !signer.photo_id_key || !signer.selfie_key) {
      throw new BadRequestException(
        'Este firmante no tiene fotos de identidad registradas',
      );
    }

    const photo_cedula_url = this.fileStorage.generateSignedUrl(
      signer.photo_id_key,
      600, // 10 minutos
    );
    const selfie_url = this.fileStorage.generateSignedUrl(
      signer.selfie_key,
      600,
    );

    return {
      signer_id: signer.id,
      name: signer.name,
      identification_number: signer.identification_number,
      photo_cedula_url,
      selfie_url,
      expires_in_seconds: 600,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CONFIGURACIÓN DE FIRMA POR TEMPLATE
  // ════════════════════════════════════════════════════════════════════════════

  async getSignatureConfig(templateId: string, orgId: string) {
    await this.requireTemplate(templateId, orgId);

    const config = await this.prisma.signatureConfig.findUnique({
      where: { template_id: templateId },
    });

    // Si no existe configuración, retornar valores por defecto
    return (
      config ?? {
        template_id: templateId,
        signature_mode: SignatureMode.FLEXIBLE,
        min_reading_seconds: 30,
        requires_internal_sign: true,
        created_at: null,
        updated_at: null,
      }
    );
  }

  async upsertSignatureConfig(
    templateId: string,
    orgId: string,
    dto: UpdateSignatureConfigDto,
  ) {
    await this.requireTemplate(templateId, orgId);

    return this.prisma.signatureConfig.upsert({
      where: { template_id: templateId },
      create: {
        template_id: templateId,
        signature_mode: dto.signature_mode ?? SignatureMode.FLEXIBLE,
        min_reading_seconds: dto.min_reading_seconds ?? 30,
        requires_internal_sign: dto.requires_internal_sign ?? true,
      },
      update: {
        ...(dto.signature_mode !== undefined && { signature_mode: dto.signature_mode }),
        ...(dto.min_reading_seconds !== undefined && {
          min_reading_seconds: dto.min_reading_seconds,
        }),
        ...(dto.requires_internal_sign !== undefined && {
          requires_internal_sign: dto.requires_internal_sign,
        }),
      },
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Valida el token de firma:
   * - Existe en BD
   * - No ha expirado
   * - No ha sido usado
   *
   * Lanza excepciones con códigos específicos que el frontend puede leer.
   */
  private async validateAndLoadToken(token: string) {
    const signatureToken = await this.prisma.signatureToken.findUnique({
      where: { token },
      include: {
        external_signer: true,
        submission: {
          include: {
            template: {
              include: {
                signature_config: true,
                fields: { orderBy: { order: 'asc' } },
              },
            },
            submitter: { select: { id: true, name: true } },
            values: {
              include: {
                field: { select: { id: true, label: true, key: true, type: true, section: true } },
              },
              orderBy: { field: { order: 'asc' } },
            },
          },
        },
      },
    });

    if (!signatureToken) {
      throw new BadRequestException({
        code: 'TOKEN_INVALID',
        message: 'El enlace de firma no es válido',
      });
    }

    if (signatureToken.used_at !== null) {
      throw new BadRequestException({
        code: 'TOKEN_USED',
        message: 'Este enlace ya fue utilizado para firmar',
      });
    }

    if (signatureToken.expires_at < new Date()) {
      throw new BadRequestException({
        code: 'TOKEN_EXPIRED',
        message: 'El enlace de firma ha expirado. Solicita uno nuevo al operario',
      });
    }

    return signatureToken;
  }

  /** Verifica que la obra existe y pertenece a la org */
  private async requireWorkLocation(workLocationId: string, orgId: string) {
    const loc = await this.prisma.workLocation.findFirst({
      where: { id: workLocationId, org_id: orgId },
      select: { id: true },
    });
    if (!loc) {
      throw new NotFoundException(
        'Sede/obra no encontrada o no pertenece a tu organización',
      );
    }
    return loc;
  }

  /** Verifica que el submission existe y pertenece a la org; retorna con include */
  private async requireSubmission(submissionId: string, orgId: string) {
    const submission = await this.prisma.formSubmission.findFirst({
      where: { id: submissionId, org_id: orgId },
      include: {
        template: {
          include: {
            signature_config: true,
            fields: { orderBy: { order: 'asc' } },
          },
        },
        submitter: { select: { id: true, name: true } },
        values: {
          include: {
            field: { select: { id: true, label: true, key: true, type: true, section: true } },
          },
          orderBy: { field: { order: 'asc' } },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Permiso no encontrado o no tienes acceso');
    }

    return submission;
  }

  /** Verifica que el firmante externo existe y pertenece a la org */
  private async requireExternalSigner(signerId: string, orgId: string) {
    const signer = await this.prisma.externalSigner.findFirst({
      where: { id: signerId, org_id: orgId },
    });
    if (!signer) {
      throw new NotFoundException('Firmante externo no encontrado');
    }
    return signer;
  }

  /** Verifica que el template existe y pertenece a la org */
  private async requireTemplate(templateId: string, orgId: string) {
    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, org_id: orgId },
      select: { id: true },
    });
    if (!template) {
      throw new NotFoundException('Plantilla no encontrada o no pertenece a tu organización');
    }
    return template;
  }

  /**
   * Valida que la suma total de segundos del log de lectura sea >= umbral.
   * S-05: aplica cap de 300s por sección antes de sumar (evita manipulación client-side).
   * Lanza 422 con mensaje claro si no se cumple.
   */
  private validateReadingTime(
    readingLog: ReadingLogEntryDto[],
    minSeconds: number,
  ): void {
    if (minSeconds === 0) return;

    const MAX_SECONDS_PER_SECTION = 300;

    const totalSeconds = readingLog.reduce(
      (acc, entry) => acc + Math.min(entry.seconds_viewed, MAX_SECONDS_PER_SECTION),
      0,
    );

    if (totalSeconds < minSeconds) {
      throw new UnprocessableEntityException(
        `Tiempo de lectura insuficiente. Se requieren al menos ${minSeconds} segundos en total. ` +
          `Registrado: ${totalSeconds} segundos.`,
      );
    }
  }

  /**
   * S-05: valida que cada section_or_field_id del reading_log exista en el
   * conjunto real de secciones/campos del submission. Lanza 422 si hay IDs inválidos.
   *
   * El conjunto válido se deriva de los field.section y field.id de los values
   * del submission. Un ID es válido si coincide con una sección real o con un
   * field_id real del documento.
   */
  private validateReadingLogIds(
    readingLog: ReadingLogEntryDto[],
    submission: Awaited<ReturnType<typeof this.requireSubmission>>,
  ): void {
    if (readingLog.length === 0) return;

    // Construir el set de IDs válidos: secciones + field_ids del submission
    const validIds = new Set<string>();
    for (const v of submission.values) {
      validIds.add(v.field_id); // ID del campo
      if (v.field.section) {
        validIds.add(v.field.section); // nombre de la sección (usado como ID por externos)
      }
    }

    const invalidIds = readingLog
      .map((e) => e.section_or_field_id)
      .filter((id) => !validIds.has(id));

    if (invalidIds.length > 0) {
      throw new UnprocessableEntityException(
        `section_or_field_id inválido(s) en reading_log: ${invalidIds.join(', ')}`,
      );
    }
  }

  /**
   * Construye el objeto canónico del documento y calcula su hash SHA-256.
   * El objeto canónico es versionado (ver canonical-hash.util.ts).
   *
   * BUG-1 / S-06 (v2): asOf controla qué firmantes se incluyen en el hash.
   * - signature_tokens con created_at <= asOf (firmantes externos invitados antes de asOf)
   * - signature_records con signed_at <= asOf (firmantes que ya habían firmado antes de asOf)
   * Si asOf es undefined, se usa la fecha actual (comportamiento "ahora").
   * Esto garantiza que el hash calculado al momento de la firma no cambia cuando
   * se agregan más firmantes después.
   */
  private async computeDocumentHash(
    submission: Awaited<ReturnType<typeof this.requireSubmission>>,
    asOf?: Date,
  ): Promise<string> {
    const cutoff = asOf ?? new Date();

    // Construir lista de preguntas ordenadas por field.id asc
    const preguntas: CanonicalQuestion[] = submission.values
      .slice()
      .sort((a, b) => a.field_id.localeCompare(b.field_id))
      .map((v) => ({
        id: v.field_id,
        pregunta: v.field.label,
        respuesta: this.resolveSubmissionValue(v),
      }));

    // Firmantes externos: tokens creados en o antes del cutoff
    const tokens = await this.prisma.signatureToken.findMany({
      where: {
        submission_id: submission.id,
        created_at: { lte: cutoff },
      },
      include: {
        external_signer: { select: { identification_number: true, name: true } },
      },
    });

    // Firmantes internos: records firmados en o antes del cutoff
    const internalRecords = await this.prisma.signatureRecord.findMany({
      where: {
        submission_id: submission.id,
        signer_type: SignerType.INTERNAL,
        signed_at: { lte: cutoff },
      },
      include: {
        internal_user: { select: { id: true, name: true, identification_number: true } },
      },
    });

    const firmantesExternos: CanonicalSigner[] = tokens.map((t) => ({
      cedula: t.external_signer.identification_number,
      nombre: t.external_signer.name,
      rol: 'EXTERNAL',
    }));
    const firmantesInternos: CanonicalSigner[] = internalRecords.map((r) => ({
      cedula: r.internal_user?.identification_number ?? r.internal_user_id ?? '',
      nombre: r.internal_user?.name ?? 'Desconocido',
      rol: 'INTERNAL',
    }));

    const firmantes: CanonicalSigner[] = [...firmantesInternos, ...firmantesExternos].sort(
      (a, b) => a.cedula.localeCompare(b.cedula),
    );

    const canonicalDoc: CanonicalDocument = {
      permiso_id: submission.id,
      empresa_id: submission.org_id,
      tipo_permiso: submission.template.name,
      fecha_creacion: submission.submitted_at.toISOString(),
      preguntas,
      firmantes,
    };

    return calculateCanonicalHash(canonicalDoc);
  }

  /**
   * Resuelve el valor de un FormSubmissionValue a string para el hash canónico.
   */
  private resolveSubmissionValue(
    value: {
      value_text: string | null;
      value_number: number | null;
      value_date: Date | null;
      value_json: unknown;
      value_file: string | null;
    },
  ): string {
    if (value.value_text !== null) return value.value_text;
    if (value.value_number !== null) return String(value.value_number);
    if (value.value_date !== null) return value.value_date.toISOString();
    if (value.value_json !== null) return JSON.stringify(value.value_json);
    if (value.value_file !== null) return value.value_file;
    return '';
  }

  /**
   * Agrupa los valores del submission por sección para la vista del firmante externo.
   */
  private buildSectionedContent(
    values: Array<{
      id: string;
      field: {
        id: string;
        label: string;
        key: string;
        type: string;
        section: string | null;
      };
      value_text: string | null;
      value_number: number | null;
      value_date: Date | null;
      value_json: unknown;
      value_file: string | null;
    }>,
    _sections: Record<string, unknown> | null,
  ) {
    const sectionMap = new Map<
      string,
      { section_name: string; fields: unknown[] }
    >();

    for (const v of values) {
      const sectionKey = v.field.section ?? 'General';
      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, { section_name: sectionKey, fields: [] });
      }
      sectionMap.get(sectionKey)!.fields.push({
        field_id: v.field.id,
        label: v.field.label,
        type: v.field.type,
        value: this.resolveSubmissionValue(v),
      });
    }

    return Array.from(sectionMap.values());
  }

  /**
   * Notifica al dueño del submission que un firmante externo firmó (best-effort).
   * Si el módulo de notificaciones no está disponible, solo loguea.
   */
  private async tryNotifySubmissionOwner(
    submission: { id: string; submitted_by: string; template: { name: string } },
    signerName: string,
  ): Promise<void> {
    try {
      await this.notifications.create({
        user_id: submission.submitted_by,
        type: NotificationType.FORM_PENDING_SIGNATURE,
        title: 'Nueva firma registrada',
        body: `${signerName} firmó "${submission.template.name}"`,
      });
    } catch (err: unknown) {
      this.logger.warn(`No se pudo notificar al dueño del submission: ${String(err)}`);
    }
  }

  /** Detecta violación de unique constraint de Prisma (P2002) */
  private isPrismaUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    );
  }

  /**
   * Detecta que el registro a actualizar/eliminar no se encontró (P2025).
   * Ocurre en la transacción de signExternal cuando el token ya fue usado
   * por otro hilo concurrente (race condition).
   */
  private isPrismaRecordNotFound(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2025'
    );
  }
}
