import { Module } from '@nestjs/common';
import { RabbitmqConnectionService  } from './rabbitmq.connection';
import { RabbitmqListenerService } from './rabbitmq-listener.service';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';

@Module({
  controllers: [],
  imports: [
    TelegramBotModule
  ], 
  providers: [
    RabbitmqListenerService, 
    RabbitmqConnectionService, 
  ],
})
export class RabbitmqListenerModule {}
