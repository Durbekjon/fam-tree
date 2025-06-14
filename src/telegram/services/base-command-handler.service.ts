import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { TelegramBotError, ValidationError } from '../errors/telegram.errors';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export abstract class BaseCommandHandler {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly MAX_RETRIES = 3;
  protected readonly RETRY_DELAY = 1000; // 1 second

  constructor(protected readonly prisma: PrismaService) {}

  protected async validateUser(ctx: Context): Promise<boolean> {
    if (!ctx.chat) {
      throw new ValidationError('Invalid chat context');
    }
    return true;
  }

  protected getChatId(ctx: Context): string {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) {
      throw new ValidationError('Chat ID not found');
    }
    return chatId;
  }

  protected async retryOperation<T>(
    operation: () => Promise<T>,
    retries = this.MAX_RETRIES,
    delay = this.RETRY_DELAY
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries === 0) {
        throw new TelegramBotError(
          'Operation failed after maximum retries',
          'MAX_RETRIES_EXCEEDED',
          { error }
        );
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryOperation(operation, retries - 1, delay);
    }
  }

  protected async handleError(ctx: Context, error: Error, context: string) {
    this.logger.error(`Error in ${context}: ${error.message}`, error.stack);
    
    let errorMessage = '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.';
    
    if (error instanceof TelegramBotError) {
      errorMessage = this.getUserFriendlyErrorMessage(error);
    }

    await ctx.reply(errorMessage).catch(err => {
      this.logger.error('Failed to send error message:', err);
    });
  }

  private getUserFriendlyErrorMessage(error: TelegramBotError): string {
    // Map error codes to user-friendly messages
    const errorMessages: Record<string, string> = {
      'VALIDATION_ERROR': '❌ Noto\'g\'ri ma\'lumot kiritildi. Iltimos, tekshiring.',
      'STATE_ERROR': '❌ Operatsiya vaqti tugadi. Iltimos, qaytadan boshlang.',
      'FAMILY_TREE_ERROR': '❌ Oila daraxti bilan bog\'liq xatolik yuz berdi.',
      'DATABASE_ERROR': '❌ Ma\'lumotlar bazasi xatoligi yuz berdi.',
      'USER_ERROR': '❌ Foydalanuvchi ma\'lumotlari bilan bog\'liq xatolik.',
    };

    return errorMessages[error.code] || '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.';
  }
} 