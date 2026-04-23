import { Module } from '@nestjs/common';
import { FormBlueprintsController } from './form-blueprints.controller';
import { FormBlueprintsService } from './form-blueprints.service';

@Module({
  controllers: [FormBlueprintsController],
  providers: [FormBlueprintsService],
})
export class FormBlueprintsModule {}
