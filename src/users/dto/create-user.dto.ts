import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

/**
 * Roles que un usuario puede recibir a través de la API pública de gestión
 * (POST /users, PATCH /users/:id). SUPER_ADMIN queda EXCLUIDO a propósito:
 * solo se asigna por seed/migración fuera de banda (Fix seguridad C1).
 */
export const ASSIGNABLE_ROLES = [UserRole.OPERATOR, UserRole.ADMIN] as const;

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  identification_number: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  job_title?: string;

  @IsIn(ASSIGNABLE_ROLES, {
    message: 'Rol inválido: solo se permite OPERATOR o ADMIN',
  })
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  work_location_id?: string;

  @IsBoolean()
  @IsOptional()
  pin_enabled?: boolean;
}
