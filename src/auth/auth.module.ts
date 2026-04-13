import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { PinService } from './pin/pin.service';
import { PinRateLimiterService } from './pin/pin-rate-limiter.service';
import { WebAuthnService } from './webauthn/webauthn.service';
import { WebAuthnController } from './webauthn/webauthn.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController, WebAuthnController],
  providers: [
    AuthService,
    JwtStrategy,
    PinService,
    PinRateLimiterService,
    WebAuthnService,
  ],
  exports: [AuthService, JwtModule, WebAuthnService, PinService],
})
export class AuthModule {}
