import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DockerEventListenerModule } from './docker-event-listener/docker-event-listener.module';

@Module({
  imports: [DockerEventListenerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
