import { Context } from 'telegraf';

export interface ICommandHandler {
  handle(ctx: Context): Promise<void>;
}

export interface ICommandHandlerFactory {
  createHandler(command: string): ICommandHandler;
} 