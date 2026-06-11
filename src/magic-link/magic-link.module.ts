import { Module } from '@nestjs/common';
import { MagicLinkService } from './magic-link.service';
import { MagicLinkController, MagicLinkPublicController } from './magic-link.controller';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [MailModule, NotificationsModule],
  controllers: [MagicLinkController, MagicLinkPublicController],
  providers: [MagicLinkService],
  exports: [MagicLinkService],
})
export class MagicLinkModule {}
