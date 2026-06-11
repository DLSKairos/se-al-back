import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PinService } from '../auth/pin/pin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

class SetPinDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,8}$/, { message: 'El PIN debe ser numérico de 4 a 8 dígitos' })
  pin: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly pinService: PinService,
  ) {}

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
   * OPERATOR solo puede ver su propia información (Fix #2).
   */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.role === 'OPERATOR' && id !== user.sub) {
      throw new ForbiddenException('No tienes permiso para ver este usuario');
    }
    return this.usersService.findOne(id, user.orgId);
  }

  /**
   * Establece el PIN de un usuario. Solo ADMIN (Fix #1).
   * El frontend llama a POST /users/:id/pin/set.
   */
  @Roles('ADMIN')
  @Post(':id/pin/set')
  async setPinForUser(
    @Param('id') id: string,
    @Body() dto: SetPinDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // Obtener el identification_number del usuario a partir de su id
    const target = await this.usersService.findOne(id, user.orgId);
    return this.pinService.setPin(target.identification_number, dto.pin, user.orgId);
  }

  /**
   * Elimina el PIN de un usuario. Solo ADMIN.
   * El frontend llama a DELETE /users/:id/pin.
   */
  @Roles('ADMIN')
  @Delete(':id/pin')
  async deletePinForUser(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.setPinEnabled(id, user.orgId, false);
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
