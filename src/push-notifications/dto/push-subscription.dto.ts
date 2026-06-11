import { IsString, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushSubscriptionKeysDto {
  @IsString()
  p256dh: string;

  @IsString()
  auth: string;
}

export class PushSubscriptionDto {
  @IsUrl()
  endpoint: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}
