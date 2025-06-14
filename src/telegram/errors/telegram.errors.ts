export class TelegramBotError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: any
  ) {
    super(message);
    this.name = 'TelegramBotError';
  }
}

export class ValidationError extends TelegramBotError {
  constructor(message: string, context?: any) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

export class StateError extends TelegramBotError {
  constructor(message: string, context?: any) {
    super(message, 'STATE_ERROR', context);
    this.name = 'StateError';
  }
}

export class FamilyTreeError extends TelegramBotError {
  constructor(message: string, context?: any) {
    super(message, 'FAMILY_TREE_ERROR', context);
    this.name = 'FamilyTreeError';
  }
}

export class DatabaseError extends TelegramBotError {
  constructor(message: string, context?: any) {
    super(message, 'DATABASE_ERROR', context);
    this.name = 'DatabaseError';
  }
}

export class UserError extends TelegramBotError {
  constructor(message: string, context?: any) {
    super(message, 'USER_ERROR', context);
    this.name = 'UserError';
  }
} 