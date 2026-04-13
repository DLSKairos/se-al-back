import { PartialType } from '@nestjs/mapped-types';
import { CreateFormFieldDto } from './create-form-field.dto';

export class UpdateFormFieldDto extends PartialType(CreateFormFieldDto) {}
