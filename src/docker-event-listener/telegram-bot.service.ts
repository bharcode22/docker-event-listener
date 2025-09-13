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

    // Masih bisa pakai command default
    await this.bot.setMyCommands([
      { command: 'menu', description: 'Tampilkan menu interaktif' },
      { command: 'debug', description: 'Cek bot dan lihat Chat ID' },
      { command: 'containers', description: 'Lihat daftar container yang berjalan' },
      { command: 'restart', description: 'Restart container (format: /restart <id>)' },
      { command: 'stop', description: 'Stop container (format: /stop <id>)' },
    ]);

    // Handler untuk /menu → tampilkan tombol inline
    this.onText(/^\/menu$/, async (msg) => {
      const chatId = msg.chat.id;

      await this.sendMessage(chatId, '📋 Pilih aksi:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🐞 Debug', callback_data: 'debug' }],
            [{ text: '📦 Containers', callback_data: 'containers' }],
            [{ text: '🔄 Restart', callback_data: 'restart' }],
            [{ text: '⏹ Stop', callback_data: 'stop' }],
          ],
        },
      });
    });

    // Handler untuk tombol inline
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const action = query.data;

      switch (action) {
        case 'debug':
          await this.sendMessage(chatId, '⚡ Debug info: Chat ID = ' + chatId);
          break;
        case 'containers':
          await this.sendMessage(chatId, '📦 Menampilkan daftar container...');
          break;
        case 'restart':
          await this.sendMessage(chatId, '🔄 Masukkan ID container untuk restart:');
          break;
        case 'stop':
          await this.sendMessage(chatId, '⏹ Masukkan ID container untuk stop:');
          break;
      }

      // Jawab callback biar tombol tidak loading
      this.bot.answerCallbackQuery(query.id);
    });

    this.logger.log('✅ Bot commands & inline menu registered');
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
