import { Module } from '@nestjs/common';
import { DockerEventListenerService, DockerTelegramService } from './docker-event-listener.service';
import { TelegramBotServicePod } from './telegram-bot.service';
import { DockerEventListenerController } from './docker-event-listener.controller';

@Module({
  controllers: [DockerEventListenerController],
  providers: [
    DockerEventListenerService,
    TelegramBotServicePod, 
    DockerTelegramService,  
  ],
})
export class DockerEventListenerModule {}
