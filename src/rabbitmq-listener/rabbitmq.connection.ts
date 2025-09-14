import { Injectable, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class RabbitmqConnectionService implements OnModuleInit {
    private connection: amqp.Connection;
    private channel: amqp.Channel;

    async onModuleInit() {
        await this.connect();
    }

    private async connect() {
        try {
            this.connection = await amqp.connect(process.env.RABBITMQ_URL as string);
            this.channel = await this.connection.createChannel();

            this.channel.on('error', (err: any) => {
                console.error('❌ RabbitMQ channel error:', err.message);
            });

            this.connection.on('error', (err: any) => {
                console.error('❌ RabbitMQ connection error:', err.message);
            });
        } catch (err) {
            console.error('❌ RabbitMQ connection failed:', err);
            throw err;
        }
    }

    async waitForChannel(retries = 5, delay = 1000): Promise<amqp.Channel> {
        for (let i = 0; i < retries; i++) {
            if (this.channel) return this.channel;
            console.log(`⏳ Waiting for RabbitMQ channel... (${i + 1}/${retries})`);
            await new Promise(res => setTimeout(res, delay));
        }
        throw new Error('❌ Channel not ready after retries');
    }

    async assertExchange(exchange: string, type: 'direct' | 'fanout' | 'topic' = 'fanout') {
        const channel = await this.waitForChannel();
        await channel.assertExchange(exchange, type, { durable: true });
        console.log(`✅ Exchange [${exchange}] asserted (${type})`);
        return channel;
    }
}