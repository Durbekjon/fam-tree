import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Telegraf, Markup, Context } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { StateService, UserState, UserStateData } from './state.service';
import { TreeVisualizationService } from '../services/tree-visualization.service';
import { PdfExportService } from '../services/pdf-export.service';
import { PrismaService } from '../prisma/prisma.service';
import { RelationType, FamilyMember } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { TreeMergeService } from '../services/tree-merge.service';
import { TreeRole } from '../enums/tree-role.enum';
import { InviteService } from '../services/invite.service';
import { CommandHandlerFactory } from './services/command-handler-factory.service';
import { TelegramBotError } from './errors/telegram.errors';
import { SettingsHandler } from './services/settings-handler.service';
import { AddCommandHandler } from './services/add-command-handler.service';

type FamilyMemberWithRelations = FamilyMember & {
  relatedTo: FamilyMember[];
  relatedFrom: FamilyMember[];
};

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf<Context>;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly stateService: StateService,
    private readonly treeVisualizationService: TreeVisualizationService,
    private readonly pdfExportService: PdfExportService,
    private readonly treeMergeService: TreeMergeService,
    private readonly inviteService: InviteService,
    private readonly commandHandlerFactory: CommandHandlerFactory,
    private readonly settingsHandler: SettingsHandler,
    private readonly addCommandHandler: AddCommandHandler,
  ) {
    const token = this.configService.get<string>('telegram.token');
    if (!token) {
      throw new TelegramBotError('Telegram bot token is not configured', 'CONFIG_ERROR');
    }
    this.bot = new Telegraf(token);
  }

  async onModuleInit() {
    try {
      this.setupErrorHandling();
      this.setupCommands();
      this.setupCallbacks();
      this.setupRelationCommands();
      this.setupRelationCallbacks();
      this.setupMessageHandlers();
      await this.bot.launch();
      this.logger.log('Bot started successfully');
    } catch (error) {
      this.logger.error('Failed to start bot:', error);
      throw error;
    }
  }

  private setupErrorHandling() {
    this.bot.catch((err: Error, ctx: Context) => {
      this.logger.error(`Error for ${ctx.updateType}:`, err);
      ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.').catch(error => {
        this.logger.error('Failed to send error message:', error);
      });
    });
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries = this.MAX_RETRIES,
    delay = this.RETRY_DELAY
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries === 0) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryOperation(operation, retries - 1, delay);
    }
  }

  private async validateUser(ctx: Context): Promise<boolean> {
    if (!ctx.chat) {
      await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      return false;
    }
    return true;
  }

  private getChatId(ctx: Context): string | null {
    return ctx.chat?.id.toString() ?? null;
  }

  private async getUser(telegramId: string) {
    let user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: { familyMembers: true }
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          telegramId,
          familyMembers: {
            create: []
          }
        },
        include: { familyMembers: true }
      });
    }

    return user;
  }

  private async handleError(ctx: Context, error: any, context: string) {
    this.logger.error(`Error in ${context}: ${error.message}`, error.stack);
    await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }

  private setupCommands() {
    this.bot.command('start', async (ctx) => {
      const handler = this.commandHandlerFactory.createHandler('start');
      await handler.handle(ctx);
    });

    this.bot.command('add', async (ctx) => {
      const handler = this.commandHandlerFactory.createHandler('add');
      await handler.handle(ctx);
    });

    this.bot.command('settings', async (ctx) => {
      await this.settingsHandler.handle(ctx);
    });

    this.bot.command('view', async (ctx) => {
      if (!ctx.chat) {
        return ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      }

      const telegramId = ctx.from.id.toString();
      const loadingMsg = await ctx.reply('⏳ Oila daraxtingiz yuklanmoqda...');
      
      try {
        const user = await this.prisma.user.findUnique({
          where: { telegramId },
          include: {
            familyMembers: {
              include: {
                relatedTo: true,
                relatedFrom: true,
              },
            },
          },
        });

        if (!user || !user.familyMembers.length) {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
          return ctx.reply(
            '❌ Siz hali hech qanday qarindosh qo\'shmagansiz.\n\n' +
            '📝 Qarindosh qo\'shish uchun /add buyrug\'ini ishlating.',
            { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📝 Yangi qarindosh qo\'shish', callback_data: 'add_new' }],
                  [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
                ],
              },
            }
          );
        }

        const tree = this.treeVisualizationService.generateTextTree(
          user.familyMembers
        );
        
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        await ctx.reply(
          '🌳 *Oila daraxtingiz:*\n\n' + tree,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 Yangi qarindosh qo\'shish', callback_data: 'add_new' }],
                [{ text: '🔄 Yangilash', callback_data: 'refresh_tree' }],
                [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
              ],
            },
          }
        );
      } catch (error) {
        if (ctx.chat) {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        }
        await ctx.reply(
          '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.',
          { 
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Qaytadan urinib ko\'rish', callback_data: 'view_tree' }],
                [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
              ],
            },
          }
        );
      }
    });

    this.bot.command('search', async (ctx) => {
      try {
        if (!ctx.chat) {
          await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          return;
        }

        const user = await this.prisma.user.findUnique({
          where: { telegramId: ctx.chat.id.toString() },
          include: { familyMembers: true },
        });

        if (!user || !user.familyMembers.length) {
          return ctx.reply(
            '❌ Siz hali hech qanday qarindosh qo\'shmagansiz.\n\n' +
            '📝 Qarindosh qo\'shish uchun /add buyrug\'ini ishlating.',
            { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📝 Yangi qarindosh qo\'shish', callback_data: 'add_new' }],
                  [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
                ],
              },
            }
          );
        }

        this.stateService.setState(ctx.chat.id.toString(), {
          action: 'searching',
          step: 'enter_name',
          data: {}
        });

        await ctx.reply(
          '🔍 *Qidiruv uchun ism yoki familiyani kiriting:*',
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
              ],
            },
          }
        );
      } catch (error) {
        console.error('Search command error:', error);
        await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      }
    });

    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        '📚 *Shajara bot yordam*\n\n' +
        'Asosiy buyruqlar:\n' +
        '👋 `/start` - Botni ishga tushirish\n' +
        '📝 `/add` - Yangi qarindosh qo\'shish\n' +
        '👀 `/view` - Oila daraxtini ko\'rish\n' +
        '🔍 `/search` - Qarindoshlarni qidirish\n' +
        '📤 `/export` - Oila daraxtini eksport qilish\n' +
        '❓ `/help` - Yordam\n\n' +
        'Qarindoshlaringizni qo\'shish uchun /add buyrug\'ini ishlatib, ' +
        'keyin qarindosh turini tanlang va so\'ralgan ma\'lumotlarni kiriting.',
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
            ],
          },
        }
      );
    });

    this.bot.command('export', async (ctx) => {
      try {
        if (!await this.validateUser(ctx)) return;
        const chatId = this.getChatId(ctx);
        if (!chatId) return;

        const user = await this.getUser(chatId);
        const trees = await this.inviteService.getUserTrees(user.id);

        if (!trees.length) {
          await ctx.reply('❌ Sizda hali oila daraxti mavjud emas.');
          return;
        }

        const keyboard = trees.map(tree => [{
          text: tree.name,
          callback_data: `export_tree_${tree.id}`
        }]);

        await ctx.reply(
          '📤 Qaysi oila daraxtini yuklab olmoqchisiz?',
          {
            reply_markup: {
              inline_keyboard: keyboard
            }
          }
        );
      } catch (error) {
        await this.handleError(ctx, error, 'export command');
      }
    });

    this.bot.command('invite', async (ctx) => {
      try {
        if (!await this.validateUser(ctx)) return;
        const chatId = this.getChatId(ctx);
        if (!chatId) return;

        const user = await this.getUser(chatId);
        const trees = await this.inviteService.getUserTrees(user.id);

        if (!trees.length) {
          await ctx.reply('❌ Sizda hali oila daraxti mavjud emas.');
          return;
        }

        const keyboard = trees.map(tree => [{
          text: tree.name,
          callback_data: `invite_tree_${tree.id}`
        }]);

        await ctx.reply(
          '🔗 Qaysi oila daraxtiga taklif yaratmoqchisiz?',
          {
            reply_markup: {
              inline_keyboard: keyboard
            }
          }
        );
      } catch (error) {
        await this.handleError(ctx, error, 'invite command');
      }
    });

    this.bot.command('merge', async (ctx) => {
      try {
        if (!await this.validateUser(ctx)) return;
        const chatId = this.getChatId(ctx);
        if (!chatId) return;

        const user = await this.getUser(chatId);
        const trees = await this.inviteService.getUserTrees(user.id);

        if (!trees.length) {
          await ctx.reply('❌ Sizda hali oila daraxti mavjud emas.');
          return;
        }

        const keyboard = trees.map(tree => [{
          text: tree.name,
          callback_data: `merge_tree_${tree.id}`
        }]);

        await ctx.reply(
          '🔄 Qaysi oila daraxtini birlashtirmoqchisiz?',
          {
            reply_markup: {
              inline_keyboard: keyboard
            }
          }
        );
      } catch (error) {
        await this.handleError(ctx, error, 'merge command');
      }
    });
  }

  private setupCallbacks() {
    this.bot.action(/add_(.+)/, async (ctx) => {
      const relationType = ctx.match[1].toUpperCase() as keyof typeof RelationType;
      const userId = ctx.from.id.toString();
      
      this.stateService.setState(userId, {
        action: 'adding_member',
        step: 'enter_name',
        data: {
          relationType: RelationType[relationType] as RelationType
        }
      });

      await ctx.reply(
        `📝 *Yangi ${this.getRelationName(RelationType[relationType] as RelationType)} uchun to\'liq ismni kiriting:*`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Orqaga', callback_data: 'back_to_add' }],
            ],
          },
        }
      );
    });

    this.bot.action('add_new', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const chatId = this.getChatId(ctx);
        if (!chatId) {
          await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          return;
        }

        this.stateService.setState(chatId, {
          action: 'adding_member',
          step: 'enter_name',
          data: {
            name: undefined,
            birthYear: undefined,
            relationType: undefined,
            selectedMemberId: undefined
          }
        });

        await ctx.editMessageText(
          '👤 Qarindoshning aloqasini tanlang:',
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '👨 Ota', callback_data: 'relation_FATHER' },
                  { text: '👩 Ona', callback_data: 'relation_MOTHER' }
                ],
                [
                  { text: '👶 Farzand', callback_data: 'relation_CHILD' },
                  { text: '👥 Aka-uka/Singil', callback_data: 'relation_SIBLING' }
                ],
                [
                  { text: '💑 Turmush o\'rtog\'i', callback_data: 'relation_SPOUSE' }
                ],
                [
                  { text: '⬅️ Orqaga', callback_data: 'back_to_main' }
                ]
              ]
            }
          }
        );
      } catch (error) {
        await this.handleError(ctx, error, 'add_new action');
      }
    });

    // Relation type selection handler
    this.bot.action(/^relation_(.+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        if (!ctx.chat) {
          await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          return;
        }

        const match = ctx.match;
        if (!match || !match[1]) {
          console.error('Invalid relation type format');
          await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          return;
        }

        const relationType = match[1] as RelationType;
        const chatId = ctx.chat.id.toString();
        const state = this.stateService.getState(chatId);

        this.logger.debug('Setting relation type:', { relationType, state });

        // Update state with selected relation type
        this.stateService.setState(chatId, {
          action: 'adding_member',
          step: 'enter_name',
          data: {
            ...state?.data,
            relationType
          }
        });

        // Ask for the name
        await ctx.editMessageText(
          '👤 Qarindoshning to\'liq ismini kiriting:',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
              ]
            }
          }
        );
      } catch (error) {
        this.logger.error(`Relation selection error: ${error.message}`, error.stack);
        await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      }
    });

    // Member selection handler
    this.bot.action(/^select_member_(.+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        if (!ctx.chat) {
          await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          return;
        }

        const match = ctx.match;
        if (!match || !match[1]) {
          console.error('Invalid member selection format');
          await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          return;
        }

        const selectedMemberId = match[1];
        const chatId = ctx.chat.id.toString();
        const state = this.stateService.getState(chatId);
        const stateData = state?.data;

        this.logger.debug(`Processing member selection:`, {
          selectedMemberId,
          state,
          stateData
        });

        if (!state || state.action !== 'adding_member' || !stateData?.name || !stateData?.birthYear || !stateData?.relationType) {
          this.logger.error('Invalid state for member selection:', {
            hasState: !!state,
            action: state?.action,
            hasName: !!stateData?.name,
            hasBirthYear: !!stateData?.birthYear,
            hasRelationType: !!stateData?.relationType
          });
          await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          return;
        }

        // Get or create user first
        const user = await this.getUser(chatId);
        this.logger.debug(`User found/created:`, { userId: user.id });

        // Validate relation type
        const relationType = stateData.relationType;
        const selectedMember = await this.prisma.familyMember.findUnique({
          where: { id: selectedMemberId },
          include: {
            relatedTo: true,
            relatedFrom: true
          }
        });

        if (!selectedMember) {
          this.logger.error(`Selected member not found: ${selectedMemberId}`);
          await ctx.reply('❌ Tanlangan qarindosh topilmadi. Iltimos, qaytadan urinib ko\'ring.');
          return;
        }

        // Check for duplicate relations
        const existingRelation = selectedMember.relatedTo.find(r => 
          r.relationType === relationType && 
          r.fullName === stateData.name && 
          r.birthYear === stateData.birthYear
        );

        if (existingRelation) {
          this.logger.warn(`Duplicate relation detected: ${existingRelation.id}`);
          await ctx.reply(
            '⚠️ Bu qarindosh allaqachon qo\'shilgan.\n\n' +
            'Boshqa qarindosh qo\'shish uchun /add buyrug\'ini ishlating.',
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📝 Yangi qarindosh qo\'shish', callback_data: 'add_new' }],
                  [{ text: '👀 Oila daraxtini ko\'rish', callback_data: 'view_tree' }],
                  [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
                ]
              }
            }
          );
          return;
        }

        // Validate relation type compatibility
        const isValidRelation = this.validateRelationType(relationType, selectedMember.relationType);
        if (!isValidRelation) {
          this.logger.warn(`Invalid relation type combination: ${relationType} with ${selectedMember.relationType}`);
          await ctx.reply(
            '❌ Bu turdagi bog\'lanish mumkin emas.\n\n' +
            'Iltimos, boshqa qarindosh turini tanlang.',
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Qaytadan urinib ko\'rish', callback_data: 'add_new' }],
                  [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
                ]
              }
            }
          );
          return;
        }

        this.logger.debug(`Creating new family member: ${stateData.name} (${stateData.birthYear})`);

        // Create new family member
        const newMember = await this.prisma.familyMember.create({
          data: {
            fullName: stateData.name,
            birthYear: stateData.birthYear,
            relationType: stateData.relationType,
            userId: user.id,
            isPrivate: false
          }
        });

        this.logger.debug(`Created new member with ID: ${newMember.id}`);

        // Create relation between members
        await this.prisma.familyMember.update({
          where: { id: newMember.id },
          data: {
            relatedTo: {
              connect: { id: selectedMemberId }
            }
          }
        });

        this.logger.debug(`Created relation between ${newMember.id} and ${selectedMemberId}`);

        // Clear state
        this.stateService.clearState(chatId);

        // Get updated family tree
        const updatedUser = await this.prisma.user.findUnique({
          where: { id: user.id },
          include: {
            familyMembers: {
              include: {
                relatedTo: true,
                relatedFrom: true
              }
            }
          }
        });

        if (!updatedUser) {
          throw new Error('User not found after member creation');
        }

        // Show enhanced tree view
        await this.showEnhancedTree(ctx, updatedUser.familyMembers);
      } catch (error) {
        this.logger.error(`Error in member selection: ${error.message}`, error.stack);
        await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      }
    });

    this.bot.action('refresh_tree', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        if (!ctx.chat) {
          await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          return;
        }

        const loadingMsg = await ctx.reply('⏳ Oila daraxtingiz yangilanmoqda...');
        
        const user = await this.prisma.user.findUnique({
          where: { telegramId: ctx.chat.id.toString() },
          include: {
            familyMembers: {
              include: {
                relatedTo: true,
                relatedFrom: true,
              },
            },
          },
        });

        if (!user || !user.familyMembers.length) {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
          return ctx.reply(
            '❌ Siz hali hech qanday qarindosh qo\'shmagansiz.\n\n' +
            '📝 Qarindosh qo\'shish uchun /add buyrug\'ini ishlating.',
            { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📝 Yangi qarindosh qo\'shish', callback_data: 'add_new' }],
                  [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
                ],
              },
            }
          );
        }

        const tree = this.treeVisualizationService.generateTextTree(user.familyMembers);
        
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        await ctx.editMessageText(
          '🌳 *Oila daraxtingiz:*\n\n' + tree,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 Yangi qarindosh qo\'shish', callback_data: 'add_new' }],
                [{ text: '🔄 Yangilash', callback_data: 'refresh_tree' }],
                [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
              ],
            },
          }
        );
      } catch (error) {
        console.error('Refresh tree error:', error);
        await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      }
    });

    this.bot.action('back_to_main', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
          '👋 *Assalomu alaykum! Shajara botiga xush kelibsiz*\n\n' +
          '🌳 Oila daraxtingizni yaratish va boshqarish uchun quyidagi buyruqlardan foydalaning:\n\n' +
          '📝 /add - Yangi qarindosh qo\'shish\n' +
          '👀 /view - Oila daraxtini ko\'rish\n' +
          '🔍 /search - Qarindoshlarni qidirish\n' +
          '📤 /export - Oila daraxtini eksport qilish\n' +
          '❓ /help - Yordam',
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 Yangi qarindosh qo\'shish', callback_data: 'add_new' }],
                [{ text: '👀 Oila daraxtini ko\'rish', callback_data: 'view_tree' }],
                [{ text: '🔍 Qidirish', callback_data: 'search_members' }],
              ],
            },
          }
        );
      } catch (error) {
        console.error('Back to main error:', error);
        await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      }
    });

    this.bot.action('back_to_add', async (ctx) => {
      await ctx.answerCbQuery('⬅️ Orqaga qaytish...');
      await ctx.reply(
        '👥 *Qarindosh turini tanlang:*',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '👨 Ota', callback_data: 'add_father' },
                { text: '👩 Ona', callback_data: 'add_mother' },
              ],
              [
                { text: '👥 Aka-uka/Singil', callback_data: 'add_sibling' },
                { text: '👶 Farzand', callback_data: 'add_child' },
              ],
              [
                { text: '💑 Turmush o\'rtog\'i', callback_data: 'add_spouse' },
              ],
              [
                { text: '⬅️ Orqaga', callback_data: 'back_to_main' },
              ],
            ],
          },
        },
      );
    });

    this.bot.action('search_members', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        if (!ctx.chat) {
          await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          return;
        }

        const user = await this.prisma.user.findUnique({
          where: { telegramId: ctx.chat.id.toString() },
          include: { familyMembers: true },
        });

        if (!user || !user.familyMembers.length) {
          return ctx.reply(
            '❌ Siz hali hech qanday qarindosh qo\'shmagansiz.\n\n' +
            '📝 Qarindosh qo\'shish uchun /add buyrug\'ini ishlating.',
            { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📝 Yangi qarindosh qo\'shish', callback_data: 'add_new' }],
                  [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
                ],
              },
            }
          );
        }

        this.stateService.setState(ctx.chat.id.toString(), {
          action: 'searching',
          step: 'enter_name',
          data: {}
        });

        await ctx.editMessageText(
          '🔍 *Qidiruv uchun ism yoki familiyani kiriting:*',
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
              ],
            },
          }
        );
      } catch (error) {
        console.error('Search members error:', error);
        await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      }
    });

    this.bot.action('view_tree', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        if (!ctx.chat) {
          await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          return;
        }

        const loadingMsg = await ctx.reply('⏳ Oila daraxtingiz yuklanmoqda...');
        
        const user = await this.prisma.user.findUnique({
          where: { telegramId: ctx.chat.id.toString() },
          include: {
            familyMembers: {
              include: {
                relatedTo: true,
                relatedFrom: true,
              },
            },
          },
        });

        if (!user || !user.familyMembers.length) {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
          return ctx.reply(
            '❌ Siz hali hech qanday qarindosh qo\'shmagansiz.\n\n' +
            '📝 Qarindosh qo\'shish uchun /add buyrug\'ini ishlating.',
            { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📝 Yangi qarindosh qo\'shish', callback_data: 'add_new' }],
                  [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
                ],
              },
            }
          );
        }

        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        await this.showEnhancedTree(ctx, user.familyMembers);
      } catch (error) {
        this.logger.error(`Error in view_tree callback: ${error.message}`, error.stack);
        await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      }
    });

    this.bot.action('new_search', async (ctx) => {
      await ctx.answerCbQuery('🔍 Yangi qidiruv...');
      const telegramId = ctx.from.id.toString();
      const user = await this.prisma.user.findUnique({
        where: { telegramId },
        include: { familyMembers: true },
      });

      if (!user || !user.familyMembers.length) {
        return ctx.reply(
          '❌ Siz hali hech qanday qarindosh qo\'shmagansiz.\n\n' +
          '📝 Qarindosh qo\'shish uchun /add buyrug\'ini ishlating.',
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 Yangi qarindosh qo\'shish', callback_data: 'add_new' }],
                [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
              ],
            },
          }
        );
      }

      this.stateService.setState(telegramId, { action: 'searching' });
      await ctx.reply(
        '🔍 *Qidiruv uchun ism yoki familiyani kiriting:*',
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
            ],
          },
        }
      );
    });

    // Export PDF callback
    this.bot.action(/^export_tree_(.+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const chatId = this.getChatId(ctx);
        if (!chatId) return;

        const treeId = ctx.match[1];
        const outputPath = path.join(process.cwd(), 'temp', `${treeId}.pdf`);

        await ctx.reply('⏳ PDF yaratilmoqda...');

        await this.pdfExportService.generateTreePdf(treeId, outputPath);

        await ctx.replyWithDocument({
          source: outputPath,
          filename: 'family_tree.pdf'
        });

        // Cleanup
        fs.unlinkSync(outputPath);
      } catch (error) {
        await this.handleError(ctx, error, 'export_tree callback');
      }
    });

    // Create invite callback
    this.bot.action(/^invite_tree_(.+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const chatId = this.getChatId(ctx);
        if (!chatId) return;

        const treeId = ctx.match[1];
        const user = await this.getUser(chatId);

        const { inviteUrl } = await this.inviteService.createInvite(treeId);

        await ctx.reply(
          '🔗 Quyidagi havolani oilangiz a\'zolariga yuboring:\n\n' +
          inviteUrl + '\n\n' +
          '⚠️ Havola 7 kundan keyin muddati tugaydi.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
              ]
            }
          }
        );
      } catch (error) {
        await this.handleError(ctx, error, 'invite_tree callback');
      }
    });

    // Merge trees callback
    this.bot.action(/^merge_tree_(.+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const chatId = this.getChatId(ctx);
        if (!chatId) return;

        const sourceTreeId = ctx.match[1];
        const user = await this.getUser(chatId);
        const trees = await this.inviteService.getUserTrees(user.id);

        const availableTrees = trees.filter(t => t.id !== sourceTreeId);
        if (!availableTrees.length) {
          await ctx.reply('❌ Birlashtirish uchun boshqa daraxt topilmadi.');
          return;
        }

        const keyboard = availableTrees.map(tree => [{
          text: tree.name,
          callback_data: `merge_with_${sourceTreeId}_${tree.id}`
        }]);

        keyboard.push([{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]);

        await ctx.reply(
          '🔄 Qaysi daraxt bilan birlashtirmoqchisiz?',
          {
            reply_markup: {
              inline_keyboard: keyboard
            }
          }
        );
      } catch (error) {
        await this.handleError(ctx, error, 'merge_tree callback');
      }
    });

    // Merge with specific tree callback
    this.bot.action(/^merge_with_(.+)_(.+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const chatId = this.getChatId(ctx);
        if (!chatId) return;

        const [sourceTreeId, targetTreeId] = [ctx.match[1], ctx.match[2]];
        const user = await this.getUser(chatId);

        const sharedAncestors = await this.treeMergeService.findSharedAncestors(
          sourceTreeId,
          targetTreeId
        );

        if (sharedAncestors.length === 0) {
          await ctx.reply('❌ Bu daraxtlar o\'rtasida umumiy ajdodlar topilmadi.');
          return;
        }

        const merge = await this.treeMergeService.requestMerge(
          sourceTreeId,
          targetTreeId,
          user.id,
          user.id // For now, we're using the same user as receiver
        );

        await ctx.reply(
          '✅ Birlashtirish so\'rovi yaratildi!\n\n' +
          'Umumiy ajdodlar soni: ' + sharedAncestors.length + '\n\n' +
          'Birlashtirishni tasdiqlash uchun /merge buyrug\'ini qayta ishlatib, ' +
          'tasdiqlash tugmasini bosing.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Tasdiqlash', callback_data: `confirm_merge_${merge.id}` }],
                [{ text: '❌ Bekor qilish', callback_data: 'back_to_main' }]
              ]
            }
          }
        );
      } catch (error) {
        await this.handleError(ctx, error, 'merge_with callback');
      }
    });

    // Confirm merge callback
    this.bot.action(/^confirm_merge_(.+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const chatId = this.getChatId(ctx);
        if (!chatId) return;

        const mergeId = ctx.match[1];
        const user = await this.getUser(chatId);

        await this.treeMergeService.approveMerge(mergeId, user.id);

        await ctx.reply(
          '✅ Daraxtlar muvaffaqiyatli birlashtirildi!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '👀 Yangi daraxtni ko\'rish', callback_data: 'view_tree' }],
                [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
              ]
            }
          }
        );
      } catch (error) {
        await this.handleError(ctx, error, 'confirm_merge callback');
      }
    });

    // Settings callbacks
    this.bot.action('settings', async (ctx) => {
      if (!ctx.from) return;
      const telegramId = ctx.from.id.toString();
      const preferences = await this.settingsHandler.getUserPreferences(telegramId);
      
      await ctx.reply(
        '*⚙️ Sozlamalar:*\n\n' +
        'Matn o\'lchami: ' + this.getFontSizeLabel(preferences.fontSize) + '\n' +
        'Ovozli yo\'riqnoma: ' + (preferences.voiceEnabled ? '✅' : '❌') + '\n' +
        'Yuqori kontrast: ' + (preferences.highContrast ? '✅' : '❌') + '\n' +
        'Avtomatik saqlash: ' + (preferences.autoSave ? '✅' : '❌') + '\n' +
        'Bildirishnomalar: ' + (preferences.notifications ? '✅' : '❌'),
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Matn o\'lchami', callback_data: 'font_size' }],
              [{ text: '🎧 Ovozli yo\'riqnoma', callback_data: 'toggle_voice' }],
              [{ text: '👁️ Yuqori kontrast', callback_data: 'toggle_contrast' }],
              [{ text: '💾 Avtomatik saqlash', callback_data: 'toggle_autosave' }],
              [{ text: '🔔 Bildirishnomalar', callback_data: 'toggle_notifications' }],
              [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
            ]
          }
        }
      );
    });

    // Font size callbacks
    this.bot.action('font_small', async (ctx) => {
      if (!ctx.from) return;
      await this.settingsHandler.handleCallback(ctx, 'font_small');
    });

    this.bot.action('font_medium', async (ctx) => {
      if (!ctx.from) return;
      await this.settingsHandler.handleCallback(ctx, 'font_medium');
    });

    this.bot.action('font_large', async (ctx) => {
      if (!ctx.from) return;
      await this.settingsHandler.handleCallback(ctx, 'font_large');
    });

    // Toggle callbacks
    this.bot.action('toggle_voice', async (ctx) => {
      if (!ctx.from) return;
      await this.settingsHandler.handleCallback(ctx, 'toggle_voice');
    });

    this.bot.action('toggle_contrast', async (ctx) => {
      if (!ctx.from) return;
      await this.settingsHandler.handleCallback(ctx, 'toggle_contrast');
    });

    this.bot.action('toggle_autosave', async (ctx) => {
      if (!ctx.from) return;
      await this.settingsHandler.handleCallback(ctx, 'toggle_autosave');
    });

    this.bot.action('toggle_notifications', async (ctx) => {
      if (!ctx.from) return;
      await this.settingsHandler.handleCallback(ctx, 'toggle_notifications');
    });

    // Relation selection callbacks
    this.bot.action('add_father', async (ctx) => {
      await this.addCommandHandler.handleRelationSelection(ctx, 'FATHER');
    });

    this.bot.action('add_mother', async (ctx) => {
      await this.addCommandHandler.handleRelationSelection(ctx, 'MOTHER');
    });

    this.bot.action('add_sibling', async (ctx) => {
      await this.addCommandHandler.handleRelationSelection(ctx, 'SIBLING');
    });

    this.bot.action('add_child', async (ctx) => {
      await this.addCommandHandler.handleRelationSelection(ctx, 'CHILD');
    });

    this.bot.action('add_spouse', async (ctx) => {
      await this.addCommandHandler.handleRelationSelection(ctx, 'SPOUSE');
    });
  }

  private setupMessageHandlers() {
    this.bot.on('text', async (ctx) => {
      if (!ctx.from) return;

      const telegramId = ctx.from.id.toString();
      const state = this.stateService.getState(telegramId);

      if (!state) return;

      switch (state.action) {
        case 'adding_member':
          switch (state.step) {
            case 'enter_name':
              await this.addCommandHandler.handleNameInput(ctx, ctx.message.text);
              break;
            case 'enter_birth_year':
              await this.addCommandHandler.handleBirthYearInput(ctx, ctx.message.text);
              break;
          }
          break;
        case 'searching':
          // Handle search input
          break;
      }
    });
  }

  private getRelationName(relationType: RelationType | undefined): string {
    if (!relationType) {
      return 'noma\'lum';
    }

    const names: Record<RelationType, string> = {
      [RelationType.FATHER]: 'ota',
      [RelationType.MOTHER]: 'ona',
      [RelationType.SIBLING]: 'aka-uka/singil',
      [RelationType.CHILD]: 'farzand',
      [RelationType.SPOUSE]: 'turmush o\'rtog\'i',
    };

    return names[relationType] || 'noma\'lum';
  }

  // Add helper method for relation type validation
  private validateRelationType(newRelationType: RelationType, existingRelationType: RelationType): boolean {
    const validCombinations: Record<RelationType, RelationType[]> = {
      [RelationType.FATHER]: [RelationType.CHILD, RelationType.MOTHER, RelationType.SPOUSE],
      [RelationType.MOTHER]: [RelationType.CHILD, RelationType.FATHER, RelationType.SPOUSE],
      [RelationType.CHILD]: [RelationType.FATHER, RelationType.MOTHER],
      [RelationType.SIBLING]: [RelationType.SIBLING],
      [RelationType.SPOUSE]: [RelationType.FATHER, RelationType.MOTHER]
    };

    // Additional validation rules
    const validationRules = {
      [RelationType.FATHER]: {
        maxCount: 1,
        oppositeGender: true,
        minAgeDifference: 15
      },
      [RelationType.MOTHER]: {
        maxCount: 1,
        oppositeGender: true,
        minAgeDifference: 15
      },
      [RelationType.SPOUSE]: {
        maxCount: 1,
        oppositeGender: true,
        maxAgeDifference: 30
      },
      [RelationType.SIBLING]: {
        maxAgeDifference: 20
      }
    };

    // Check if the combination is valid
    const isValid = validCombinations[newRelationType]?.includes(existingRelationType) || false;
    
    this.logger.debug(`Validating relation types:`, {
      newRelationType,
      existingRelationType,
      isValid,
      validCombinations: validCombinations[newRelationType]
    });

    return isValid;
  }

  private getDetailedErrorMessage(error: string, context: any): string {
    const errorMessages: Record<string, string> = {
      'DUPLICATE_RELATION': 'Bu qarindosh allaqachon qo\'shilgan. Iltimos, boshqa qarindosh qo\'shing.',
      'INVALID_RELATION': 'Bu turdagi bog\'lanish mumkin emas. Iltimos, boshqa qarindosh turini tanlang.',
      'AGE_DIFFERENCE': 'Yosh farqi noto\'g\'ri. Iltimos, qarindoshning tug\'ilgan yilini tekshiring.',
      'MAX_RELATIONS': 'Bu turdagi qarindoshlar soni cheklangan. Iltimos, boshqa turdagi qarindosh qo\'shing.',
      'GENDER_MISMATCH': 'Jins mos kelmaydi. Iltimos, to\'g\'ri jinsdagi qarindoshni tanlang.'
    };

    return errorMessages[error] || 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.';
  }

  // Add relation management commands
  private setupRelationCommands() {
    this.bot.command('edit_relation', async (ctx) => {
      if (!ctx.chat) return;
      
      const user = await this.getUser(ctx.chat.id.toString());
      if (!user.familyMembers.length) {
        await ctx.reply(
          '❌ Siz hali hech qanday qarindosh qo\'shmagansiz.\n\n' +
          '📝 Qarindosh qo\'shish uchun /add buyrug\'ini ishlating.'
        );
        return;
      }

      const keyboard = user.familyMembers.map(member => [{
        text: `${member.fullName} (${member.birthYear})`,
        callback_data: `edit_member_${member.id}`
      }]);

      keyboard.push([{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]);

      await ctx.reply(
        '👥 Qaysi qarindoshning bog\'lanishini o\'zgartirmoqchisiz?',
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
    });

    this.bot.command('remove_relation', async (ctx) => {
      if (!ctx.chat) return;
      
      const user = await this.getUser(ctx.chat.id.toString());
      if (!user.familyMembers.length) {
        await ctx.reply(
          '❌ Siz hali hech qanday qarindosh qo\'shmagansiz.\n\n' +
          '📝 Qarindosh qo\'shish uchun /add buyrug\'ini ishlating.'
        );
        return;
      }

      const keyboard = user.familyMembers.map(member => [{
        text: `${member.fullName} (${member.birthYear})`,
        callback_data: `remove_member_${member.id}`
      }]);

      keyboard.push([{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]);

      await ctx.reply(
        '👥 Qaysi qarindoshni o\'chirmoqchisiz?',
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
    });
  }

  // Add relation management callbacks
  private setupRelationCallbacks() {
    this.bot.action(/^edit_member_(\d+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        if (!ctx.chat) return;

        const memberId = ctx.match[1];
        const member = await this.prisma.familyMember.findUnique({
          where: { id: memberId },
          include: {
            relatedTo: true,
            relatedFrom: true
          }
        });

        if (!member) {
          await ctx.reply('❌ Qarindosh topilmadi.');
          return;
        }

        const relations = [...member.relatedTo, ...member.relatedFrom];
        if (!relations.length) {
          await ctx.reply('❌ Bu qarindoshning bog\'lanishlari yo\'q.');
          return;
        }

        const keyboard = relations.map(relation => [{
          text: `${relation.fullName} (${relation.birthYear}) - ${this.getRelationName(relation.relationType)}`,
          callback_data: `edit_relation_${memberId}_${relation.id}`
        }]);

        keyboard.push([{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]);

        await ctx.editMessageText(
          '👥 Qaysi bog\'lanishni o\'zgartirmoqchisiz?',
          {
            reply_markup: {
              inline_keyboard: keyboard
            }
          }
        );
      } catch (error) {
        this.logger.error(`Error in edit_member callback: ${error.message}`, error.stack);
        await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      }
    });

    this.bot.action(/^remove_member_(\d+)$/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        if (!ctx.chat) return;

        const memberId = ctx.match[1];
        const member = await this.prisma.familyMember.findUnique({
          where: { id: memberId },
          include: {
            relatedTo: true,
            relatedFrom: true
          }
        });

        if (!member) {
          await ctx.reply('❌ Qarindosh topilmadi.');
          return;
        }

        await this.prisma.familyMember.delete({
          where: { id: memberId }
        });

        await ctx.editMessageText(
          '✅ Qarindosh muvaffaqiyatli o\'chirildi!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '👀 Oila daraxtini ko\'rish', callback_data: 'view_tree' }],
                [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
              ]
            }
          }
        );
      } catch (error) {
        this.logger.error(`Error in remove_member callback: ${error.message}`, error.stack);
        await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      }
    });
  }

  // Enhanced tree visualization
  private async showEnhancedTree(ctx: Context, members: FamilyMemberWithRelations[]) {
    const tree = this.treeVisualizationService.generateTextTree(members);
    const stats = this.calculateTreeStats(members);

    const message = 
      '🌳 *Oila daraxtingiz:*\n\n' +
      tree + '\n\n' +
      '📊 *Statistika:*\n' +
      `• Jami qarindoshlar: ${stats.totalMembers}\n` +
      `• Ota-onalar: ${stats.parents}\n` +
      `• Farzandlar: ${stats.children}\n` +
      `• Aka-uka/Singillar: ${stats.siblings}\n` +
      `• Turmush o\'rtog\'lari: ${stats.spouses}\n`;

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📝 Yangi qarindosh', callback_data: 'add_new' },
            { text: '✏️ Tahrirlash', callback_data: 'edit_relation' }
          ],
          [
            { text: '🗑️ O\'chirish', callback_data: 'remove_relation' },
            { text: '🔄 Yangilash', callback_data: 'refresh_tree' }
          ],
          [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
        ]
      }
    });
  }

  private calculateTreeStats(members: FamilyMemberWithRelations[]) {
    return {
      totalMembers: members.length,
      parents: members.filter(m => m.relationType === RelationType.FATHER || m.relationType === RelationType.MOTHER).length,
      children: members.filter(m => m.relationType === RelationType.CHILD).length,
      siblings: members.filter(m => m.relationType === RelationType.SIBLING).length,
      spouses: members.filter(m => m.relationType === RelationType.SPOUSE).length
    };
  }

  private getFontSizeLabel(size: string): string {
    switch (size) {
      case 'small': return 'Kichik';
      case 'medium': return 'O\'rta';
      case 'large': return 'Katta';
      default: return 'O\'rta';
    }
  }
} 