import { Module } from '@nestjs/common';
import { RabbitmqConnectionService  } from './rabbitmq.connection';
import { RabbitmqListenerService } from './rabbitmq-listener.service';

@Module({
  controllers: [],
  imports: [], 
  providers: [
    RabbitmqListenerService, 
    RabbitmqConnectionService, 
  ],
})
export class RabbitmqListenerModule {}
