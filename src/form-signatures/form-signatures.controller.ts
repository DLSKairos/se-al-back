import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FormSignaturesService } from './form-signatures.service';
import { CreateSignatureDto } from './dto/create-signature.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

/**
 * Las firmas son sub-recursos de una submission.
 * Ruta base: /form-submissions/:submissionId/signatures
 */
@Controller('form-submissions/:submissionId/signatures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormSignaturesController {
  constructor(private readonly formSignaturesService: FormSignaturesService) {}

  /**
   * Agrega una firma a la submission indicada.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('submissionId') submissionId: string,
    @Body() dto: CreateSignatureDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formSignaturesService.create(submissionId, user.orgId, dto);
  }

  /**
   * Lista todas las firmas de la submission.
   */
  @Get()
  findAll(
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formSignaturesService.findAll(submissionId, user.orgId);
  }
}
