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
                this.connection = await amqp.connect(process.env.RABBITMQ_URL as string, {
                    timeout: 30000, // 30 seconds connection timeout
                    heartbeat: 60   // 60 seconds heartbeat
                });

                // Set up connection error handling first
                this.connection.on('error', (err: any) => {
                    this.logger.error(`❌ RabbitMQ connection error: ${err.message}`);
                    this.connection = null;
                    this.channel = null;
                });

                this.connection.on('close', async () => {
                    this.logger.warn('⚠️ RabbitMQ connection closed. Reconnecting...');
                    this.connection = null;
                    this.channel = null;
                    await this.delay(this.reconnectDelay);
                    await this.connectWithRetry();
                });

                // Create channel with explicit confirmation
                this.channel = await this.connection.createConfirmChannel();
                
                // Set prefetch to control message flow
                await this.channel.prefetch(1);

                // Set up channel error handling
                this.channel.on('error', (err: any) => {
                    this.logger.error(`❌ RabbitMQ channel error: ${err.message}`);
                    // Don't close connection on channel error, let the reconnection logic handle it
                });

                // Set up channel close handling
                this.channel.on('close', () => {
                    this.logger.warn('ℹ️ RabbitMQ channel closed');
                    this.channel = null;
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
            this.logger.log(`⏳ Waiting for RabbitMQ channel... (${i + 1}/${retries})`);
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
            if (this.channel) {
                await this.channel.close().catch(err => 
                    this.logger.error('Error closing channel:', err.message)
                );
                this.channel = null;
            }
            
            if (this.connection) {
                await this.connection.close().catch(err => 
                    this.logger.error('Error closing connection:', err.message)
                );
                this.connection = null;
            }
        } catch (err) {
            this.logger.error('❌ Error closing RabbitMQ:', err.message);
        } finally {
            this.isConnecting = false;
        }
    }
}
