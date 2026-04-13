import { Module } from '@nestjs/common';
import { FormExportsService } from './form-exports.service';
import { FormExportsController } from './form-exports.controller';

@Module({
  controllers: [FormExportsController],
  providers: [FormExportsService],
  exports: [FormExportsService],
})
export class FormExportsModule {}
