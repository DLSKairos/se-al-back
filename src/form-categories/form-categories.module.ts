import { Module } from '@nestjs/common';
import { FormCategoriesService } from './form-categories.service';
import { FormCategoriesController } from './form-categories.controller';

@Module({
  controllers: [FormCategoriesController],
  providers: [FormCategoriesService],
  exports: [FormCategoriesService],
})
export class FormCategoriesModule {}
