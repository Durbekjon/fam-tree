import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { BaseCommandHandler } from './base-command-handler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InlineKeyboardMarkup } from 'telegraf/types';

@Injectable()
export class AccessibilityService extends BaseCommandHandler {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  private readonly fontSizeOptions = {
    small: 'Kichik',
    medium: 'O\'rta',
    large: 'Katta',
  };

  private readonly helpContent = {
    main: {
      text: `*Hurmatli foydalanuvchi!*\n\n` +
        `Bu bot orqali siz:\n` +
        `🌳 Oila daraxtingizni yaratishingiz\n` +
        `👥 Qarindoshlaringizni qo\'shishingiz\n` +
        `📝 Ma\'lumotlarni saqlashingiz\n` +
        `🔍 Qarindoshlaringizni qidirishingiz mumkin\n\n` +
        `*Qo\'shimcha imkoniyatlar:*\n` +
        `🎧 Ovozli yo\'riqnoma\n` +
        `📱 Katta matn rejimi\n` +
        `❓ Har bir qadamda yordam\n` +
        `🔄 Xatolarni tuzatish`,
      buttons: [
        [{ text: '🎧 Ovozli yo\'riqnoma', callback_data: 'voice_tutorial' }],
        [{ text: '📱 Matn o\'lchamini o\'zgartirish', callback_data: 'change_font' }],
        [{ text: '❓ Batafsil yordam', callback_data: 'detailed_help' }],
        [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
      ]
    },
    adding_member: {
      text: `*Qarindosh qo\'shish bo\'yicha yo\'riqnoma*\n\n` +
        `1. Qarindosh turini tanlang\n` +
        `2. Ismni kiriting\n` +
        `3. Tug\'ilgan yilni kiriting\n\n` +
        `*Muhim eslatmalar:*\n` +
        `• Ismni to\'g\'ri yozing\n` +
        `• Tug\'ilgan yilni 4 xonali son ko\'rinishida kiriting\n` +
        `• Xatolik yuz berganda "Orqaga" tugmasini bosing`,
      buttons: [
        [{ text: '🎧 Ovozli yo\'riqnoma', callback_data: 'voice_tutorial_add' }],
        [{ text: '📝 Misollar', callback_data: 'add_examples' }],
        [{ text: '⬅️ Orqaga', callback_data: 'back_to_add' }]
      ]
    }
  };

  private readonly culturalTerms = {
    father: ['Ota', 'Bobom', 'Dodam'],
    mother: ['Ona', 'Onam', 'Oyim'],
    sibling: ['Aka', 'Uka', 'Opa', 'Singil'],
    child: ['O\'g\'il', 'Qiz'],
    spouse: ['Er', 'Xotin']
  };

  async sendHelpMessage(ctx: Context, helpType: 'main' | 'adding_member'): Promise<void> {
    const content = this.helpContent[helpType];
    await ctx.reply(content.text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: content.buttons
      } as InlineKeyboardMarkup
    });
  }

  async sendVoiceTutorial(ctx: Context, section: string): Promise<void> {
    const content = this.getTutorialContent(section);
    
    await ctx.reply(
      content.text,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: content.buttons
        } as InlineKeyboardMarkup
      }
    );
  }

  private getTutorialContent(section: string): { text: string; buttons: any[] } {
    switch (section) {
      case 'main':
        return {
          text: '🎧 *Ovozli yo\'riqnoma*\n\n' +
                'Quyidagi tugmalardan birini bosib, botni qanday ishlatish haqida ovozli yo\'riqnomani tinglashingiz mumkin:',
          buttons: [
            [{ text: '🔊 Asosiy funksiyalar', callback_data: 'tutorial_main' }],
            [{ text: '👥 Qarindosh qo\'shish', callback_data: 'tutorial_add' }],
            [{ text: '🔍 Qidiruv', callback_data: 'tutorial_search' }],
            [{ text: '📤 Saqlash', callback_data: 'tutorial_export' }]
          ]
        };
      case 'add':
        return {
          text: '👥 *Qarindosh qo\'shish bo\'yicha yo\'riqnoma*\n\n' +
                'Qarindosh qo\'shish uchun quyidagi qadamlarni bajarish kerak:',
          buttons: [
            [{ text: '1️⃣ Qarindosh turini tanlash', callback_data: 'tutorial_add_step1' }],
            [{ text: '2️⃣ Ma\'lumotlarni kiritish', callback_data: 'tutorial_add_step2' }],
            [{ text: '3️⃣ Bog\'lanishlarni belgilash', callback_data: 'tutorial_add_step3' }]
          ]
        };
      case 'search':
        return {
          text: '🔍 *Qidiruv bo\'yicha yo\'riqnoma*\n\n' +
                'Qarindoshlarni qidirish uchun quyidagi usullardan foydalanishingiz mumkin:',
          buttons: [
            [{ text: '👤 Ism bo\'yicha', callback_data: 'tutorial_search_name' }],
            [{ text: '📅 Yil bo\'yicha', callback_data: 'tutorial_search_year' }],
            [{ text: '📍 Joylashuv bo\'yicha', callback_data: 'tutorial_search_location' }]
          ]
        };
      case 'export':
        return {
          text: '📤 *Saqlash bo\'yicha yo\'riqnoma*\n\n' +
                'Oila daraxtingizni saqlash uchun quyidagi formatlardan birini tanlashingiz mumkin:',
          buttons: [
            [{ text: '📄 PDF formatida', callback_data: 'tutorial_export_pdf' }],
            [{ text: '🖼️ Rasmlar formatida', callback_data: 'tutorial_export_images' }],
            [{ text: '📊 Excel formatida', callback_data: 'tutorial_export_excel' }]
          ]
        };
      default:
        return {
          text: '❓ *Yordam*\n\n' +
                'Qaysi bo\'lim haqida ko\'proq ma\'lumot olmoqchisiz?',
          buttons: [
            [{ text: '👥 Qarindosh qo\'shish', callback_data: 'tutorial_add' }],
            [{ text: '🔍 Qidiruv', callback_data: 'tutorial_search' }],
            [{ text: '📤 Saqlash', callback_data: 'tutorial_export' }]
          ]
        };
    }
  }

  async sendFontSizeOptions(ctx: Context): Promise<void> {
    const buttons = Object.entries(this.fontSizeOptions).map(([key, label]) => [
      { text: label, callback_data: `font_${key}` }
    ]);
    
    await ctx.reply(
      '*Matn o\'lchamini tanlang:*\n\n' +
      'Katta matn rejimi ko\'zni charchashini kamaytiradi va matnlarni o\'qishni osonlashtiradi.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buttons
        } as InlineKeyboardMarkup
      }
    );
  }

  async sendConfirmation(ctx: Context, action: string, details: string): Promise<void> {
    await ctx.reply(
      `*Tasdiqlash kerak*\n\n` +
      `Siz quyidagi amalni bajarishni xohlaysiz:\n` +
      `${details}\n\n` +
      `Tasdiqlash uchun "Ha" tugmasini bosing. Bekor qilish uchun "Yo\'q" tugmasini bosing.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Ha', callback_data: `confirm_${action}` },
              { text: '❌ Yo\'q', callback_data: `cancel_${action}` }
            ]
          ]
        } as InlineKeyboardMarkup
      }
    );
  }

  async sendUndoOption(ctx: Context, action: string): Promise<void> {
    await ctx.reply(
      '🔄 Oxirgi amalni bekor qilish mumkin. Bekor qilishni xohlaysizmi?',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Ha, bekor qilish', callback_data: `undo_${action}` },
              { text: '❌ Yo\'q', callback_data: 'cancel_undo' }
            ]
          ]
        } as InlineKeyboardMarkup
      }
    );
  }

  getCulturalTerms(relationType: string): string[] {
    return this.culturalTerms[relationType] || [];
  }

  async sendFamilyHistoryPrompt(ctx: Context): Promise<void> {
    await ctx.reply(
      '*Oila tarixi*\n\n' +
      'Qarindoshingiz haqida qo\'shimcha ma\'lumot qo\'shishni xohlaysizmi?\n' +
      'Masalan:\n' +
      '• Tug\'ilgan joyi\n' +
      '• Kasbi\n' +
      '• Xotira uchun eslatmalar\n\n' +
      'Bu ma\'lumotlar oila tarixini yanada boyitadi.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Ha, qo\'shish', callback_data: 'add_history' },
              { text: '❌ Yo\'q', callback_data: 'skip_history' }
            ]
          ]
        } as InlineKeyboardMarkup
      }
    );
  }
} 