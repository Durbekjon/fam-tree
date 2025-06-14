import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { BaseCommandHandler } from './base-command-handler.service';
import { ICommandHandler } from '../interfaces/command-handler.interface';
import { UserError } from '../errors/telegram.errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessibilityService } from './accessibility.service';
import { UserPreferencesService } from './user-preferences.service';

@Injectable()
export class StartCommandHandler extends BaseCommandHandler implements ICommandHandler {
  constructor(
    protected readonly prisma: PrismaService,
    private readonly accessibilityService: AccessibilityService,
    private readonly userPreferencesService: UserPreferencesService,
  ) {
    super(prisma);
  }

  async handle(ctx: Context): Promise<void> {
    try {
      if (!await this.validateUser(ctx)) return;

      if (!ctx.from) {
        throw new UserError('User information not found');
      }

      const telegramId = ctx.from.id.toString();
      const nickname = ctx.from.username || ctx.from.first_name;

      const user = await this.retryOperation(async () => {
        let user = await this.prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
          user = await this.prisma.user.create({
            data: {
              telegramId,
              nickname,
            },
          });
        }
        return user;
      });

      // Get user preferences
      const preferences = await this.userPreferencesService.getUserPreferences(telegramId);

      // Send welcome message with accessibility options
      await ctx.reply(
        '👋 *Hurmatli foydalanuvchi!*\n\n' +
        'Sizni oila daraxtingizni yaratishda yordam berishdan xursandmiz. ' +
        'Bu bot orqali oilangizning barcha a\'zolarini qo\'shishingiz va ularning o\'rtasidagi bog\'lanishlarni saqlashingiz mumkin.\n\n' +
        '*Qanday ishlatish kerak?*\n' +
        '1️⃣ Quyidagi tugmalardan birini bosing\n' +
        '2️⃣ Bot sizga qo\'shimcha yo\'riqnomalar beradi\n' +
        '3️⃣ Har bir qadamda sizdan kerakli ma\'lumotlarni so\'raydi\n\n' +
        '*Muhim eslatma:*\n' +
        '❓ Yordam kerak bo\'lsa, "Yordam olish" tugmasini bosing\n' +
        '🔄 Xatolik yuz berganda, "Bosh menyuga qaytish" tugmasini bosing',
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌳 Yangi oila daraxti yaratish', callback_data: 'create_new_tree' }],
              [{ text: '👥 Mavjud oila daraxtini ko\'rish', callback_data: 'view_tree' }],
              [{ text: '📝 Yangi qarindosh qo\'shish', callback_data: 'add_new' }],
              [{ text: '🔍 Qarindoshlarni qidirish', callback_data: 'search_members' }],
              [{ text: '📤 Oila daraxtini saqlash', callback_data: 'export_pdf' }],
              [{ text: '⚙️ Sozlamalar', callback_data: 'settings' }],
              [{ text: '❓ Yordam olish', callback_data: 'help' }]
            ],
          },
        }
      );

      // Send accessibility options if voice is enabled
      if (preferences.voiceEnabled) {
        await this.accessibilityService.sendVoiceTutorial(ctx, 'main');
      }

      // Send settings options
      await ctx.reply(
        '*Qo\'shimcha imkoniyatlar:*\n\n' +
        '📱 Matn o\'lchamini o\'zgartirish\n' +
        '🎧 Ovozli yo\'riqnoma\n' +
        '👁️ Yuqori kontrast rejimi\n' +
        '💾 Avtomatik saqlash\n' +
        '🔔 Bildirishnomalar',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📱 Matn o\'lchami', callback_data: 'font_size' },
                { text: '🎧 Ovoz', callback_data: 'toggle_voice' }
              ],
              [
                { text: '👁️ Kontrast', callback_data: 'toggle_contrast' },
                { text: '💾 Avtosaqlash', callback_data: 'toggle_autosave' }
              ],
              [
                { text: '🔔 Bildirishnomalar', callback_data: 'toggle_notifications' }
              ]
            ],
          },
        }
      );
    } catch (error) {
      await this.handleError(ctx, error, 'start command');
    }
  }
} 