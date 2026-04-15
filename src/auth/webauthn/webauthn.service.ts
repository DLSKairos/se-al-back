import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const CHALLENGE_TTL_SECONDS = 300; // 5 minutos

@Injectable()
export class WebAuthnService {
  private readonly rpName: string;
  private readonly rpId: string;
  private readonly origin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.rpName = this.config.get<string>('WEBAUTHN_RP_NAME', 'SEÑAL');
    this.rpId = this.config.get<string>('WEBAUTHN_RP_ID', 'localhost');
    this.origin = this.config.get<string>(
      'WEBAUTHN_ORIGIN',
      'http://localhost:3000',
    );
  }

  // ─── Registro ──────────────────────────────────────────────────────────────

  async generateRegistrationOptions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { webauthn_credentials: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const excludeCredentials = user.webauthn_credentials.map((cred) => ({
      id: cred.credential_id,
    }));

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userName: user.identification_number,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await this.redis.set(
      `webauthn:challenge:${userId}`,
      options.challenge,
      CHALLENGE_TTL_SECONDS,
    );

    return options;
  }

  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
  ): Promise<void> {
    const storedChallenge = await this.redis.get(
      `webauthn:challenge:${userId}`,
    );

    if (!storedChallenge) {
      throw new BadRequestException('Challenge inválido o expirado');
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: storedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
      });
    } catch (err) {
      throw new BadRequestException(
        `Error al verificar registro WebAuthn: ${(err as Error).message}`,
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Verificación de registro fallida');
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    await this.prisma.webAuthnCredential.create({
      data: {
        user_id: userId,
        credential_id: credential.id,
        public_key: Buffer.from(credential.publicKey as Uint8Array).toString('base64'),
        sign_count: credential.counter,
        authenticator_type: `${credentialDeviceType}${credentialBackedUp ? ':backed_up' : ''}`,
      },
    });

    await this.redis.del(`webauthn:challenge:${userId}`);
  }

  // ─── Autenticación ─────────────────────────────────────────────────────────

  async generateAuthenticationOptions(identificationNumber: string) {
    const user = await this.prisma.user.findUnique({
      where: { identification_number: identificationNumber },
      include: { webauthn_credentials: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.webauthn_credentials.length === 0) {
      throw new BadRequestException(
        'El usuario no tiene credenciales WebAuthn registradas',
      );
    }

    const allowCredentials = user.webauthn_credentials.map((cred) => ({
      id: cred.credential_id,
    }));

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials,
      userVerification: 'preferred',
    });

    await this.redis.set(
      `webauthn:challenge:${user.id}`,
      options.challenge,
      CHALLENGE_TTL_SECONDS,
    );

    return options;
  }

  async verifyAuthentication(
    identificationNumber: string,
    response: AuthenticationResponseJSON,
  ): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { identification_number: identificationNumber },
      include: { webauthn_credentials: true },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    const storedChallenge = await this.redis.get(
      `webauthn:challenge:${user.id}`,
    );

    if (!storedChallenge) {
      throw new BadRequestException('Challenge inválido o expirado');
    }

    const credential = user.webauthn_credentials.find(
      (c) => c.credential_id === response.id,
    );

    if (!credential) {
      throw new UnauthorizedException('Credencial no reconocida');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: storedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        credential: {
          id: credential.credential_id,
          publicKey: new Uint8Array(Buffer.from(credential.public_key, 'base64')),
          counter: credential.sign_count,
        },
      });
    } catch (err) {
      throw new UnauthorizedException(
        `Error al verificar autenticación WebAuthn: ${(err as Error).message}`,
      );
    }

    if (!verification.verified) {
      throw new UnauthorizedException('Autenticación WebAuthn fallida');
    }

    // Actualizar sign_count para protección contra ataques de replay
    await this.prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: { sign_count: verification.authenticationInfo.newCounter },
    });

    await this.redis.del(`webauthn:challenge:${user.id}`);

    return user;
  }
}
