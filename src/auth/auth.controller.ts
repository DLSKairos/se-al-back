import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { PinService } from './pin/pin.service';
import { WebAuthnService } from './webauthn/webauthn.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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

  // ─── PIN ───────────────────────────────────────────────────

  /**
   * Consulta si un usuario tiene PIN configurado.
   * Público: se usa antes del login para saber si mostrar el teclado PIN.
   */
  @Public()
  @Post('pin/status')
  pinStatus(@Body() dto: PinStatusDto) {
    return this.pinService.getStatus(dto.identification_number);
  }

  /**
   * Configura o actualiza el PIN de cualquier usuario identificado por
   * identification_number. Requiere JWT (el ADMIN o el propio usuario).
   */
  @UseGuards(JwtAuthGuard)
  @Post('pin/set')
  pinSet(@Body() dto: PinSetDto) {
    return this.pinService.setPin(dto.identification_number, dto.pin);
  }

  /**
   * Crea el PIN inicial de un usuario sin PIN previo y devuelve access_token.
   * Solo funciona si el usuario nunca tuvo PIN (pin_hash === null).
   * Fallback cuando WebAuthn no está disponible en el dispositivo.
   */
  @Public()
  @Post('pin/init')
  pinInit(@Body() dto: PinVerifyDto) {
    return this.authService.initPinAndLogin(dto.identification_number, dto.pin);
  }

  /**
   * Verifica el PIN y devuelve un access_token JWT.
   * La IP se extrae del request para el rate-limiter.
   */
  @Public()
  @Post('pin/verify')
  pinVerify(@Body() dto: PinVerifyDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
      req.socket.remoteAddress ??
      '0.0.0.0';
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
