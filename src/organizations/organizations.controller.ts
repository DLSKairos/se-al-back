import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  /**
   * Lista todas las organizaciones del sistema.
   * Solo SUPER_ADMIN puede ver la lista completa.
   */
  @Roles('SUPER_ADMIN')
  @Get()
  findAll() {
    return this.orgsService.findAll();
  }

  /**
   * Crea una nueva organización.
   * Solo SUPER_ADMIN puede crear organizaciones.
   */
  @Roles('SUPER_ADMIN')
  @Post()
  create(@Body() dto: CreateOrganizationDto) {
    return this.orgsService.create(dto);
  }

  /**
   * Obtiene el detalle de una organización.
   * ADMIN solo puede ver su propia organización; SUPER_ADMIN puede ver cualquiera.
   */
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    // ADMIN solo puede consultar su propia org
    const targetId = user.role === 'SUPER_ADMIN' ? id : user.orgId;
    return this.orgsService.findById(targetId);
  }

  /**
   * Actualiza datos de una organización.
   * Solo SUPER_ADMIN puede actualizar.
   */
  @Roles('SUPER_ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.orgsService.update(id, dto);
  }
}
