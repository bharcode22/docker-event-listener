import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RabbitmqListenerModule } from './rabbitmq-listener/rabbitmq-listener.module';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { DockerEventListenerModule } from './docker-event-listener/docker-event-listener.module';

@Module({
  imports: [
    RabbitmqListenerModule, 
    TelegramBotModule, 
    DockerEventListenerModule
  ],
  controllers: [
    AppController
  ],
  providers: [
    AppService, 
  ],
})
export class AppModule {}
