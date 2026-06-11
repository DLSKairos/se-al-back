import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { FeatureFlagsService, KNOWN_FLAGS } from './feature-flags.service';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller()
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  /**
   * GET /feature-flags
   * Público — retorna los flags relevantes para la UI.
   * Cache-Control: max-age=30 para que navegadores y CDN cacheen.
   */
  @Public()
  @Get('feature-flags')
  async getPublicFlags(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=30');
    return this.featureFlagsService.getAllKnownFlags();
  }

  /**
   * PATCH /superadmin/feature-flags/:flag
   * Solo SUPER_ADMIN. Activa o desactiva un flag en tiempo real.
   * Retorna 404 si el flag no pertenece al conjunto conocido
   * (no revelar qué flags existen más allá de los conocidos).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Patch('superadmin/feature-flags/:flag')
  async updateFlag(
    @Param('flag') flag: string,
    @Body() dto: UpdateFeatureFlagDto,
  ) {
    if (!(KNOWN_FLAGS as readonly string[]).includes(flag)) {
      throw new NotFoundException(`Flag '${flag}' no encontrado`);
    }

    await this.featureFlagsService.setFlag(flag, dto.enabled);
    return { flag, enabled: dto.enabled };
  }
}
