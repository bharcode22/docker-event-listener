import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class RabbitmqConnectionService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RabbitmqConnectionService.name);
    private connection: amqp.Connection;
    private channel: amqp.Channel;
    private isConnecting = false;
    private reconnectDelay = 5000;

    async onModuleInit() {
        await this.connectWithRetry();
    }

    async onModuleDestroy() {
        await this.close();
    }

    private async connectWithRetry() {
        if (this.isConnecting) return;
        this.isConnecting = true;

        while (!this.connection) {
            try {
                this.logger.log('🔌 Connecting to RabbitMQ...');
                this.connection = await amqp.connect(process.env.RABBITMQ_URL as string);
                this.channel = await this.connection.createChannel({
                    // Set consumer_timeout to 30 minutes (1800000ms) or your preferred value
                    // Set to false to disable timeout (not recommended for production)
                    // consumer_timeout: 1800000
                    // Atau nonaktifkan dengan false
                    consumer_timeout: false
                });

                this.channel.on('error', (err: any) => {
                    console.error('❌ RabbitMQ channel error:', err.message);
                });

                this.connection.on('error', (err: any) => {
                    console.error('❌ RabbitMQ connection error:', err.message);
                });

                this.connection.on('close', async () => {
                    console.warn('⚠️ RabbitMQ connection closed. Reconnecting...');
                    this.connection = null;
                    this.channel = null;
                    await this.delay(this.reconnectDelay);
                    await this.connectWithRetry();
                });

                this.logger.log('✅ RabbitMQ connected');
            } catch (err) {
                console.error('❌ RabbitMQ connection failed, retrying in 5s:', err.message);
                await this.delay(this.reconnectDelay);
            }
        }

        this.isConnecting = false;
    }

    private delay(ms: number) {
        return new Promise((res) => setTimeout(res, ms));
    }

    async waitForChannel(retries = 5, delay = 1000): Promise<amqp.Channel> {
        for (let i = 0; i < retries; i++) {
        if (this.channel) return this.channel;
            console.log(`⏳ Waiting for RabbitMQ channel... (${i + 1}/${retries})`);
            await this.delay(delay);
        }
        throw new Error('❌ Channel not ready after retries');
    }

    async assertExchange(exchange: string, type: 'direct' | 'fanout' | 'topic' = 'fanout') {
        const channel = await this.waitForChannel();
        await channel.assertExchange(exchange, type, { durable: true });
        console.log(`✅ Exchange [${exchange}] asserted (${type})`);
        return channel;
    }

    async close() {
        try {
            await this.channel?.close();
            await this.connection?.close();
        } catch (err) {
            console.error('❌ Error closing RabbitMQ:', err.message);
        }
    }
}
