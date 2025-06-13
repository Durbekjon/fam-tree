import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { StateService } from './state.service';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [
    ConfigModule,
    ServicesModule,
  ],
  providers: [
    TelegramService,
    StateService,
  ],
  exports: [TelegramService],
})
export class TelegramModule {} 