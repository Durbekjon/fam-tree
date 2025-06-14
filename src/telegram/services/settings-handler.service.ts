import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { UserPreferencesService } from './user-preferences.service';
import { ErrorHandlerService } from './error-handler.service';
import { UIService } from './ui.service';
import { StateService } from '../state.service';

@Injectable()
export class SettingsHandler {
  protected readonly logger = new Logger(SettingsHandler.name);

  constructor(
    private readonly userPreferencesService: UserPreferencesService,
    private readonly errorHandler: ErrorHandlerService,
    private readonly ui: UIService,
    private readonly stateService: StateService,
  ) {}

  async handle(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id.toString();
      if (!telegramId) return;

      this.stateService.setState(telegramId, { action: 'settings' });
      await this.showSettingsMenu(ctx);
    } catch (error) {
      await this.errorHandler.handleError(ctx, error, 'settings');
    }
  }

  async handleCallback(ctx: Context, callbackData: string): Promise<void> {
    try {
      const telegramId = ctx.from?.id.toString();
      if (!telegramId) return;

      switch (callbackData) {
        case 'font_size':
          await this.handleFontSizeChange(ctx);
          break;
        case 'toggle_voice':
          await this.toggleVoice(ctx);
          break;
        case 'toggle_contrast':
          await this.toggleContrast(ctx);
          break;
        case 'toggle_autosave':
          await this.toggleAutoSave(ctx);
          break;
        case 'toggle_notifications':
          await this.toggleNotifications(ctx);
          break;
        case 'back_to_main':
          this.stateService.clearState(telegramId);
          await this.ui.sendMessage(ctx, '🏠 Bosh menyu', {
            keyboard: this.ui.createMainMenuKeyboard(),
          });
          break;
      }
    } catch (error) {
      await this.errorHandler.handleError(ctx, error, 'settings');
    }
  }

  private async showSettingsMenu(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const preferences = await this.userPreferencesService.getUserPreferences(telegramId);
    const keyboard = this.ui.createSettingsKeyboard(preferences);

    await this.ui.sendMessage(
      ctx,
      '⚙️ *Sozlamalar*\n\n' +
      'Bu yerda bot sozlamalarini o\'zgartirishingiz mumkin:\n\n' +
      '• 📏 Matn o\'lchami - katta/kichik\n' +
      '• 🔊 Ovoz - yoqish/o\'chirish\n' +
      '• 🌓 Yuqori kontrast - yoqish/o\'chirish\n' +
      '• 💾 Avtosaqlash - yoqish/o\'chirish\n' +
      '• 🔔 Bildirishnomalar - yoqish/o\'chirish',
      { keyboard }
    );
  }

  private async handleFontSizeChange(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const keyboard = this.ui.createKeyboard([
      [
        { text: '📏 Katta', callback_data: 'font_size_large' },
        { text: '📏 Kichik', callback_data: 'font_size_small' }
      ],
      [{ text: '⬅️ Orqaga', callback_data: 'back_to_settings' }]
    ]);

    await this.ui.sendMessage(
      ctx,
      '📏 *Matn o\'lchamini tanlang:*\n\n' +
      '• Katta - yaxshiroq ko\'rinish uchun\n' +
      '• Kichik - ko\'proq ma\'lumot ko\'rsatish uchun',
      { keyboard }
    );
  }

  private async toggleVoice(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      const preferences = await this.userPreferencesService.getUserPreferences(telegramId);
      await this.userPreferencesService.toggleVoice(telegramId);
      
      await this.ui.sendMessage(
        ctx,
        preferences.voiceEnabled
          ? '🔇 Ovoz o\'chirildi'
          : '🔊 Ovoz yoqildi',
        { keyboard: this.ui.createBackButton('back_to_settings') }
      );
    } catch (error) {
      await this.errorHandler.handleError(ctx, error, 'settings');
    }
  }

  private async toggleContrast(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      const preferences = await this.userPreferencesService.getUserPreferences(telegramId);
      await this.userPreferencesService.toggleHighContrast(telegramId);
      
      await this.ui.sendMessage(
        ctx,
        preferences.highContrast
          ? '🌓 Yuqori kontrast o\'chirildi'
          : '🌓 Yuqori kontrast yoqildi',
        { keyboard: this.ui.createBackButton('back_to_settings') }
      );
    } catch (error) {
      await this.errorHandler.handleError(ctx, error, 'settings');
    }
  }

  private async toggleAutoSave(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      const preferences = await this.userPreferencesService.getUserPreferences(telegramId);
      await this.userPreferencesService.toggleAutoSave(telegramId);
      
      await this.ui.sendMessage(
        ctx,
        preferences.autoSave
          ? '💾 Avtosaqlash o\'chirildi'
          : '💾 Avtosaqlash yoqildi',
        { keyboard: this.ui.createBackButton('back_to_settings') }
      );
    } catch (error) {
      await this.errorHandler.handleError(ctx, error, 'settings');
    }
  }

  private async toggleNotifications(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      const preferences = await this.userPreferencesService.getUserPreferences(telegramId);
      await this.userPreferencesService.toggleNotifications(telegramId);
      
      await this.ui.sendMessage(
        ctx,
        preferences.notifications
          ? '🔕 Bildirishnomalar o\'chirildi'
          : '🔔 Bildirishnomalar yoqildi',
        { keyboard: this.ui.createBackButton('back_to_settings') }
      );
    } catch (error) {
      await this.errorHandler.handleError(ctx, error, 'settings');
    }
  }

  async getUserPreferences(telegramId: string) {
    return this.userPreferencesService.getUserPreferences(telegramId);
  }
} 