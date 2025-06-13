import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TreeVisualizationService } from './tree-visualization.service';
import { PdfExportService } from './pdf-export.service';
import { TreeMergeService } from './tree-merge.service';
import { InviteService } from './invite.service';

@Module({
  providers: [
    PrismaService,
    TreeVisualizationService,
    PdfExportService,
    TreeMergeService,
    InviteService,
  ],
  exports: [
    PrismaService,
    TreeVisualizationService,
    PdfExportService,
    TreeMergeService,
    InviteService,
  ],
})
export class ServicesModule {} 