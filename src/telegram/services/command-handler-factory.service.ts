import { Injectable } from '@nestjs/common';
import { ICommandHandler, ICommandHandlerFactory } from '../interfaces/command-handler.interface';
import { StartCommandHandler } from './start-command-handler.service';
import { AddCommandHandler } from './add-command-handler.service';
import { ValidationError } from '../errors/telegram.errors';

@Injectable()
export class CommandHandlerFactory implements ICommandHandlerFactory {
  constructor(
    private readonly startCommandHandler: StartCommandHandler,
    private readonly addCommandHandler: AddCommandHandler,
  ) {}

  createHandler(command: string): ICommandHandler {
    switch (command) {
      case 'start':
        return this.startCommandHandler;
      case 'add':
        return this.addCommandHandler;
      default:
        throw new ValidationError(`Unknown command: ${command}`);
    }
  }
} 