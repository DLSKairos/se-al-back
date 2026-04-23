import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FormBlueprintsService } from './form-blueprints.service';
import { CreateFormBlueprintDto } from './dto/create-form-blueprint.dto';
import { QueryFormBlueprintsDto } from './dto/query-form-blueprints.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

@Controller('form-blueprints')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class FormBlueprintsController {
  constructor(private readonly formBlueprintsService: FormBlueprintsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryFormBlueprintsDto) {
    return this.formBlueprintsService.findAll(user.orgId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateFormBlueprintDto, @CurrentUser() user: JwtPayload) {
    return this.formBlueprintsService.create(user.orgId, dto);
  }

  @Post(':id/use')
  @HttpCode(HttpStatus.CREATED)
  use(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.formBlueprintsService.use(id, user.orgId, user.sub);
  }
}
