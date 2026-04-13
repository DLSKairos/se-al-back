import { Module } from '@nestjs/common';
import { FormSignaturesService } from './form-signatures.service';
import { FormSignaturesController } from './form-signatures.controller';

@Module({
  controllers: [FormSignaturesController],
  providers: [FormSignaturesService],
  exports: [FormSignaturesService],
})
export class FormSignaturesModule {}
