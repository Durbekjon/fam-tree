import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { StateService } from '../state.service';
import { RelationType } from '@prisma/client';
import { ErrorHandlerService } from './error-handler.service';
import { UIService } from './ui.service';

@Injectable()
export class AddCommandHandler {
  protected readonly logger = new Logger(AddCommandHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateService: StateService,
    private readonly errorHandler: ErrorHandlerService,
    private readonly ui: UIService,
  ) {}

  private async ensureUserExists(telegramId: string): Promise<boolean> {
    try {
      let user = await this.prisma.user.findUnique({
        where: { telegramId }
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            telegramId,
            settings: '{}'
          }
        });
        this.logger.debug(`Created new user with telegramId: ${telegramId}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to ensure user exists: ${error.message}`, error.stack);
      return false;
    }
  }

  async handle(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id.toString();
      if (!telegramId) return;

      const userExists = await this.ensureUserExists(telegramId);
      if (!userExists) {
        await this.ui.sendMessage(ctx, '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
        return;
      }

      // Set initial state for adding a family member
      this.stateService.setState(telegramId, {
        action: 'adding_member',
        step: 'select_relation',
        data: {}
      });

      await this.showRelationSelectionMenu(ctx);
    } catch (error) {
      await this.errorHandler.handleError(ctx, error, 'adding_member');
    }
  }

  async handleMessage(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id.toString();
      if (!telegramId) return;

      const userExists = await this.ensureUserExists(telegramId);
      if (!userExists) {
        await this.ui.sendMessage(ctx, '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
        return;
      }

      const state = this.stateService.getState(telegramId);
      if (!state || state.action !== 'adding_member') return;

      const message = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;
      if (!message) return;

      switch (state.step) {
        case 'enter_name':
          if (!state.data.relationType) {
            await this.showRelationSelectionMenu(ctx);
            return;
          }
          await this.handleNameInput(ctx, message);
          break;
        case 'enter_birth_year':
          await this.handleBirthYearInput(ctx, message);
          break;
      }
    } catch (error) {
      await this.errorHandler.handleError(ctx, error, 'adding_member');
    }
  }

  async handleCallback(ctx: Context, callbackData: string): Promise<void> {
    try {
      const telegramId = ctx.from?.id.toString();
      if (!telegramId) return;

      const userExists = await this.ensureUserExists(telegramId);
      if (!userExists) {
        await this.ui.sendMessage(ctx, '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
        return;
      }

      const state = this.stateService.getState(telegramId);
      if (!state || state.action !== 'adding_member') return;

      switch (callbackData) {
        case 'add_father':
          await this.handleRelationSelection(ctx, 'FATHER');
          break;
        case 'add_mother':
          await this.handleRelationSelection(ctx, 'MOTHER');
          break;
        case 'add_sibling':
          await this.handleRelationSelection(ctx, 'SIBLING');
          break;
        case 'add_child':
          await this.handleRelationSelection(ctx, 'CHILD');
          break;
        case 'add_spouse':
          await this.handleRelationSelection(ctx, 'SPOUSE');
          break;
        case 'back_to_main':
          this.stateService.clearState(telegramId);
          await this.ui.sendMessage(ctx, '🏠 Bosh menyu', {
            keyboard: this.ui.createMainMenuKeyboard(),
          });
          break;
      }
    } catch (error) {
      await this.errorHandler.handleError(ctx, error, 'adding_member');
    }
  }

  private async showRelationSelectionMenu(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const userExists = await this.ensureUserExists(telegramId);
    if (!userExists) {
      await this.ui.sendMessage(ctx, '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      return;
    }

    // Update state to ensure we're in the correct step
    this.stateService.setState(telegramId, {
      action: 'adding_member',
      step: 'select_relation',
      data: {}
    });

    const keyboard = this.ui.createKeyboard([
      [
        { text: '👨 Ota', callback_data: 'add_father' },
        { text: '👩 Ona', callback_data: 'add_mother' }
      ],
      [
        { text: '👥 Aka-uka/Singil', callback_data: 'add_sibling' },
        { text: '👶 Farzand', callback_data: 'add_child' }
      ],
      [
        { text: '💑 Turmush o\'rtog\'i', callback_data: 'add_spouse' }
      ],
      [
        { text: '⬅️ Orqaga', callback_data: 'back_to_main' }
      ]
    ]);

    await this.ui.sendMessage(
      ctx,
      '👥 *Qarindosh turini tanlang:*\n\n' +
      'Kimni qo\'shmoqchisiz?',
      { keyboard }
    );
  }

  public async handleRelationSelection(ctx: Context, relationType: RelationType): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const userExists = await this.ensureUserExists(telegramId);
    if (!userExists) {
      await this.ui.sendMessage(ctx, '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      return;
    }

    // Update state with selected relation type
    this.stateService.setState(telegramId, {
      action: 'adding_member',
      step: 'enter_name',
      data: { relationType }
    });

    const relationLabel = this.getRelationTypeLabel(relationType);
    await this.ui.sendMessage(
      ctx,
      `👤 *${relationLabel} uchun to'liq ismni kiriting:*\n\n` +
      'Iltimos, to\'liq ismni kiriting (masalan: "Azizov Aziz Azizovich")',
      { keyboard: this.ui.createBackButton('back_to_main') }
    );
  }

  public async handleNameInput(ctx: Context, name: string): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const userExists = await this.ensureUserExists(telegramId);
    if (!userExists) {
      await this.ui.sendMessage(ctx, '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      return;
    }

    const state = this.stateService.getState(telegramId);
    if (!state || !state.data.relationType) {
      await this.showRelationSelectionMenu(ctx);
      return;
    }

    // Update state with name and move to birth year step
    this.stateService.setState(telegramId, {
      action: 'adding_member',
      step: 'enter_birth_year',
      data: {
        ...state.data,
        name
      }
    });

    await this.ui.sendMessage(
      ctx,
      '📅 *Tug\'ilgan yilni kiriting:*\n\n' +
      'Iltimos, to\'liq yilni kiriting (masalan: "1990")',
      { keyboard: this.ui.createBackButton('back_to_main') }
    );
  }

  public async handleBirthYearInput(ctx: Context, birthYear: string): Promise<void> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const userExists = await this.ensureUserExists(telegramId);
    if (!userExists) {
      await this.ui.sendMessage(ctx, '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      return;
    }

    const state = this.stateService.getState(telegramId);
    if (!state || !state.data.relationType || !state.data.name) {
      await this.showRelationSelectionMenu(ctx);
      return;
    }

    const year = parseInt(birthYear);
    if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) {
      await this.ui.sendMessage(
        ctx,
        '❌ Noto\'g\'ri yil kiritildi.\n\n' +
        'Iltimos, 1900-yildan hozirgi yilgacha bo\'lgan yilni kiriting.',
        { keyboard: this.ui.createBackButton('back_to_main') }
      );
      return;
    }

    try {
      // Verify user exists one final time before creating family member
      const user = await this.prisma.user.findUnique({
        where: { telegramId }
      });

      if (!user) {
        await this.ui.sendMessage(ctx, '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
        return;
      }

      // Create the family member
      const familyMember = await this.prisma.familyMember.create({
        data: {
          fullName: state.data.name,
          birthYear: year,
          relationType: state.data.relationType,
          userId: user.id, // Use the user's ID instead of telegramId
          isPrivate: false
        }
      });

      const relationLabel = this.getRelationTypeLabel(state.data.relationType);
      await this.ui.sendMessage(
        ctx,
        `✅ *${relationLabel} muvaffaqiyatli qo'shildi!*\n\n` +
        `👤 Ism: ${familyMember.fullName}\n` +
        `📅 Tug'ilgan yil: ${familyMember.birthYear}`,
        { keyboard: this.ui.createMainMenuKeyboard() }
      );

      // Clear state after successful addition
      this.stateService.clearState(telegramId);
    } catch (error) {
      this.logger.error(`Failed to create family member: ${error.message}`, error.stack);
      await this.errorHandler.handleError(ctx, error, 'adding_member');
    }
  }

  private getRelationTypeLabel(relationType: RelationType): string {
    switch (relationType) {
      case 'FATHER': return 'Ota';
      case 'MOTHER': return 'Ona';
      case 'SIBLING': return 'Aka-uka/Singil';
      case 'CHILD': return 'Farzand';
      case 'SPOUSE': return 'Turmush o\'rtog\'i';
      default: return 'Qarindosh';
    }
  }
} 