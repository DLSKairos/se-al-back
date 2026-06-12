import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SignatureLinkStatus, SignerType } from '@prisma/client';
import { ElectronicSignatureService } from './electronic-signature.service';
import { HASH_VERSION } from './canonical-hash.util';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS MANUALES (estilo del proyecto — sin jest-mock-extended)
// ═══════════════════════════════════════════════════════════════════════════════

const mockSignatureTokenFindUnique = jest.fn();
const mockSignatureTokenUpdate = jest.fn();
const mockSignatureTokenFindMany = jest.fn();
const mockSignatureTokenUpdateMany = jest.fn();
const mockSignatureTokenCreate = jest.fn();
const mockSignatureRecordCreate = jest.fn();
const mockSignatureRecordFindFirst = jest.fn();
const mockSignatureRecordFindMany = jest.fn();
const mockFormSubmissionFindFirst = jest.fn();
const mockExternalSignerFindFirst = jest.fn();
const mockExternalSignerFindMany = jest.fn();
const mockWorkLocationFindFirst = jest.fn();

const prisma = {
  signatureToken: {
    findUnique: mockSignatureTokenFindUnique,
    update: mockSignatureTokenUpdate,
    findMany: mockSignatureTokenFindMany,
    updateMany: mockSignatureTokenUpdateMany,
    create: mockSignatureTokenCreate,
  },
  signatureRecord: {
    create: mockSignatureRecordCreate,
    findFirst: mockSignatureRecordFindFirst,
    findMany: mockSignatureRecordFindMany,
  },
  formSubmission: {
    findFirst: mockFormSubmissionFindFirst,
  },
  externalSigner: {
    findFirst: mockExternalSignerFindFirst,
    findMany: mockExternalSignerFindMany,
  },
  workLocation: {
    findFirst: mockWorkLocationFindFirst,
  },
} as any;

// S-01: signExternal usa $transaction interactiva — el callback recibe el mismo
// objeto de mocks para que tx.signatureToken/tx.signatureRecord funcionen.
prisma.$transaction = jest.fn(async (arg: any) =>
  typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
);

const redis = {
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(undefined),
} as any;

const fileStorage = {
  uploadPrivate: jest.fn(),
  generateSignedUrl: jest.fn(),
} as any;

const config = {
  get: jest.fn().mockImplementation((key: string, defaultValue: unknown) => defaultValue),
} as any;

const formApproval = {
  checkAutoApproval: jest.fn().mockResolvedValue(undefined),
} as any;

const notifications = {
  create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
} as any;

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

const NOW = new Date('2026-06-10T12:00:00.000Z');
// PAST es estático (sirve para fechas de expiración ya vencidas)
const PAST = new Date('2026-06-10T10:00:00.000Z');   // -2h desde NOW fixture
// FUTURE debe ser dinámica para que expire DESPUÉS de cuando corre el test
function futureDate(hoursAhead = 2): Date {
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
}

type SubmissionFixture = {
  id: string;
  org_id: string;
  submitted_by: string;
  submitted_at: Date;
  template: {
    id: string;
    name: string;
    signature_config: {
      min_reading_seconds: number;
      signature_mode: string;
      requires_internal_sign: boolean;
    } | null;
    fields: unknown[];
  };
  submitter: { id: string; name: string };
  values: Array<{
    field_id: string;
    field: { id: string; label: string; key: string; type: string; section: string };
    value_text: string | null;
    value_number: number | null;
    value_date: Date | null;
    value_json: unknown;
    value_file: string | null;
  }>;
};

type TokenFixture = {
  id: string;
  token: string;
  submission_id: string;
  external_signer_id: string;
  expires_at: Date;
  used_at: Date | null;
  viewed_at: Date | null;
  link_status: SignatureLinkStatus;
  external_signer: {
    id: string;
    name: string;
    identification_number: string;
    phone: string;
    org_id: string;
    is_registered: boolean;
  };
  submission: SubmissionFixture;
};

