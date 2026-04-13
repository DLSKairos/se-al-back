import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FormCategoriesService } from './form-categories.service';
import { CreateFormCategoryDto } from './dto/create-form-category.dto';
import { UpdateFormCategoryDto } from './dto/update-form-category.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

@Controller('form-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormCategoriesController {
  constructor(private readonly formCategoriesService: FormCategoriesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.formCategoriesService.findAll(user.orgId);
  }

  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateFormCategoryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formCategoriesService.create(user.orgId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.formCategoriesService.findOne(id, user.orgId);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFormCategoryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formCategoriesService.update(id, user.orgId, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.formCategoriesService.remove(id, user.orgId);
  }
}
