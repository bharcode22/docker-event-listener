import { Module } from '@nestjs/common';
import { 
  TelegramBotServiceAdmin, 
} from './telegram-bot.service';

@Module({
  controllers: [],
  providers: [
    TelegramBotServiceAdmin, 
  ],
  exports: [
    TelegramBotServiceAdmin, 
  ],
})
export class TelegramBotModule {}
