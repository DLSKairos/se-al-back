import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import { FormApprovalService } from './form-approval.service';
import { RejectSubmissionDto } from './dto/reject-submission.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

/**
 * Endpoints de aprobación/rechazo de formularios para el panel admin.
 *
 * - GET  /admin/submissions        — lista con filtro de estado
 * - PATCH /admin/submissions/:id/reject — rechazar con motivo
 */
@Controller('admin/submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class FormApprovalController {
  constructor(private readonly formApprovalService: FormApprovalService) {}

  /**
   * Lista submissions de la org con filtro opcional de estado.
   * PENDING_SIGNATURES se muestra en la UI como "En revisión".
   */
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: SubmissionStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.formApprovalService.findForAdmin(
      user.orgId,
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * Rechaza un envío con motivo obligatorio (mín 10 chars).
   * Solo aplicable a SUBMITTED o PENDING_SIGNATURES.
   */
  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectSubmissionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formApprovalService.reject(id, user.sub, user.orgId, dto.reason);
  }
}
