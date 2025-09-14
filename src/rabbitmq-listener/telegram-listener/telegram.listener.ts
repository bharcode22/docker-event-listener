import { Logger } from '@nestjs/common';
import { TelegramBotServiceAdmin } from '../../telegram-bot/telegram-bot.service';
import Docker = require('dockerode');

const escapeMarkdownV2 = (text: string) =>
	text.replace(/([_*\[\]()~`>#+\-=|{}.!>])/g, '\\$1');

export class RabbitmqTelegramListener {
  private readonly logger = new Logger(RabbitmqTelegramListener.name);
  private messageTimers: Record<string, NodeJS.Timeout> = {};
  private docker: Docker;

  constructor(private readonly telegramService: TelegramBotServiceAdmin) {
    this.docker = new Docker();
  }

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
            await this.telegramService.sendMessage(
              escapeMarkdownV2('🚫 Tidak ada container yang berjalan.')
            );
            return;
          }
          const list = containers
            .map(
              (c: any) =>
                `• *${escapeMarkdownV2(c.Names.join(','))}* ` +
                `(${escapeMarkdownV2(c.Id.substring(0, 12))}) ⏱️ ${escapeMarkdownV2(c.Status)}`
            )
            .join('\n');
          await this.telegramService.sendMessage(`📦 Daftar container:\n${list}`);
          break;
        }
        case 'restart': {
          const { containerId } = payload;
          const container = this.docker.getContainer(containerId);
          await container.restart();
          await this.telegramService.sendMessage(
            `🔄 Container *${escapeMarkdownV2(containerId)}* berhasil direstart.`
          );
          break;
        }
        case 'stop': {
          const { containerId } = payload;
          const container = this.docker.getContainer(containerId);
          await container.stop();
          await this.telegramService.sendMessage(
            `🛑 Container *${escapeMarkdownV2(containerId)}* berhasil distop.`
          );
          break;
        }
        default:
          this.logger.warn(`⚠️ Unknown command: ${command}`);
          await this.telegramService.sendMessage(
            `⚠️ Command tidak dikenali: ${escapeMarkdownV2(command)}`
          );
      }
    } catch (error) {
      this.logger.error(`❌ Error executing command: ${error.message}`);
      await this.telegramService.sendMessage(
        `❌ Error: ${escapeMarkdownV2(error.message)}`
      );
    }
  }

  private resetTimer(exchange: string, cb: () => Promise<void>) {
    if (this.messageTimers[exchange]) {
      clearTimeout(this.messageTimers[exchange]);
    }
    this.messageTimers[exchange] = setTimeout(cb, 5000);
  }
}
