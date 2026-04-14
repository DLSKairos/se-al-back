import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { PinService } from './pin/pin.service';
import { WebAuthnService } from './webauthn/webauthn.service';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly pinService: PinService,
    private readonly webAuthnService: WebAuthnService,
  ) {}

  // ─── PIN ───────────────────────────────────────────────────────────────────

  async initPinAndLogin(
    identificationNumber: string,
    pin: string,
  ): Promise<{ access_token: string; user: UserPublic }> {
    const user = await this.pinService.initPin(identificationNumber, pin);
    const access_token = this.generateJwt(user);
    return { access_token, user: this.toPublic(user) };
  }

  async loginWithPin(
    identificationNumber: string,
    pin: string,
    ip: string,
  ): Promise<{ access_token: string; user: UserPublic }> {
    const user = await this.pinService.verifyPin(identificationNumber, pin, ip);
    const access_token = this.generateJwt(user);
    return { access_token, user: this.toPublic(user) };
  }

  // ─── WebAuthn ──────────────────────────────────────────────────────────────

  async loginWithWebAuthn(
    identificationNumber: string,
    webauthnResponse: AuthenticationResponseJSON,
    expectedChallenge: string,
  ): Promise<{ access_token: string; user: UserPublic }> {
    const user = await this.webAuthnService.verifyAuthentication(
      identificationNumber,
      webauthnResponse,
      expectedChallenge,
    );
    const access_token = this.generateJwt(user);
    return { access_token, user: this.toPublic(user) };
  }

  // ─── JWT ───────────────────────────────────────────────────────────────────

  generateJwt(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      orgId: user.org_id,
      role: user.role,
      jobTitle: user.job_title,
    });
  }

  private toPublic(user: User): UserPublic {
    return {
      id: user.id,
      name: user.name,
      identification_number: user.identification_number,
      job_title: user.job_title,
      role: user.role,
      org_id: user.org_id,
      work_location_id: user.work_location_id,
      pin_enabled: user.pin_enabled,
    };
  }
}

export interface UserPublic {
  id: string;
  name: string;
  identification_number: string;
  job_title: string;
  role: string;
  org_id: string;
  work_location_id: string | null;
  pin_enabled: boolean;
}
