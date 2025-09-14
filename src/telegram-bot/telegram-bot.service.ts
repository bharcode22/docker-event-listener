import { Injectable, OnModuleInit } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import TelegramBot = require('node-telegram-bot-api');
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class TelegramBotServiceAdmin implements OnModuleInit {
  private bot: TelegramBot;
  private readonly logger = new Logger(TelegramBotServiceAdmin.name);
  private readonly token = `${process.env.TELEGRAM_TOKEN_ADMIN}`;
  private readonly chatId = `${process.env.TELEGRAM_CHAT_ID}`;

  onModuleInit() {
    this.bot = new TelegramBot(this.token, { polling: false });
    this.logger.log(`🚀 Admin Telegram bot connected`);
  }

  async sendMessage(message: string, options?: TelegramBot.SendMessageOptions) {
    if (!this.chatId) {
      this.logger.error('❌ CHAT_ID not configured');
      return;
    }

    await this.bot.sendMessage(this.chatId, message, {
      parse_mode: 'MarkdownV2',
      ...options,
    });
  }
}
