import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Writable } from 'stream';
import { DateTime } from 'luxon';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import {
  SUBMISSION_STATUS_LABELS,
  formatDateTime,
  formatFieldValue,
  resolvePdfImage,
} from './form-export-values';
// pdfmake es un módulo CommonJS — importamos con require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake');

const PDF_FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const TZ = 'America/Bogota';
const BATCH_PAGE_SIZE = 500;
const MAX_BATCH_RANGE_DAYS = 366;
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9E1F2' },
};

type PdfContent = Record<string, unknown>;

@Injectable()
export class FormExportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── PDF individual ────────────────────────────────────────────────────────

  async exportPdf(submissionId: string, orgId: string, userId: string, userRole: string): Promise<Buffer> {
    const submission = await this.loadSubmission(submissionId, orgId, userId, userRole);
    const { template } = submission;
    const fields = template.fields;

    // Usa el snapshot data del submission — no re-consulta values
    const data = submission.data as Record<string, unknown>;
    const accent = this.safeColor(submission.org.config?.primary_color) ?? '#1e3a5f';
    const orgName = submission.org.config?.display_name ?? submission.org.name;

    // Imágenes (logo, firmas, fotos) en paralelo; las no resolubles caen a texto
    const [logo, fieldImages, formSignatureImages, recordImages] = await Promise.all([
      resolvePdfImage(submission.org.config?.logo_url, { trustAnyHost: true }),
      Promise.all(
        fields.map((f) =>
          f.type === 'SIGNATURE' || f.type === 'PHOTO' ? resolvePdfImage(data[f.key]) : null,
        ),
      ),
      Promise.all(submission.signatures.map((s) => resolvePdfImage(s.signature_url))),
      Promise.all(submission.signature_records.map((r) => resolvePdfImage(r.stroke_image_base64))),
    ]);

    // Tabla Campo / Valor, agrupada por sección
    const tableBody: PdfContent[][] = [
      [
        { text: 'Campo', bold: true, fillColor: '#eeeeee' },
        { text: 'Valor', bold: true, fillColor: '#eeeeee' },
      ],
    ];

    let currentSection: string | null | undefined;
    fields.forEach((field, i) => {
      if (field.section && field.section !== currentSection) {
        tableBody.push([
          { text: field.section, bold: true, colSpan: 2, fillColor: '#f5f5f5' },
          {},
        ]);
      }
      currentSection = field.section;

      const img = fieldImages[i];
      const valueCell: PdfContent = img
        ? { image: img, fit: field.type === 'SIGNATURE' ? [200, 80] : [240, 180] }
        : { text: formatFieldValue(field, data[field.key]) };

      tableBody.push([{ text: field.label }, valueCell]);
    });

    const submitterName = submission.submitter?.name ?? '—';
    const status = SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status;

    const content: PdfContent[] = [
      {
        columns: [
          logo ? { image: logo, fit: [90, 50], width: 100 } : { text: '', width: 0 },
          {
            stack: [
              { text: orgName, fontSize: 10, color: '#555555' },
              { text: template.name, fontSize: 18, bold: true, color: accent },
            ],
          },
        ],
        columnGap: 10,
        margin: [0, 0, 0, 4],
      },
    ];

    if (template.description) {
      content.push({ text: template.description, fontSize: 11, color: '#555555', margin: [0, 0, 0, 8] });
    }

    content.push({
      columns: [
        {
          stack: [
            { text: `Enviado por: ${submitterName}`, fontSize: 10 },
            { text: `Ubicación: ${submission.work_location?.name ?? '—'}`, fontSize: 10 },
          ],
        },
        {
          stack: [
            { text: `Fecha: ${formatDateTime(submission.submitted_at)}`, fontSize: 10 },
            { text: `Estado: ${status}`, fontSize: 10, bold: true },
          ],
          alignment: 'right',
        },
      ],
      margin: [0, 0, 0, 12],
    });

    if (submission.status === 'REJECTED' && submission.rejection_reason) {
      content.push({
        text: `Motivo de rechazo: ${submission.rejection_reason}`,
        fontSize: 10,
        color: '#b91c1c',
        margin: [0, 0, 0, 12],
      });
    }

    content.push({
      table: { headerRows: 1, widths: ['40%', '60%'], body: tableBody },
      layout: 'lightHorizontalLines',
    });

    // Firmas: simples (FormSignature) y electrónicas (SignatureRecord)
    const signatureBlocks: PdfContent[] = [];
    submission.signatures.forEach((s, i) => {
      signatureBlocks.push(
        this.signatureBlock(
          formSignatureImages[i],
          s.signer_name,
          [s.signer_role, s.signer_doc && `CC ${s.signer_doc}`],
          s.signed_at,
        ),
      );
    });
    submission.signature_records.forEach((r, i) => {
      const name = r.internal_user?.name ?? r.external_signer?.name ?? '—';
      const doc = r.internal_user?.identification_number ?? r.external_signer?.identification_number;
      signatureBlocks.push(
        this.signatureBlock(
          recordImages[i],
          name,
          [r.signer_type === 'EXTERNAL' ? 'Externo' : 'Interno', doc && `CC ${doc}`],
          r.signed_at,
        ),
      );
    });

    if (signatureBlocks.length) {
      content.push({ text: 'Firmas', fontSize: 13, bold: true, margin: [0, 16, 0, 6] });
      content.push({ columns: signatureBlocks, columnGap: 12 });
    }

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 50],
      defaultStyle: { font: 'Helvetica' },
      content,
      footer: (currentPage: number, pageCount: number) => ({
        text: `SEÑAL · ${orgName} · Página ${currentPage} de ${pageCount}`,
        alignment: 'center',
        fontSize: 8,
        color: '#888888',
        margin: [0, 15, 0, 0],
      }),
    };

    return new Promise((resolve, reject) => {
      const printer = new PdfPrinter(PDF_FONTS);
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];

      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }

  // ─── Excel individual ──────────────────────────────────────────────────────

  async exportExcel(submissionId: string, orgId: string, userId: string, userRole: string): Promise<Buffer> {
    const submission = await this.loadSubmission(submissionId, orgId, userId, userRole);
    const { template } = submission;
    const data = submission.data as Record<string, unknown>;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SEÑAL';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(
      template.name.substring(0, 31), // Excel limita nombres de hoja a 31 chars
    );

    // columns define header (fila 1) + anchos; luego addRow con objeto por key
    sheet.columns = template.fields.map((f) => ({
      header: f.label,
      key: f.key,
      width: Math.max(f.label.length + 4, 16),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = HEADER_FILL;

    sheet.addRow(
      Object.fromEntries(template.fields.map((f) => [f.key, formatFieldValue(f, data[f.key])])),
    );

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // ─── Excel batch (múltiples submissions, en streaming) ────────────────────

  /**
   * Valida y resuelve la plantilla ANTES de que el controller envíe headers HTTP,
   * para que un error devuelva JSON normal y no un archivo corrupto.
   * `write(stream)` escribe el xlsx página por página sin cargarlo todo en memoria.
   */
  async prepareBatchExcel(templateId: string, orgId: string, from: string, to: string) {
    const start = DateTime.fromISO(from, { zone: TZ }).startOf('day');
    const end = DateTime.fromISO(to, { zone: TZ }).endOf('day');
    if (!start.isValid || !end.isValid) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    if (end < start) {
      throw new BadRequestException('"from" no puede ser posterior a "to"');
    }
    if (end.diff(start, 'days').days > MAX_BATCH_RANGE_DAYS) {
      throw new BadRequestException(`El rango máximo es de ${MAX_BATCH_RANGE_DAYS} días`);
    }

    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, org_id: orgId },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
    if (!template) {
      throw new NotFoundException('Plantilla de formulario no encontrada');
    }

    const where = {
      template_id: templateId,
      org_id: orgId,
      submitted_at: { gte: start.toJSDate(), lte: end.toJSDate() },
    };

    const write = async (stream: Writable): Promise<void> => {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
      workbook.creator = 'SEÑAL';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet(template.name.substring(0, 31));
      sheet.columns = [
        { header: 'Fecha', key: 'fecha', width: 22 },
        { header: 'Usuario', key: 'usuario', width: 24 },
        { header: 'Documento', key: 'documento', width: 16 },
        { header: 'Ubicación', key: 'ubicacion', width: 24 },
        { header: 'Estado', key: 'estado', width: 18 },
        ...template.fields.map((f) => ({
          header: f.label,
          key: f.key,
          width: Math.max(f.label.length + 4, 16),
        })),
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = HEADER_FILL;
      headerRow.commit();

      let cursor: string | undefined;
      for (;;) {
        const page = await this.prisma.formSubmission.findMany({
          where,
          include: {
            submitter: { select: { name: true, identification_number: true } },
            work_location: { select: { name: true } },
          },
          orderBy: [{ submitted_at: 'desc' }, { id: 'desc' }],
          take: BATCH_PAGE_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        for (const sub of page) {
          const data = sub.data as Record<string, unknown>;
          sheet
            .addRow({
              fecha: formatDateTime(sub.submitted_at),
              usuario: sub.submitter?.name ?? '—',
              documento: sub.submitter?.identification_number ?? '—',
              ubicacion: sub.work_location?.name ?? '—',
              estado: SUBMISSION_STATUS_LABELS[sub.status] ?? sub.status,
              ...Object.fromEntries(
                template.fields.map((f) => [f.key, formatFieldValue(f, data[f.key])]),
              ),
            })
            .commit();
        }

        if (page.length < BATCH_PAGE_SIZE) break;
        cursor = page[page.length - 1].id;
      }

      sheet.commit();
      await workbook.commit();
    };

    return { write };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private signatureBlock(
    image: string | null,
    name: string,
    details: Array<string | null | undefined>,
    signedAt: Date,
  ): PdfContent {
    return {
      stack: [
        image
          ? { image, fit: [160, 70] }
          : { text: '[Firma no disponible]', fontSize: 8, color: '#888888', margin: [0, 25, 0, 25] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.5 }] },
        { text: name, fontSize: 9, bold: true, margin: [0, 2, 0, 0] },
        ...details.filter(Boolean).map((d) => ({ text: d as string, fontSize: 8, color: '#555555' })),
        { text: formatDateTime(signedAt), fontSize: 8, color: '#555555' },
      ],
      margin: [0, 0, 0, 8],
    };
  }

  /** Solo acepta #rgb / #rrggbb para no inyectar valores arbitrarios en el PDF. */
  private safeColor(c: string | null | undefined): string | null {
    return c && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : null;
  }

  private async loadSubmission(submissionId: string, orgId: string, userId: string, userRole: string) {
    const submission = await this.prisma.formSubmission.findFirst({
      where: { id: submissionId, org_id: orgId },
      include: {
        template: { include: { fields: { orderBy: { order: 'asc' } } } },
        submitter: { select: { name: true, identification_number: true } },
        work_location: { select: { name: true } },
        org: {
          select: {
            name: true,
            config: { select: { display_name: true, logo_url: true, primary_color: true } },
          },
        },
        signatures: { orderBy: { signed_at: 'asc' } },
        signature_records: {
          orderBy: { signed_at: 'asc' },
          include: {
            internal_user: { select: { name: true, identification_number: true } },
            external_signer: { select: { name: true, identification_number: true } },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Envío no encontrado');
    }

    // OPERATOR solo puede exportar sus propias submissions (Fix #8)
    if (userRole === 'OPERATOR' && submission.submitted_by !== userId) {
      throw new ForbiddenException('No tienes permiso para exportar este envío');
    }

    return submission;
  }
}