/** Submission base con template y valores ya cargados */
function buildSubmission(overrides: Partial<SubmissionFixture> = {}): SubmissionFixture {
  return {
    id: 'sub-001',
    org_id: 'org-001',
    submitted_by: 'user-operator-1',
    submitted_at: NOW,
    template: {
      id: 'tmpl-001',
      name: 'Permiso en Altura',
      signature_config: {
        min_reading_seconds: 30,
        signature_mode: 'STRICT',
        requires_internal_sign: false,
      },
      fields: [],
    },
    submitter: { id: 'user-operator-1', name: 'Operario Test' },
    values: [
      {
        field_id: 'field-a',
        field: { id: 'field-a', label: '¿Usa EPP?', key: 'epp', type: 'YES_NO', section: 'Seguridad' },
        value_text: 'Sí',
        value_number: null,
        value_date: null,
        value_json: null,
        value_file: null,
      },
    ],
    ...overrides,
  };
}

/** Token de firma base — expires_at siempre en el futuro para evitar TOKEN_EXPIRED falso */
function buildToken(overrides: Partial<TokenFixture> = {}): TokenFixture {
  return {
    id: 'tok-001',
    token: 'abc-token-xyz',
    submission_id: 'sub-001',
    external_signer_id: 'ext-001',
    expires_at: futureDate(2),
    used_at: null,
    viewed_at: null,
    link_status: SignatureLinkStatus.SENT,
    external_signer: {
      id: 'ext-001',
      name: 'Carlos Rincón',
      identification_number: '900800700',
      phone: '+573001234567',
      org_id: 'org-001',
      is_registered: true,
    },
    submission: buildSubmission(),
    ...overrides,
  };
}

const baseSignExternalDto = {
  stroke_vectors: [{ x: 10, y: 20, t: 1234567890 }],
  stroke_image_base64: 'dGVzdA==', // "test" en base64
  geo_lat: 4.6097,
  geo_lng: -74.0817,
  geo_accuracy: 10,
  reading_log: [{ section_or_field_id: 'Seguridad', seconds_viewed: 35 }],
};

