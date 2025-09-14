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
  private channel: amqp.Channel;

  private readonly allowedChatIds: string[] = (process.env.TELEGRAM_CHAT_ID || '')
    .split(',')
    .filter((id) => id.trim());

  constructor(private readonly telegramService: TelegramBotServicePod) {
    this.docker = new Dockerode({ socketPath: '/var/run/docker.sock' });
  }

  async onModuleInit() {
    this.logger.log('DockerTelegramService initialized.');
    await this.connectRabbitMQ();
    this.registerTelegramCommands();
  }

  private async connectRabbitMQ() {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      this.channel = await connection.createChannel();

      // Exchange khusus perintah telegram
      await this.channel.assertExchange(`${process.env.DOCKER_COMMANDS}`, 'fanout', { durable: true });
      this.logger.log('✅ Connected to RabbitMQ (commands exchange ready).');
    } catch (error) {
      this.logger.error('❌ RabbitMQ connection failed:', error);
    }
  }

  private publishCommand(command: string, payload: any) {
    if (!this.channel) {
      this.logger.error('RabbitMQ channel not available');
      return;
    }
    const message = {
      command,
      payload,
      serverIp: getServerIp(),
      hostname: os.hostname(),
      time: new Date().toISOString(),
    };
    this.channel.publish(
      `${process.env.DOCKER_COMMANDS}`,
      '',
      Buffer.from(JSON.stringify(message)),
    );
    this.logger.log(`📤 Command published: ${command} ${JSON.stringify(payload)}`);
  }

private registerTelegramCommands() {
  // Debug handler
  this.telegramService.onText(/\/debug/, async (msg) => {
    const chatId = msg.chat.id;
    this.logger.debug(`Received /debug from chatId=${chatId}`);
    if (!this.isAuthorized(chatId)) return;
    this.logger.log(`Debug OK for chatId=${chatId}`);
  });

  // Container list
  this.telegramService.onText(/\/containers/, async (msg) => {
    this.logger.debug(`Received /containers from chatId=${msg.chat.id}`);
    if (!this.isAuthorized(msg.chat.id)) return;

    this.publishCommand('containers', { chatId: msg.chat.id });
  });

  // Restart container
  this.telegramService.onText(/\/restart (.+)/, async (msg, match) => {
    this.logger.debug(`Received /restart from chatId=${msg.chat.id}`);
    if (!this.isAuthorized(msg.chat.id)) return;

    const containerId = match?.[1];
    if (!containerId) {
      return;
    }

    this.publishCommand('restart', { containerId, chatId: msg.chat.id });
    this.logger.log(`⏳ Restart command published for ${containerId}`);
  });

  // Stop container
  this.telegramService.onText(/\/stop (.+)/, async (msg, match) => {
    this.logger.debug(`Received /stop from chatId=${msg.chat.id}`);
    if (!this.isAuthorized(msg.chat.id)) return;

    const containerId = match?.[1];
    if (!containerId) {
      return;
    }

    this.publishCommand('stop', { containerId, chatId: msg.chat.id });
    this.logger.log(`⏳ Stop command published for ${containerId}`);
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
