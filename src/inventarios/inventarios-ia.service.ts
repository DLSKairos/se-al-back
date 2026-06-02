import { Injectable, BadRequestException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class InventariosIaService {
  private readonly anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  async extraerDatosFactura(file: Express.Multer.File) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Solo se aceptan imágenes (JPEG, PNG, WebP)');
    }

    const imagenBase64 = file.buffer.toString('base64');
    const mediaType = file.mimetype as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imagenBase64,
                },
              },
              {
                type: 'text',
                text: `Eres un asistente especializado en documentos de comercio exterior y aduanas colombianas.

Analiza esta factura comercial y extrae la información de los ítems.

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin bloques de código, con esta estructura exacta:

{
  "numero_factura": "string o null",
  "fecha_factura": "string o null",
  "proveedor": "string o null",
  "consignatario": "string o null",
  "incoterm": "string o null",
  "moneda": "string o null",
  "items": [
    {
      "descripcion": "string",
      "codigo_arancelario": "string o null",
      "cantidad": number o null,
      "peso_kg": number o null,
      "precio_unitario": number o null,
      "precio_total": number o null,
      "pais_origen": "string o null"
    }
  ],
  "total_factura": number o null,
  "observaciones": "string o null"
}

Si un campo no es visible o no existe en el documento, usa null. No inventes información.`,
              },
            ],
          },
        ],
      });

      const texto = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonStr = texto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      return { success: true, data: JSON.parse(jsonStr) };
    } catch (err) {
      console.error('[InventariosIA] Error en extracción:', err);
      return { success: false, data: null, error: 'No se pudo extraer la información automáticamente' };
    }
  }
}
