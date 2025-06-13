import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TelegramModule } from './telegram/telegram.module';
import { TreeVisualizationService } from './services/tree-visualization.service';
import { PdfExportService } from './services/pdf-export.service';
import { ServicesModule } from './services/services.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    TelegramModule,
    ServicesModule,
  ],
  controllers: [AppController],
  providers: [AppService, TreeVisualizationService, PdfExportService],
})
export class AppModule {}
