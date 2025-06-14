import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddCommandHandler } from './services/add-command-handler.service';
import { StateService } from './state.service';
import { StartCommandHandler } from './services/start-command-handler.service';
import { SettingsHandler } from './services/settings-handler.service';
import { AccessibilityService } from './services/accessibility.service';
import { UserPreferencesService } from './services/user-preferences.service';
import { ErrorHandlerService } from './services/error-handler.service';
import { UIService } from './services/ui.service';
import { TreeVisualizationService } from 'src/services/tree-visualization.service';
import { PdfExportService } from 'src/services/pdf-export.service';
import { TreeMergeService } from 'src/services/tree-merge.service';
import { InviteService } from 'src/services/invite.service';
import { CommandHandlerFactory } from './services/command-handler-factory.service';

@Module({
  providers: [
    TelegramService,
    PrismaService,
    AddCommandHandler,
    StateService,
    StartCommandHandler,
    SettingsHandler,
    AccessibilityService,
    UserPreferencesService,
    PdfExportService,
    TreeMergeService,
    InviteService,
    CommandHandlerFactory,
    TreeVisualizationService,
    ErrorHandlerService,
    UIService,
  ],
  exports: [TelegramService],
})
export class TelegramModule {} 