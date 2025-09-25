import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Client } from 'pg';

@Injectable()
export class PostgresListenerService implements OnModuleInit, OnModuleDestroy {
    private client: Client;
    private readonly logger = new Logger(PostgresListenerService.name);

    async onModuleInit() {
        this.client = new Client({
            connectionString: process.env.DATABASE_URL,
        });

        await this.client.connect();
        this.logger.log('✅ Connected to PostgreSQL (LISTEN/NOTIFY)');

        await this.client.query('LISTEN pod_logs_channel');

        this.client.on('notification', (msg: any) => {
            try {
                const payload = JSON.parse(msg.payload);
                this.logger.log(`📢 Event from pod_logs: ${JSON.stringify(payload)}`);

                // contoh: kalau mau diteruskan ke RabbitMQ
                // this.rabbitmqService.publish('pod_logs_exchange', payload);
            } catch (e) {
                this.logger.error('❌ Failed to parse payload', e);
            }
        });

        this.client.on('error', (err: any) => {
            this.logger.error('❌ PostgreSQL listener error', err.stack);
        });
    }

    async onModuleDestroy() {
        await this.client.end();
    }
}
