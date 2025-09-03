import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
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

          if (this.channel) {
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

            this.logger.log(
              `Event published: ${message}`,
            );
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
