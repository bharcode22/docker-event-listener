import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RabbitmqListenerModule } from './rabbitmq-listener/rabbitmq-listener.module';
import { DockerEventListenerModule } from './docker-event-listener/docker-event-listener.module';
import { PostgresListenerService } from './postgre-listener/postgre-listener.service';

@Module({
  imports: [
    RabbitmqListenerModule, 
    DockerEventListenerModule
  ],
  controllers: [
    AppController
  ],
  providers: [
    AppService, 
    PostgresListenerService
  ],
})
export class AppModule {}
