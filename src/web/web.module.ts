import { Module } from '@nestjs/common';
import { WebController } from './web.controller';
import { TreeVisualizationService } from '../services/tree-visualization.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [WebController],
  providers: [TreeVisualizationService, PrismaService],
})
export class WebModule {} 