const baseSignInternalDto = {
  stroke_vectors: [{ x: 10, y: 20, t: 1234567890 }],
  stroke_image_base64: 'dGVzdA==',
  geo_lat: 4.6097,
  geo_lng: -74.0817,
  reading_log: [{ section_or_field_id: 'Seguridad', seconds_viewed: 35 }],
  webauthn_session_active: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('ElectronicSignatureService', () => {
  let service: ElectronicSignatureService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ElectronicSignatureService(
      prisma,
      redis,
      fileStorage,
      config,
      formApproval,
      notifications,
    );

    // Por defecto, el token no consulta signature_tokens ni signatureRecord en computeDocumentHash
    mockSignatureTokenFindMany.mockResolvedValue([]);
    mockSignatureRecordFindMany.mockResolvedValue([]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // validateAndLoadToken (privado, testeado a través de getPublicSignatureContent)
  // ───────────────────────────────────────────────────────────────────────────

  describe('validateAndLoadToken — via getPublicSignatureContent', () => {
    it('should throw BadRequestException with TOKEN_INVALID when token does not exist', async () => {
      mockSignatureTokenFindUnique.mockResolvedValue(null);

      const error = await service
        .getPublicSignatureContent('nonexistent-token', '1.2.3.4')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'TOKEN_INVALID',
      });
    });

    it('should throw BadRequestException with TOKEN_USED when token has used_at', async () => {
      // used_at presente (cualquier fecha no nula) y expires_at en el futuro
      mockSignatureTokenFindUnique.mockResolvedValue(
        buildToken({ used_at: NOW, expires_at: futureDate(2) }),
      );

      const error = await service
        .getPublicSignatureContent('used-token', '1.2.3.4')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'TOKEN_USED',
      });
    });

    it('should throw BadRequestException with TOKEN_EXPIRED when token is past its expiry', async () => {
      mockSignatureTokenFindUnique.mockResolvedValue(
        buildToken({ used_at: null, expires_at: PAST }),
      );

      const error = await service
        .getPublicSignatureContent('expired-token', '1.2.3.4')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'TOKEN_EXPIRED',
      });
    });

    it('should mark token as VIEWED on first access (status was SENT)', async () => {
      mockSignatureTokenFindUnique.mockResolvedValue(
        buildToken({ link_status: SignatureLinkStatus.SENT }),
      );
      mockSignatureTokenUpdate.mockResolvedValue({});

      await service.getPublicSignatureContent('abc-token-xyz', '1.2.3.4');

      expect(mockSignatureTokenUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tok-001' },
          data: expect.objectContaining({ link_status: SignatureLinkStatus.VIEWED }),
        }),
      );
    });

    it('should NOT update status if token is already VIEWED (idempotente)', async () => {
      mockSignatureTokenFindUnique.mockResolvedValue(
        buildToken({ link_status: SignatureLinkStatus.VIEWED }),
      );

      await service.getPublicSignatureContent('abc-token-xyz', '1.2.3.4');

      expect(mockSignatureTokenUpdate).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // signExternal
  // ───────────────────────────────────────────────────────────────────────────

  describe('signExternal', () => {
    beforeEach(() => {
      mockSignatureRecordCreate.mockResolvedValue({
        id: 'rec-001',
        signed_at: NOW,
        document_hash: 'a'.repeat(64),
      });
      mockSignatureTokenUpdate.mockResolvedValue({});
    });

    it('should throw UnprocessableEntityException when reading time is insufficient', async () => {
      const token = buildToken({
        submission: buildSubmission({
          template: {
            id: 'tmpl-001',
            name: 'Permiso en Altura',
            signature_config: { min_reading_seconds: 60, signature_mode: 'STRICT', requires_internal_sign: false },
            fields: [],
          },
        } as any),
      });
      mockSignatureTokenFindUnique.mockResolvedValue(token);

      const shortReadingDto = {
        ...baseSignExternalDto,
        reading_log: [{ section_or_field_id: 'sec-1', seconds_viewed: 10 }], // solo 10s, necesita 60
      };

      await expect(
        service.signExternal('abc-token-xyz', shortReadingDto as any, '1.2.3.4', 'Mozilla/5.0'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should create SignatureRecord with all evidence fields on successful sign', async () => {
      mockSignatureTokenFindUnique.mockResolvedValue(buildToken());

      await service.signExternal(
        'abc-token-xyz',
        baseSignExternalDto as any,
        '5.6.7.8',
        'Chrome/120',
        formApproval,
      );

      expect(mockSignatureRecordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            submission_id: 'sub-001',
            signer_type: SignerType.EXTERNAL,
            external_signer_id: 'ext-001',
            ip_address: '5.6.7.8',
            user_agent: 'Chrome/120',
            hash_version: HASH_VERSION,
            webauthn_session: false,
          }),
        }),
      );
    });

    it('should mark the token as used (used_at) and SIGNED after successful sign', async () => {
      mockSignatureTokenFindUnique.mockResolvedValue(buildToken());

      await service.signExternal(
        'abc-token-xyz',
        baseSignExternalDto as any,
        '1.2.3.4',
        'UA',
        formApproval,
      );

      expect(mockSignatureTokenUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          // S-01: el where incluye used_at: null (update condicional atómico)
          where: { id: 'tok-001', used_at: null },
          data: expect.objectContaining({
            used_at: expect.any(Date),
            link_status: SignatureLinkStatus.SIGNED,
          }),
        }),
      );
    });

    it('should delete the Redis cache key for the token after signing', async () => {
      mockSignatureTokenFindUnique.mockResolvedValue(buildToken());

      await service.signExternal(
        'abc-token-xyz',
        baseSignExternalDto as any,
        '1.2.3.4',
        'UA',
        formApproval,
      );

      expect(redis.del).toHaveBeenCalledWith('firma_token:abc-token-xyz');
    });

    it('should call checkAutoApproval after successful sign', async () => {
      mockSignatureTokenFindUnique.mockResolvedValue(buildToken());

      const mockApproval = { checkAutoApproval: jest.fn().mockResolvedValue(undefined) };

      await service.signExternal(
        'abc-token-xyz',
        baseSignExternalDto as any,
        '1.2.3.4',
        'UA',
        mockApproval,
      );

      expect(mockApproval.checkAutoApproval).toHaveBeenCalledWith('sub-001');
    });

    it('should notify the submission owner after signing', async () => {
      mockSignatureTokenFindUnique.mockResolvedValue(buildToken());

      await service.signExternal(
        'abc-token-xyz',
        baseSignExternalDto as any,
        '1.2.3.4',
        'UA',
        formApproval,
      );

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-operator-1',
        }),
      );
    });

    it('should return signature_record_id and document_hash', async () => {
      mockSignatureTokenFindUnique.mockResolvedValue(buildToken());

      const result = await service.signExternal(
        'abc-token-xyz',
        baseSignExternalDto as any,
        '1.2.3.4',
        'UA',
        formApproval,
      );

      expect(result).toHaveProperty('signature_record_id');
      expect(result).toHaveProperty('document_hash');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // signInternal
  // ───────────────────────────────────────────────────────────────────────────

  describe('signInternal', () => {
    beforeEach(() => {
      mockFormSubmissionFindFirst.mockResolvedValue(buildSubmission());
      mockSignatureRecordFindFirst.mockResolvedValue(null); // sin firma previa
      mockSignatureRecordCreate.mockResolvedValue({
        id: 'rec-002',
        signed_at: NOW,
        document_hash: 'b'.repeat(64),
      });
    });

    it('should throw ConflictException when the same user tries to sign twice', async () => {
      mockSignatureRecordFindFirst.mockResolvedValue({ id: 'rec-existing' });

      await expect(
        service.signInternal(
          'sub-001',
          'user-operator-1',
          'org-001',
          baseSignInternalDto as any,
          '1.2.3.4',
          'Chrome',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should create SignatureRecord of type INTERNAL on first sign', async () => {
      await service.signInternal(
        'sub-001',
        'user-operator-1',
        'org-001',
        baseSignInternalDto as any,
        '1.2.3.4',
        'Chrome',
        formApproval,
      );

      expect(mockSignatureRecordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            signer_type: SignerType.INTERNAL,
            internal_user_id: 'user-operator-1',
            submission_id: 'sub-001',
            hash_version: HASH_VERSION,
          }),
        }),
      );
    });

    it('should persist webauthn_session field from dto', async () => {
      await service.signInternal(
        'sub-001',
        'user-operator-1',
        'org-001',
        { ...baseSignInternalDto, webauthn_session_active: true } as any,
        '1.2.3.4',
        'Chrome',
        formApproval,
      );

      expect(mockSignatureRecordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ webauthn_session: true }),
        }),
      );
    });

    it('should call checkAutoApproval after successful internal sign', async () => {
      const mockApproval = { checkAutoApproval: jest.fn().mockResolvedValue(undefined) };

      await service.signInternal(
        'sub-001',
        'user-operator-1',
        'org-001',
        baseSignInternalDto as any,
        '1.2.3.4',
        'Chrome',
        mockApproval,
      );

      expect(mockApproval.checkAutoApproval).toHaveBeenCalledWith('sub-001');
    });

    it('should throw NotFoundException when submission does not belong to the org', async () => {
      mockFormSubmissionFindFirst.mockResolvedValue(null);

      await expect(
        service.signInternal(
          'sub-other',
          'user-1',
          'org-001',
          baseSignInternalDto as any,
          '1.2.3.4',
          'Chrome',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnprocessableEntityException when reading time < minSeconds for internal sign', async () => {
      mockFormSubmissionFindFirst.mockResolvedValue(
        buildSubmission({
          template: {
            id: 'tmpl-001',
            name: 'Permiso en Altura',
            signature_config: { min_reading_seconds: 60, signature_mode: 'STRICT', requires_internal_sign: true },
            fields: [],
          },
        } as any),
      );

      const shortDto = {
        ...baseSignInternalDto,
        reading_log: [{ section_or_field_id: 'sec-1', seconds_viewed: 5 }],
      };

      await expect(
        service.signInternal(
          'sub-001',
          'user-1',
          'org-001',
          shortDto as any,
          '1.2.3.4',
          'Chrome',
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // verifyDocumentIntegrity
  // ───────────────────────────────────────────────────────────────────────────

  describe('verifyDocumentIntegrity', () => {
    beforeEach(() => {
      mockFormSubmissionFindFirst.mockResolvedValue(buildSubmission());
      // computeDocumentHash needs these
      mockSignatureTokenFindMany.mockResolvedValue([]);
      mockSignatureRecordFindMany.mockResolvedValue([]);
    });

    it('should return valid=true when stored hash matches recomputed hash', async () => {
      // computeDocumentHash llama signatureRecord.findMany con {signer_type: INTERNAL}
      // Después, verifyDocumentIntegrity llama signatureRecord.findMany sin filtro de tipo.
      // Usamos mockResolvedValueOnce para separar las dos llamadas.

      const { calculateCanonicalHash } = await import('./canonical-hash.util');
      const submission = buildSubmission();

      // El hash canónico con firmantes vacíos (la primera llamada interna devuelve [])
      const expectedHash = calculateCanonicalHash({
        permiso_id: submission.id,
        empresa_id: submission.org_id,
        tipo_permiso: submission.template.name,
        fecha_creacion: submission.submitted_at.toISOString(),
        preguntas: [
          { id: 'field-a', pregunta: '¿Usa EPP?', respuesta: 'Sí' },
        ],
        firmantes: [],
      });

      // v2 as-of: verifyDocumentIntegrity primero lee los records a verificar y
      // LUEGO computeDocumentHash(asOf) consulta los internos por cada record.
      prisma.signatureRecord.findMany = jest.fn()
        .mockResolvedValueOnce([                     // records a verificar
          {
            id: 'rec-001',
            document_hash: expectedHash,
            hash_version: HASH_VERSION,
            signed_at: NOW,
            signer_type: SignerType.EXTERNAL,
          },
        ])
        .mockResolvedValueOnce([]);                  // internos en computeDocumentHash

      const result = await service.verifyDocumentIntegrity('sub-001', 'org-001');

      expect(result.valid).toBe(true);
      expect(result.records[0].valid).toBe(true);
    });

    it('should return valid=false when stored hash does not match (data altered)', async () => {
      // v2 as-of: primero los records a verificar, luego los internos
      prisma.signatureRecord.findMany = jest.fn()
        .mockResolvedValueOnce([
          {
            id: 'rec-001',
            document_hash: 'tampered-hash-that-is-wrong',
            hash_version: HASH_VERSION,
            signed_at: NOW,
            signer_type: SignerType.EXTERNAL,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.verifyDocumentIntegrity('sub-001', 'org-001');

      expect(result.valid).toBe(false);
      expect(result.records[0].valid).toBe(false);
    });

    it('should return stored_hash and current_hash in each record', async () => {
      prisma.signatureRecord.findMany = jest.fn()
        .mockResolvedValueOnce([
          {
            id: 'rec-001',
            document_hash: 'wrong',
            hash_version: HASH_VERSION,
            signed_at: NOW,
            signer_type: SignerType.INTERNAL,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.verifyDocumentIntegrity('sub-001', 'org-001');

      expect(result.records[0]).toHaveProperty('stored_hash', 'wrong');
      expect(result.records[0]).toHaveProperty('current_hash');
    });

    it('should throw NotFoundException when submission does not belong to org', async () => {
      mockFormSubmissionFindFirst.mockResolvedValue(null);

      await expect(
        service.verifyDocumentIntegrity('sub-001', 'wrong-org'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Multi-tenant: listExternalSigners
  // ───────────────────────────────────────────────────────────────────────────

  describe('listExternalSigners — multi-tenant isolation', () => {
    it('should throw NotFoundException when workLocation belongs to a different org', async () => {
      mockWorkLocationFindFirst.mockResolvedValue(null); // no pertenece a la org

      await expect(
        service.listExternalSigners('org-hacker', 'work-loc-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return signers filtered by org and workLocation', async () => {
      mockWorkLocationFindFirst.mockResolvedValue({ id: 'work-loc-1' });
      mockExternalSignerFindMany.mockResolvedValue([
        { id: 'ext-1', name: 'Ana', identification_number: '111', phone: '+57300', is_registered: true, created_at: NOW },
      ]);

      const result = await service.listExternalSigners('org-001', 'work-loc-1');

      expect(mockExternalSignerFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { org_id: 'org-001', work_location_id: 'work-loc-1' },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });
});
