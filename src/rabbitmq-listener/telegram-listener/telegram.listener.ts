import { Logger } from '@nestjs/common';
import Docker = require('dockerode');

const escapeMarkdownV2 = (text: string) =>
	text.replace(/([_*\[\]()~`>#+\-=|{}.!>])/g, '\\$1');

export class RabbitmqTelegramListener {
  private readonly logger = new Logger(RabbitmqTelegramListener.name);
  private messageTimers: Record<string, NodeJS.Timeout> = {};
  private docker: Docker;

  async handle(channel: any, exchange: string) {
    const q = await channel.assertQueue('', { exclusive: true });
    await channel.bindQueue(q.queue, exchange, '');

    await channel.consume(q.queue, async (msg: any) => {
      if (!msg) return;
      const content = JSON.parse(msg.content.toString());

      this.logger.debug(`📥 Message received: ${JSON.stringify(content)}`);
      await this.processCommand(content);

      channel.ack(msg);
    });
  }

  private async processCommand(content: any) {
    const { command, payload } = content;

    try {
      switch (command) {
        case 'containers': {
          const containers = await this.docker.listContainers({ all: false });
          if (containers.length === 0) {
            return;
          }
          const list = containers
            .map(
              (c: any) =>
                `• *${escapeMarkdownV2(c.Names.join(','))}* ` +
                `(${escapeMarkdownV2(c.Id.substring(0, 12))}) ⏱️ ${escapeMarkdownV2(c.Status)}`
            )
            .join('\n');
          break;
        }
        case 'restart': {
          const { containerId } = payload;
          const container = this.docker.getContainer(containerId);
          await container.restart();
          break;
        }
        case 'stop': {
          const { containerId } = payload;
          const container = this.docker.getContainer(containerId);
          await container.stop();
          break;
        }
        default:
          this.logger.warn(`⚠️ Unknown command: ${command}`);
      }
    } catch (error) {
      this.logger.error(`❌ Error executing command: ${error.message}`);
    }
  }

  private resetTimer(exchange: string, cb: () => Promise<void>) {
    if (this.messageTimers[exchange]) {
      clearTimeout(this.messageTimers[exchange]);
    }
    this.messageTimers[exchange] = setTimeout(cb, 5000);
  }
}
