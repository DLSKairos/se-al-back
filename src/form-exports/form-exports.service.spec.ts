import { PassThrough } from 'stream';
import * as ExcelJS from 'exceljs';
import { FormExportsService } from './form-exports.service';
import { formatFieldValue, resolvePdfImage } from './form-export-values';

// PNG 1x1 válido
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`;

const fields = [
  { id: 'f1', key: 'nombre', label: 'Nombre', type: 'TEXT', order: 1, section: 'General' },
  { id: 'f2', key: 'epp', label: 'EPP', type: 'MULTISELECT', order: 2, section: 'General' },
  { id: 'f3', key: 'ok', label: 'Conforme', type: 'BOOLEAN', order: 3, section: null },
  { id: 'f4', key: 'firma', label: 'Firma', type: 'SIGNATURE', order: 4, section: null },
  { id: 'f5', key: 'foto', label: 'Foto', type: 'PHOTO', order: 5, section: null },
];

const submission = {
  id: 's1',
  status: 'APPROVED',
  submitted_by: 'u1',
  submitted_at: new Date('2026-03-10T15:00:00Z'),
  rejection_reason: null,
  data: { nombre: 'Juan', epp: ['casco', 'guantes'], ok: true, firma: PNG_DATA_URL, foto: PNG_DATA_URL },
  template: { name: 'Permiso', description: 'Desc', fields },
  submitter: { name: 'Juan Pérez', identification_number: '123' },
  work_location: { name: 'Obra Norte' },
  org: { name: 'Org', config: { display_name: 'Kairos Demo', logo_url: null, primary_color: '#123456' } },
  signatures: [
    { signer_name: 'Ana', signer_role: 'SST', signer_doc: '9', signature_url: PNG_DATA_URL, signed_at: new Date() },
  ],
  signature_records: [
    {
      signer_type: 'EXTERNAL',
      stroke_image_base64: PNG_B64,
      signed_at: new Date(),
      internal_user: null,
      external_signer: { name: 'Pedro', identification_number: '55' },
    },
  ],
};

describe('form-export-values', () => {
  it('formatea según tipo de campo', () => {
    expect(formatFieldValue({ type: 'MULTISELECT' }, ['a', 'b'])).toBe('a, b');
    expect(formatFieldValue({ type: 'BOOLEAN' }, false)).toBe('No');
    expect(formatFieldValue({ type: 'DATE' }, '2026-03-10')).toBe('10/03/2026');
    expect(formatFieldValue({ type: 'GEOLOCATION' }, { lat: 4.6, lng: -74 })).toBe('4.6, -74');
    expect(formatFieldValue({ type: 'SIGNATURE' }, PNG_DATA_URL)).toBe('[Firma adjunta]');
  });

  it('resolvePdfImage acepta PNG y rechaza basura / hosts no confiables', async () => {
    expect(await resolvePdfImage(PNG_DATA_URL)).toMatch(/^data:image\/png/);
    expect(await resolvePdfImage(PNG_B64)).toMatch(/^data:image\/png/);
    expect(await resolvePdfImage('hola mundo')).toBeNull();
    expect(await resolvePdfImage('https://evil.example/x.png')).toBeNull();
    expect(await resolvePdfImage('http://res.cloudinary.com/x.png')).toBeNull();
  });
});

describe('FormExportsService', () => {
  const prisma: any = {
    formSubmission: { findFirst: jest.fn(), findMany: jest.fn() },
    formTemplate: { findFirst: jest.fn() },
  };
  const service = new FormExportsService(prisma);

  beforeEach(() => jest.resetAllMocks());

  it('genera un PDF válido con firmas e imágenes', async () => {
    prisma.formSubmission.findFirst.mockResolvedValue(submission);
    const pdf: any = await service.exportPdf('s1', 'o1', 'u1', 'ADMIN');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
  });

  it('OPERATOR no puede exportar envíos ajenos', async () => {
    prisma.formSubmission.findFirst.mockResolvedValue(submission);
    await expect(service.exportPdf('s1', 'o1', 'otro', 'OPERATOR')).rejects.toThrow('permiso');
  });

  it('Excel individual: headers en fila 1 y datos en fila 2 sin base64', async () => {
    prisma.formSubmission.findFirst.mockResolvedValue(submission);
    const buf: any = await service.exportExcel('s1', 'o1', 'u1', 'ADMIN');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    expect(ws.rowCount).toBe(2);
    expect(ws.getRow(1).getCell(1).value).toBe('Nombre');
    expect(ws.getRow(2).getCell(2).value).toBe('casco, guantes');
    expect(ws.getRow(2).getCell(4).value).toBe('[Firma adjunta]');
  });

  it('Excel batch: pagina en streaming y rechaza rangos inválidos', async () => {
    prisma.formTemplate.findFirst.mockResolvedValue({ name: 'Permiso', fields });
    const page = (n: number, start: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...submission,
        id: `s${start + i}`,
        submitted_at: new Date('2026-03-10T15:00:00Z'),
      }));
    prisma.formSubmission.findMany
      .mockResolvedValueOnce(page(500, 0))
      .mockResolvedValueOnce(page(3, 500));

    const report = await service.prepareBatchExcel('t1', 'o1', '2026-03-01', '2026-03-31');
    const out = new PassThrough();
    const chunks: any[] = [];
    out.on('data', (c) => chunks.push(c));
    await report.write(out);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((Buffer as any).concat(chunks));
    expect(wb.worksheets[0].rowCount).toBe(1 + 503);
    expect(prisma.formSubmission.findMany.mock.calls[1][0].cursor).toEqual({ id: 's499' });

    // "to" cubre todo el día en hora Bogotá
    const where = prisma.formSubmission.findMany.mock.calls[0][0].where;
    expect(where.submitted_at.lte.toISOString()).toBe('2026-04-01T04:59:59.999Z');

    await expect(service.prepareBatchExcel('t1', 'o1', '2026-03-31', '2026-03-01')).rejects.toThrow();
    await expect(service.prepareBatchExcel('t1', 'o1', '2024-01-01', '2026-03-01')).rejects.toThrow('máximo');
  });
});
