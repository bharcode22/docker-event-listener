import { PartialType } from '@nestjs/mapped-types';
import { CreateTelegramBotDto } from './create-telegram-bot.dto';

export class UpdateTelegramBotDto extends PartialType(CreateTelegramBotDto) {
  id: number;
}
