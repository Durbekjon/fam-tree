import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { UserPreferencesService } from './user-preferences.service';

@Injectable()
export class ErrorHandlerService {
  private readonly logger = new Logger(ErrorHandlerService.name);

  constructor(
    private readonly userPreferencesService: UserPreferencesService,
  ) {}

  async handleError(ctx: Context, error: any, context: string): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    // Log the error
    this.logger.error(`Error in ${context}: ${error.message}`, error.stack);

    // Get user preferences for accessibility settings
    const preferences = await this.userPreferencesService.getUserPreferences(telegramId);

    // Generate user-friendly error message
    const errorMessage = this.getUserFriendlyErrorMessage(error, context, preferences);

    // Send error message with retry options
    await ctx.reply(
      errorMessage,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Qaytadan urinib ko\'rish', callback_data: 'retry_last_action' }],
            [{ text: '❓ Yordam olish', callback_data: 'help' }],
            [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
          ]
        }
      }
    );

    // If voice is enabled, send voice message
    if (preferences.voiceEnabled) {
      await this.sendVoiceError(ctx, error, context);
    }
  }

  private getUserFriendlyErrorMessage(error: any, context: string, preferences: any): string {
    // Base error message
    let message = '❌ Xatolik yuz berdi.\n\n';

    // Add context-specific guidance
    switch (context) {
      case 'adding_member':
        message += 'Qarindosh qo\'shishda xatolik yuz berdi.\n';
        message += 'Iltimos, quyidagilarni tekshiring:\n';
        message += '• Barcha ma\'lumotlar to\'g\'ri kiritilgan\n';
        message += '• Internet aloqasi barqaror\n';
        break;

      case 'settings':
        message += 'Sozlamalarni o\'zgartirishda xatolik yuz berdi.\n';
        message += 'Iltimos, qaytadan urinib ko\'ring.\n';
        break;

      case 'search':
        message += 'Qidiruvda xatolik yuz berdi.\n';
        message += 'Iltimos, qidiruv so\'zini qaytadan kiriting.\n';
        break;

      default:
        message += 'Iltimos, qaytadan urinib ko\'ring.\n';
    }

    // Add accessibility-specific guidance
    if (preferences.highContrast) {
      message += '\n⚠️ Yuqori kontrast rejimi yoqilgan';
    }

    return message;
  }

  private async sendVoiceError(ctx: Context, error: any, context: string): Promise<void> {
    try {
      // Here you would implement voice message generation
      // For now, we'll just send a text message
      await ctx.reply(
        '🎧 Xatolik haqida ovozli xabar:\n' +
        this.getUserFriendlyErrorMessage(error, context, { voiceEnabled: false }),
        { parse_mode: 'Markdown' }
      );
    } catch (voiceError) {
      this.logger.error('Failed to send voice error message:', voiceError);
    }
  }

  async handleValidationError(ctx: Context, error: string): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const preferences = await this.userPreferencesService.getUserPreferences(telegramId);

    await ctx.reply(
      `⚠️ ${error}\n\n` +
      'Iltimos, quyidagilarni tekshiring:\n' +
      '• Barcha ma\'lumotlar to\'g\'ri kiritilgan\n' +
      '• Majburiy maydonlar to\'ldirilgan\n' +
      '• Ma\'lumotlar format to\'g\'ri',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Qaytadan urinib ko\'rish', callback_data: 'retry_last_action' }],
            [{ text: '❓ Yordam olish', callback_data: 'help' }],
            [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
          ]
        }
      }
    );

    if (preferences.voiceEnabled) {
      await this.sendVoiceError(ctx, { message: error }, 'validation');
    }
  }

  async handleNetworkError(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const preferences = await this.userPreferencesService.getUserPreferences(telegramId);

    await ctx.reply(
      '🌐 Internet aloqasi bilan bog\'liq muammo.\n\n' +
      'Iltimos, quyidagilarni tekshiring:\n' +
      '• Internet aloqangiz barqaror\n' +
      '• Signal kuchli\n' +
      '• VPN o\'chirilgan (agar ishlatayotgan bo\'lsangiz)',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Qaytadan urinib ko\'rish', callback_data: 'retry_last_action' }],
            [{ text: '❓ Yordam olish', callback_data: 'help' }],
            [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
          ]
        }
      }
    );

    if (preferences.voiceEnabled) {
      await this.sendVoiceError(ctx, { message: 'Network error' }, 'network');
    }
  }
} 