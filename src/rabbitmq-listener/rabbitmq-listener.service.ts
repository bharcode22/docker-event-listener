import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { RabbitmqConnectionService } from './rabbitmq.connection';
import { RabbitmqTelegramListener } from './telegram-listener/telegram.listener';
import { AdminListenerDocker } from './admin-listener/admin.listener';

@Injectable()
export class RabbitmqListenerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RabbitmqListenerService.name);

  constructor(private readonly rabbitmqService: RabbitmqConnectionService) {}

  async onApplicationBootstrap() {
    this.logger.log('🚀 RabbitmqListenerService bootstrap start');

    const channel = await this.rabbitmqService.waitForChannel();
    this.logger.log('✅ RabbitMQ channel ready');

    const SpesifikListeners = [
      {
        exchange: process.env.DOCKER_COMMANDS,
        handler: new RabbitmqTelegramListener(),
      },
      {
        exchange: process.env.ADMIN_DOCKER_COMMANDS,
        handler: new AdminListenerDocker(),
      },
    ].filter((l) => l.exchange);

    if (SpesifikListeners.length === 0) {
      this.logger.warn('⚠️ No listeners configured (check env: DOCKER_COMMANDS)');
    }

    for (const { exchange, handler } of SpesifikListeners) {
      this.logger.log(`📡 Binding listener for exchange: ${exchange}`);
      await handler.handle(channel, exchange!);
    }

    this.logger.log('🚀 RabbitmqListenerService bootstrap finished');
  }
}
