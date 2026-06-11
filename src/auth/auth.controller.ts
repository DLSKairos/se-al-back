import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { PinService } from './pin/pin.service';
import { WebAuthnService } from './webauthn/webauthn.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from './dto/jwt-payload.dto';
import { PinStatusDto } from './dto/pin-status.dto';
import { PinSetDto } from './dto/pin-set.dto';
import { PinVerifyDto } from './dto/pin-verify.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly pinService: PinService,
    private readonly webAuthnService: WebAuthnService,
  ) {}

  private extractIp(req: Request): string {
    return req.ip ?? '0.0.0.0';
  }

  // ─── PIN ───────────────────────────────────────────────────

  /**
   * Consulta si un usuario tiene PIN configurado.
   * Público: se usa antes del login para saber si mostrar el teclado PIN.
   * Rate-limited por IP (Fix #4).
   */
  @Public()
  @Post('pin/status')
  pinStatus(@Body() dto: PinStatusDto, @Req() req: Request) {
    return this.pinService.getStatus(dto.identification_number, this.extractIp(req));
  }

  /**
   * Configura o actualiza el PIN de un usuario.
   * Solo ADMIN puede usar este endpoint (Fix #1 — escalada de privilegios).
   * El frontend usa /users/:id/pin/set; este endpoint es respaldo para ADMIN.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('pin/set')
  pinSet(@Body() dto: PinSetDto, @CurrentUser() user: JwtPayload) {
    return this.pinService.setPin(dto.identification_number, dto.pin, user.orgId);
  }

  /**
   * Crea el PIN inicial de un usuario sin PIN previo y devuelve access_token.
   * Solo funciona si el usuario nunca tuvo PIN (pin_hash === null).
   * Rate-limited por IP (Fix #4).
   */
  @Public()
  @Post('pin/init')
  pinInit(@Body() dto: PinVerifyDto, @Req() req: Request) {
    return this.authService.initPinAndLogin(dto.identification_number, dto.pin, this.extractIp(req));
  }

  /**
   * Verifica el PIN y devuelve un access_token JWT.
   * La IP se extrae del request para el rate-limiter.
   */
  @Public()
  @Post('pin/verify')
  pinVerify(@Body() dto: PinVerifyDto, @Req() req: Request) {
    // req.ip es seguro porque trust proxy está configurado en main.ts (Fix #5)
    const ip = req.ip ?? '0.0.0.0';
    return this.authService.loginWithPin(
      dto.identification_number,
      dto.pin,
      ip,
    );
  }

  /**
   * Devuelve el payload del JWT del usuario autenticado actualmente.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  // ─── WebAuthn ──────────────────────────────────────────────

  /**
   * Genera opciones de registro de passkey.
   * El usuario ya debe estar autenticado (JWT) para registrar una nueva passkey.
   */
  @UseGuards(JwtAuthGuard)
  @Post('webauthn/register/begin')
  webAuthnRegisterBegin(@CurrentUser() user: JwtPayload) {
    return this.webAuthnService.generateRegistrationOptions(user.sub);
  }

  /**
   * Verifica y guarda la credencial WebAuthn tras el registro.
   */
  @UseGuards(JwtAuthGuard)
  @Post('webauthn/register/finish')
  webAuthnRegisterFinish(
    @Body('attestationResponse') attestationResponse: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.webAuthnService.verifyRegistration(user.sub, attestationResponse as any);
  }

  /**
   * Registro biométrico inicial sin JWT.
   * Solo funciona si el usuario no tiene credenciales biométricas previas.
   */
  @Public()
  @Post('webauthn/register-init/begin')
  webAuthnRegisterInitBegin(
    @Body('identification_number') identificationNumber: string,
  ) {
    return this.webAuthnService.generateRegistrationOptionsByIdentification(identificationNumber);
  }

  /**
   * Verifica el registro biométrico inicial y devuelve access_token.
   * Combina el registro con el login en un solo paso.
   */
  @Public()
  @Post('webauthn/register-init/finish')
  webAuthnRegisterInitFinish(
    @Body('identification_number') identificationNumber: string,
    @Body('attestationResponse') attestationResponse: Record<string, unknown>,
  ) {
    return this.authService.registerWebAuthnAndLogin(identificationNumber, attestationResponse as any);
  }

  /**
   * Genera opciones de autenticación WebAuthn para el login sin contraseña.
   */
  @Public()
  @Post('webauthn/login/begin')
  webAuthnLoginBegin(
    @Body('identification_number') identificationNumber: string,
  ) {
    return this.webAuthnService.generateAuthenticationOptions(
      identificationNumber,
    );
  }

  /**
   * Verifica la respuesta del autenticador y devuelve un access_token.
   * El body debe incluir identification_number, response y expectedChallenge.
   */
  @Public()
  @Post('webauthn/login/finish')
  webAuthnLoginFinish(
    @Body('identification_number') identificationNumber: string,
    @Body('assertionResponse') assertionResponse: Record<string, unknown>,
  ) {
    return this.authService.loginWithWebAuthn(
      identificationNumber,
      assertionResponse as any,
    );
  }
}
