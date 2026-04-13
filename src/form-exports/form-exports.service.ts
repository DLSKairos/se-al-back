import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
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

@Injectable()
export class FormExportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── PDF individual ────────────────────────────────────────────────────────

  async exportPdf(submissionId: string, orgId: string): Promise<Buffer> {
    const submission = await this.loadSubmission(submissionId, orgId);
    const template = submission.template;
    const fields = template.fields;

    // Usa el snapshot data del submission — no re-consulta values
    const data = submission.data as Record<string, unknown>;

    const tableBody: unknown[][] = [
      [
        { text: 'Campo', style: 'tableHeader', bold: true },
        { text: 'Valor', style: 'tableHeader', bold: true },
      ],
    ];

    for (const field of fields) {
      const value = data[field.key];
      tableBody.push([
        { text: field.label },
        { text: this.formatValue(value) },
      ]);
    }

    const submitterName =
      (submission as { submitter?: { name: string } }).submitter?.name ?? '—';

    const docDefinition = {
      defaultStyle: { font: 'Helvetica' },
      content: [
        { text: template.name, style: 'title', fontSize: 18, bold: true },
        {
          text: template.description ?? '',
          style: 'subtitle',
          fontSize: 11,
          color: '#555555',
          margin: [0, 0, 0, 8],
        },
        {
          columns: [
            { text: `Enviado por: ${submitterName}`, fontSize: 10 },
            {
              text: `Fecha: ${new Date(submission.submitted_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
              fontSize: 10,
              alignment: 'right',
            },
          ],
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            headerRows: 1,
            widths: ['40%', '60%'],
            body: tableBody,
          },
          layout: 'lightHorizontalLines',
        },
      ],
      styles: {
        title: { margin: [0, 0, 0, 4] },
        subtitle: { margin: [0, 0, 0, 4] },
        tableHeader: { fillColor: '#eeeeee' },
      },
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

  async exportExcel(submissionId: string, orgId: string): Promise<Buffer> {
    const submission = await this.loadSubmission(submissionId, orgId);
    const template = submission.template;
    const fields = template.fields;
    const data = submission.data as Record<string, unknown>;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SEÑAL';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(
      template.name.substring(0, 31), // Excel limita nombres de hoja a 31 chars
    );

    // Fila de headers
    const headers = fields.map((f) => f.label);
    sheet.addRow(headers);

    // Estilos de header
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };

    // Fila de datos
    const values = fields.map((f) => this.formatValue(data[f.key]));
    sheet.addRow(values);

    // Ajustar anchos de columna
    sheet.columns = fields.map((f) => ({
      header: f.label,
      key: f.key,
      width: Math.max(f.label.length + 4, 16),
    }));

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ─── Excel batch (múltiples submissions) ──────────────────────────────────

  async exportBatchExcel(
    templateId: string,
    orgId: string,
    from: Date,
    to: Date,
  ): Promise<Buffer> {
    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, org_id: orgId },
      include: { fields: { orderBy: { order: 'asc' } } },
    });

    if (!template) {
      throw new NotFoundException('Plantilla de formulario no encontrada');
    }

    const submissions = await this.prisma.formSubmission.findMany({
      where: {
        template_id: templateId,
        org_id: orgId,
        submitted_at: { gte: from, lte: to },
      },
      include: {
        submitter: {
          select: { name: true, identification_number: true },
        },
        work_location: { select: { name: true } },
      },
      orderBy: { submitted_at: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SEÑAL';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(
      template.name.substring(0, 31),
    );

    // Headers: metadatos + campos dinámicos
    const metaHeaders = ['Fecha', 'Usuario', 'Documento', 'Ubicación'];
    const fieldHeaders = template.fields.map((f) => f.label);

    sheet.addRow([...metaHeaders, ...fieldHeaders]);

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };

    // Filas de datos
    for (const sub of submissions) {
      const data = sub.data as Record<string, unknown>;
      const submitter = (sub as { submitter?: { name: string; identification_number: string } }).submitter;

      const metaValues = [
        new Date(sub.submitted_at).toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
        }),
        submitter?.name ?? '—',
        submitter?.identification_number ?? '—',
        (sub as { work_location?: { name: string } }).work_location?.name ?? '—',
      ];

      const fieldValues = template.fields.map((f) =>
        this.formatValue(data[f.key]),
      );

      sheet.addRow([...metaValues, ...fieldValues]);
    }

    // Ajustar anchos
    sheet.columns = [
      { key: 'fecha', width: 22 },
      { key: 'usuario', width: 24 },
      { key: 'documento', width: 16 },
      { key: 'ubicacion', width: 24 },
      ...template.fields.map((f) => ({
        key: f.key,
        width: Math.max(f.label.length + 4, 16),
      })),
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async loadSubmission(submissionId: string, orgId: string) {
    const submission = await this.prisma.formSubmission.findFirst({
      where: { id: submissionId, org_id: orgId },
      include: {
        template: { include: { fields: { orderBy: { order: 'asc' } } } },
        submitter: { select: { name: true, identification_number: true } },
      },
    });

    if (!submission) {
      throw new NotFoundException('Envío no encontrado');
    }

    return submission;
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (value instanceof Date) {
      return value.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
