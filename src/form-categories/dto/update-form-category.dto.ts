import { PartialType } from '@nestjs/mapped-types';
import { CreateFormCategoryDto } from './create-form-category.dto';

export class UpdateFormCategoryDto extends PartialType(CreateFormCategoryDto) {}
