import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';
import { FormExportsService } from './form-exports.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

class BatchExcelQueryDto {
  @IsString()
  @IsNotEmpty()
  template_id: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

@Controller('form-exports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormExportsController {
  constructor(private readonly formExportsService: FormExportsService) {}

  /**
   * Exporta un batch de submissions de un template a Excel.
   * Declarado ANTES de los endpoints con :submissionId para evitar conflicto.
   */
  @Roles('ADMIN')
  @Get('batch/excel')
  async exportBatchExcel(
    @Query() query: BatchExcelQueryDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: false }) res: Response,
  ) {
    if (!query.template_id || !query.from || !query.to) {
      throw new BadRequestException(
        'Se requieren los parámetros: template_id, from, to',
      );
    }

    const buffer = await this.formExportsService.exportBatchExcel(
      query.template_id,
      user.orgId,
      new Date(query.from),
      new Date(query.to),
    );

    const filename = `reporte-${query.template_id}-${query.from}_${query.to}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  /**
   * Exporta una submission individual a PDF.
   */
  @Get(':submissionId/pdf')
  async exportPdf(
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: false }) res: Response,
  ) {
    const buffer = await this.formExportsService.exportPdf(
      submissionId,
      user.orgId,
    );
    const filename = `formulario-${submissionId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  /**
   * Exporta una submission individual a Excel.
   */
  @Get(':submissionId/excel')
  async exportExcel(
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: false }) res: Response,
  ) {
    const buffer = await this.formExportsService.exportExcel(
      submissionId,
      user.orgId,
    );
    const filename = `formulario-${submissionId}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }
}
