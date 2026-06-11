import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubmissionStatus } from '@prisma/client';

export class ChangeStatusDto {
  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;

  /**
   * Motivo del rechazo u observación de revisión (opcional).
   * Se persiste en review_notes al rechazar.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
