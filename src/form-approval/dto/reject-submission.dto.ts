import { IsString, MinLength } from 'class-validator';

export class RejectSubmissionDto {
  @IsString()
  @MinLength(10, {
    message: 'El motivo de rechazo debe tener al menos 10 caracteres',
  })
  reason: string;
}
