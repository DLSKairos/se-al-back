import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkLocationDto } from './create-work-location.dto';

export class UpdateWorkLocationDto extends PartialType(CreateWorkLocationDto) {}
