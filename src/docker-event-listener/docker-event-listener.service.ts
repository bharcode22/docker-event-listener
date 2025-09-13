import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { TelegramBotServicePod } from './telegram-bot.service';
import * as Dockerode from 'dockerode';
import * as amqp from 'amqplib';
import * as os from 'os';
import * as dotenv from 'dotenv';
dotenv.config();

function getServerIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'unknown';
}

@Injectable()
export class DockerEventListenerService implements OnModuleInit {
  private readonly logger = new Logger(DockerEventListenerService.name);
  private docker: Dockerode;
  private channel: amqp.Channel;

  constructor() {
    this.docker = new Dockerode({ socketPath: '/var/run/docker.sock' });
  }

  async onModuleInit() {
    await this.connectRabbitMQ();
    this.listenDockerEvents();
  }

  private async connectRabbitMQ() {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      this.channel = await connection.createChannel();

      await this.channel.assertExchange(`${process.env.DOCKER_EVENTS}`, 'fanout', { durable: true });
      this.logger.log('Connected to RabbitMQ and exchange created.');
    } catch (error) {
      this.logger.error('RabbitMQ connection failed:', error);
    }
  }

  private async listenDockerEvents() {
    try {
      const eventStream = await this.docker.getEvents();

      eventStream.on('data', async (chunk: Buffer) => {
        try {
          const event = JSON.parse(chunk.toString());
          this.logger.debug(`Docker Event: ${JSON.stringify(event)}`);

        if (['start', 'stop', 'die', 'resize', 'exec_create', 'destroy'].includes(event.status)) {
          const message = {
            serverIp: getServerIp(),
            hostname: os.hostname(),
            containerId: event.id,
            containerName: event.Actor?.Attributes?.name,
            image: event.from,
            status: event.status,
            exitCode: event?.Actor?.Attributes?.exitCode || null,
            time: event.time,
          };

          this.channel.publish(
            `${process.env.DOCKER_EVENTS}`,
            '',
            Buffer.from(JSON.stringify(message)),
          );

          this.logger.log(`Event published: ${event.status} - ${event.Actor?.Attributes?.name}`);
        }

        } catch (err) {
          this.logger.error('Failed to parse docker event:', err);
        }
      });
    } catch (error) {
      this.logger.error('Error listening to docker events:', error);
    }
  }
}

@Injectable()
export class DockerTelegramService implements OnModuleInit {
  private readonly logger = new Logger(DockerTelegramService.name);
  private readonly docker: Dockerode;

  private readonly allowedChatIds: string[] = (process.env.TELEGRAM_CHAT_ID || '')
    .split(',')
    .filter((id) => id.trim());

  constructor(private readonly telegramService: TelegramBotServicePod) {
    this.docker = new Dockerode({ socketPath: '/var/run/docker.sock' });
  }

  async onModuleInit() {
    this.logger.log('DockerTelegramService initialized.');
    this.registerTelegramCommands();
  }

  private registerTelegramCommands() {
    // Debug handler
    this.telegramService.onText(/\/debug/, async (msg) => {
      const chatId = msg.chat.id;
      this.logger.debug(`Received /debug from chatId=${chatId}`);
      await this.telegramService.sendMessage(
        chatId,
        `✅ Debug OK\nChat ID: \`${chatId}\``,
        { parse_mode: 'Markdown' },
      );
    });

    // Container list
    this.telegramService.onText(/\/containers/, async (msg) => {
      this.logger.debug(`Received /containers from chatId=${msg.chat.id}`);
      if (!this.isAuthorized(msg.chat.id)) return;

      try {
        const containers = await this.docker.listContainers({ all: false });

        if (containers.length === 0) {
          await this.telegramService.sendMessage(
            msg.chat.id,
            '🚫 Tidak ada container yang berjalan.',
          );
          return;
        }

        const reply = containers
          .map((c: any) => {
            return (
              `📦 *${c.Names[0]}*\n` +
              `🖥️ Hostname: \`${os.hostname()}\`\n` +
              `🌐 Server IP: \`${getServerIp()}\`\n` +
              `🔑 ID: \`${c.Id.substring(0, 12)}\`\n` +
              `📊 Status: ${c.Status}\n` +
              `=====================`
            );
          })
          .join('\n\n');

        await this.telegramService.sendMessage(msg.chat.id, reply, {
          parse_mode: 'Markdown',
        });
      } catch (error) {
        this.logger.error('Gagal list container:', error);
        await this.telegramService.sendMessage(
          msg.chat.id,
          `❌ Error: ${error.message}`,
        );
      }
    });

    // Restart container
    this.telegramService.onText(/\/restart (.+)/, async (msg, match) => {
      this.logger.debug(`Received /restart from chatId=${msg.chat.id}`);
      if (!this.isAuthorized(msg.chat.id)) return;

      const containerId = match?.[1];
      if (!containerId) {
        await this.telegramService.sendMessage(
          msg.chat.id,
          '⚠️ Gunakan format: /restart <containerId>',
        );
        return;
      }

      try {
        const container = this.docker.getContainer(containerId);
        await container.restart();
        await this.telegramService.sendMessage(
          msg.chat.id,
          `✅ Container ${containerId} berhasil direstart.`,
        );
      } catch (error) {
        this.logger.error('Gagal restart container:', error);
        await this.telegramService.sendMessage(
          msg.chat.id,
          `❌ Error: ${error.message}`,
        );
      }
    });

    // Stop container
    this.telegramService.onText(/\/stop (.+)/, async (msg, match) => {
      const containerId = match?.[1];
      if (!containerId) return;
      try {
        const containers = await this.docker.listContainers({ all: true });
        const found = containers.find(c => c.Id.startsWith(containerId));
        if (!found) {
          await this.telegramService.sendMessage(msg.chat.id, '❌ Container tidak ditemukan.');
          return;
        }
        const container = this.docker.getContainer(found.Id);
        await container.stop();
        await this.telegramService.sendMessage(msg.chat.id, `🛑 Container ${found.Names[0]} berhasil distop.`);
      } catch (error: any) {
        await this.telegramService.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
      }
    });
  }

  private isAuthorized(chatId: number): boolean {
    if (this.allowedChatIds.length === 0) return true;
    if (!this.allowedChatIds.includes(chatId.toString())) {
      this.logger.warn(`Unauthorized access attempt from chatId: ${chatId}`);
      return false;
    }
    return true;
  }
}