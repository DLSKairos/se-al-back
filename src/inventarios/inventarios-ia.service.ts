import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { validateMagicBytes } from '../common/utils/magic-bytes.util';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type AllowedImageType = typeof ALLOWED_IMAGE_TYPES[number];

const PROMPT = `Eres un asistente experto en extracción de datos de documentos. Analiza esta factura y extrae TODA la información disponible.

La factura puede ser de cualquier tipo: comercial, electrónica, de venta, de servicios, etc.

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin bloques de código, con esta estructura exacta:

{
  "numero_factura": "string o null",
  "fecha_factura": "string o null (formato DD/MM/YYYY si es posible)",
  "proveedor": "string o null (nombre del vendedor/emisor)",
  "nit_proveedor": "string o null (NIT, RUT, RUC u otro identificador del emisor)",
  "cliente": "string o null (nombre del comprador/receptor)",
  "documento_cliente": "string o null (cédula, NIT u otro identificador del cliente)",
  "ciudad": "string o null",
  "moneda": "string o null (COP, USD, EUR, etc.)",
  "forma_pago": "string o null (Contado, Crédito, etc.)",
  "items": [
    {
      "codigo": "string o null (código de producto, referencia, SKU)",
      "descripcion": "string (descripción del producto o servicio)",
      "cantidad": number o null,
      "unidad": "string o null (unidad de medida)",
      "valor_unitario": number o null,
      "valor_total": number o null
    }
  ],
  "subtotal": number o null,
  "total_iva": number o null,
  "total_factura": number o null,
  "observaciones": "string o null"
}

Si un campo no es visible o no existe en el documento, usa null. No inventes información.`;

@Injectable()
export class InventariosIaService {
  private readonly logger = new Logger(InventariosIaService.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly config: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
  }

  async extraerDatosFactura(file: Express.Multer.File) {
    const isPdf = file.mimetype === 'application/pdf';
    const isImage = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype);

    if (!isPdf && !isImage) {
      throw new BadRequestException('Solo se aceptan imágenes (JPEG, PNG, WebP) o PDF');
    }

    // Validar magic bytes contra content-type spoofing (Fix #9)
    validateMagicBytes(file.buffer, file.mimetype);

    const base64 = file.buffer.toString('base64');

    try {
      let texto: string;

      if (isPdf) {
        const response = await this.anthropic.messages.create(
          {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2048,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'document',
                    source: {
                      type: 'base64',
                      media_type: 'application/pdf',
                      data: base64,
                    },
                  } as any,
                  { type: 'text', text: PROMPT },
                ],
              },
            ],
          },
          { headers: { 'anthropic-beta': 'pdfs-2024-09-25' } },
        );
        texto = response.content[0].type === 'text' ? response.content[0].text : '';
      } else {
        const response = await this.anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: file.mimetype as AllowedImageType,
                    data: base64,
                  },
                },
                { type: 'text', text: PROMPT },
              ],
            },
          ],
        });
        texto = response.content[0].type === 'text' ? response.content[0].text : '';
      }

      const jsonStr = texto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      return JSON.parse(jsonStr);
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error('[InventariosIA] Error en extracción de factura');
      throw new InternalServerErrorException('No se pudo procesar el archivo. Intente nuevamente.');
    }
  }
}
