import { Controller, Get, UseGuards } from '@nestjs/common';
import { StatusService } from './status.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

@Controller('status')
@UseGuards(JwtAuthGuard)
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  /**
   * Retorna el contexto mínimo del usuario autenticado.
   * Diseñado para responder en < 300ms.
   * Cache Redis TTL 60s.
   */
  @Get('user-context')
  getUserContext(@CurrentUser() user: JwtPayload) {
    return this.statusService.getUserContext(user.sub);
  }
}
