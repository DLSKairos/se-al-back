import { IsArray, IsString, IsNotEmpty, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

export class AdminChatDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history: ChatMessageDto[];
}
