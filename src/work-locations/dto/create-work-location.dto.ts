import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';

@ValidatorConstraint({ name: 'latLngOrAddress', async: false })
class LatLngOrAddressConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as CreateWorkLocationDto;
    const hasCoords = obj.lat !== undefined && obj.lng !== undefined;
    const hasAddress = obj.address !== undefined && obj.address !== '';
    return hasCoords || hasAddress;
  }

  defaultMessage(): string {
    return 'Debe proporcionar (lat y lng) o bien una dirección (address)';
  }
}

export class CreateWorkLocationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  contractor: string;

  @IsString()
  @IsOptional()
  department_id?: string;

  // Opción A: coordenadas directas
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  lat?: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  lng?: number;

  // Opción B: dirección para geocoding
  @IsString()
  @IsOptional()
  address?: string;

  @Validate(LatLngOrAddressConstraint)
  _coordsOrAddress?: never;
}
