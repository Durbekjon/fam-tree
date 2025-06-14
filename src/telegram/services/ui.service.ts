import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { UserPreferencesService } from './user-preferences.service';

@Injectable()
export class UIService {
  constructor(
    private readonly userPreferencesService: UserPreferencesService,
  ) {}

  async sendMessage(
    ctx: Context,
    message: string,
    options: {
      keyboard?: any;
      parseMode?: 'Markdown' | 'HTML';
      voiceEnabled?: boolean;
    } = {}
  ): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const preferences = await this.userPreferencesService.getUserPreferences(telegramId);
    const formattedMessage = this.formatMessage(message, preferences);

    // Send text message
    await ctx.reply(formattedMessage, {
      parse_mode: options.parseMode || 'Markdown',
      reply_markup: options.keyboard,
    });

    // Send voice message if enabled
    if (preferences.voiceEnabled && options.voiceEnabled !== false) {
      await this.sendVoiceMessage(ctx, message);
    }
  }

  private formatMessage(message: string, preferences: any): string {
    let formattedMessage = message;

    // Apply font size
    if (preferences.fontSize === 'large') {
      formattedMessage = this.wrapInLargeFont(formattedMessage);
    }

    // Apply high contrast
    if (preferences.highContrast) {
      formattedMessage = this.applyHighContrast(formattedMessage);
    }

    return formattedMessage;
  }

  private wrapInLargeFont(text: string): string {
    // Use Telegram's HTML formatting for larger text
    return `<b>${text}</b>`;
  }

  private applyHighContrast(text: string): string {
    // Add emojis and symbols to improve contrast
    return `🔍 ${text}`;
  }

  private async sendVoiceMessage(ctx: Context, message: string): Promise<void> {
    try {
      // Here you would implement text-to-speech conversion
      // For now, we'll just send a text message
      await ctx.reply(
        '🎧 Ovozli xabar:\n' + message,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      // Silently fail if voice message fails
      console.error('Failed to send voice message:', error);
    }
  }

  createKeyboard(buttons: Array<Array<{ text: string; callback_data: string }>>): any {
    return {
      inline_keyboard: buttons,
    };
  }

  createMainMenuKeyboard(): any {
    return this.createKeyboard([
      [
        { text: '👥 Qarindosh qo\'shish', callback_data: 'add_member' },
        { text: '🔍 Qidirish', callback_data: 'search' }
      ],
      [
        { text: '📋 Ro\'yxatni ko\'rish', callback_data: 'view' },
        { text: '⚙️ Sozlamalar', callback_data: 'settings' }
      ],
      [
        { text: '❓ Yordam', callback_data: 'help' }
      ]
    ]);
  }

  createBackButton(callbackData: string = 'back_to_main'): any {
    return this.createKeyboard([
      [{ text: '⬅️ Orqaga', callback_data: callbackData }]
    ]);
  }

  createConfirmationKeyboard(yesCallback: string, noCallback: string): any {
    return this.createKeyboard([
      [
        { text: '✅ Ha', callback_data: yesCallback },
        { text: '❌ Yo\'q', callback_data: noCallback }
      ]
    ]);
  }

  createPaginationKeyboard(
    currentPage: number,
    totalPages: number,
    baseCallback: string
  ): any {
    const buttons: Array<{ text: string; callback_data: string }> = [];
    
    if (currentPage > 1) {
      buttons.push({ text: '⬅️', callback_data: `${baseCallback}_prev` });
    }
    
    buttons.push({ text: `${currentPage}/${totalPages}`, callback_data: 'current_page' });
    
    if (currentPage < totalPages) {
      buttons.push({ text: '➡️', callback_data: `${baseCallback}_next` });
    }

    return this.createKeyboard([buttons]);
  }

  createSettingsKeyboard(preferences: any): any {
    return this.createKeyboard([
      [
        { text: '📏 Matn o\'lchami', callback_data: 'font_size' },
        { text: preferences.voiceEnabled ? '🔊 Ovoz yoqilgan' : '🔇 Ovoz o\'chilgan', callback_data: 'toggle_voice' }
      ],
      [
        { text: preferences.highContrast ? '🌓 Yuqori kontrast yoqilgan' : '🌓 Yuqori kontrast o\'chilgan', callback_data: 'toggle_contrast' },
        { text: preferences.autoSave ? '💾 Avtosaqlash yoqilgan' : '💾 Avtosaqlash o\'chilgan', callback_data: 'toggle_autosave' }
      ],
      [
        { text: preferences.notifications ? '🔔 Bildirishnomalar yoqilgan' : '🔕 Bildirishnomalar o\'chilgan', callback_data: 'toggle_notifications' }
      ],
      [
        { text: '⬅️ Orqaga', callback_data: 'back_to_main' }
      ]
    ]);
  }
} 