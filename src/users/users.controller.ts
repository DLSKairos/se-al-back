import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Lista todos los usuarios activos de la organización.
   */
  @Roles('ADMIN')
  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.usersService.findAll(user.orgId);
  }

  /**
   * Crea un nuevo usuario dentro de la organización.
   */
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.usersService.create(user.orgId, dto);
  }

  /**
   * Obtiene un usuario por ID (mismo org).
   */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.findOne(id, user.orgId);
  }

  /**
   * Actualiza datos de un usuario.
   */
  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.update(id, user.orgId, dto);
  }

  /**
   * Activa o desactiva el PIN de un usuario.
   */
  @Roles('ADMIN')
  @Patch(':id/pin-enable')
  setPinEnabled(
    @Param('id') id: string,
    @Body('enabled') enabled: boolean,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.setPinEnabled(id, user.orgId, enabled);
  }

  /**
   * Soft-delete: desactiva al usuario sin eliminarlo de la BD.
   */
  @Roles('ADMIN')
  @Delete(':id')
  softDelete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.softDelete(id, user.orgId);
  }

  /**
   * Lista las credenciales WebAuthn del usuario.
   */
  @Get(':id/webauthn/credentials')
  listWebAuthnCredentials(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.listWebAuthnCredentials(id, user.orgId);
  }

  /**
   * Revoca una credencial WebAuthn específica del usuario.
   */
  @Delete(':id/webauthn/credentials/:credId')
  revokeWebAuthnCredential(
    @Param('id') id: string,
    @Param('credId') credId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.revokeWebAuthnCredential(id, credId, user.orgId);
  }
}
