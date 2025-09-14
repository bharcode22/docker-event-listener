import { Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { Injectable, OnModuleInit } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';

dotenv.config();

@Injectable()
export class TelegramBotServicePod implements OnModuleInit {
    private bot: TelegramBot;
    private readonly token = process.env.TELEGRAM_TOKEN_ADMIN;
    private readonly logger = new Logger(TelegramBotServicePod.name);

    async onModuleInit() {
        if (!this.token) {
        throw new Error('TELEGRAM_TOKEN_ADMIN is not set');
        }

        this.bot = new TelegramBot(this.token, { polling: true });
        this.logger.log('✅ Telegram Bot connected');

        await this.bot.setMyCommands([
            { command: 'debug', description: 'Cek bot dan lihat Chat ID' },
            { command: 'containers', description: 'Lihat daftar container yang berjalan' },
            { command: 'restart', description: 'Restart container (format: /restart <id>)' },
            { command: 'stop', description: 'Stop container (format: /stop <id>)' },
        ]);

        this.logger.log('✅ Bot commands registered');
    }

    sendMessage(
        chatId: string | number,
        text: string,
        options?: TelegramBot.SendMessageOptions,
    ) {
        if (!this.bot) throw new Error('Telegram bot is not initialized yet');
        return this.bot.sendMessage(chatId, text, options);
    }

    onText(
        regex: RegExp,
        callback: (msg: TelegramBot.Message, match: RegExpExecArray | null) => void,
    ) {
        if (!this.bot) {
            setTimeout(() => this.onText(regex, callback), 500);
            return;
        }
        this.bot.onText(regex, callback);
    }

    onMessage(callback: (msg: TelegramBot.Message) => void) {
        if (!this.bot) {
            setTimeout(() => this.onMessage(callback), 500);
            return;
        }
        this.bot.on('message', callback);
    }
}
