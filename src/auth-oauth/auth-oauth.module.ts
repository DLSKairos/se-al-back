import { Module } from '@nestjs/common';
import { AuthOAuthService } from './auth-oauth.service';
import { AuthOAuthController } from './auth-oauth.controller';
import { MagicLinkModule } from '../magic-link/magic-link.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,      // provee AuthService (generateJwt) y JwtModule
    MagicLinkModule, // provee MagicLinkService (validateAndConsume)
  ],
  controllers: [AuthOAuthController],
  providers: [AuthOAuthService],
  exports: [AuthOAuthService],
})
export class AuthOAuthModule {}
