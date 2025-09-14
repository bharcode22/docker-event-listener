import { Module } from '@nestjs/common';
import { DockerEventListenerService } from './docker-event-listener.service';
import { DockerEventListenerController } from './docker-event-listener.controller';

@Module({
    controllers: [DockerEventListenerController],
    providers: [DockerEventListenerService],
})
export class DockerEventListenerModule {}