import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface UserPreferences {
  fontSize: 'small' | 'large';
  voiceEnabled: boolean;
  highContrast: boolean;
  autoSave: boolean;
  notifications: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  fontSize: 'small',
  voiceEnabled: false,
  highContrast: false,
  autoSave: true,
  notifications: true
};

@Injectable()
export class UserPreferencesService {
  private readonly logger = new Logger(UserPreferencesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUserPreferences(telegramId: string): Promise<UserPreferences> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { telegramId }
      });

      if (!user || !user.settings) {
        return DEFAULT_PREFERENCES;
      }

      const settings = JSON.parse(user.settings);
      return {
        ...DEFAULT_PREFERENCES,
        ...settings
      };
    } catch (error) {
      this.logger.error(`Error getting user preferences: ${error.message}`, error.stack);
      return DEFAULT_PREFERENCES;
    }
  }

  async updateUserPreferences(telegramId: string, preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    try {
      const currentPreferences = await this.getUserPreferences(telegramId);
      const updatedPreferences = {
        ...currentPreferences,
        ...preferences
      };

      await this.prisma.user.update({
        where: { telegramId },
        data: {
          settings: JSON.stringify(updatedPreferences)
        }
      });

      return updatedPreferences;
    } catch (error) {
      this.logger.error(`Error updating user preferences: ${error.message}`, error.stack);
      throw error;
    }
  }

  async toggleVoice(telegramId: string): Promise<UserPreferences> {
    const preferences = await this.getUserPreferences(telegramId);
    return this.updateUserPreferences(telegramId, {
      voiceEnabled: !preferences.voiceEnabled
    });
  }

  async toggleHighContrast(telegramId: string): Promise<UserPreferences> {
    const preferences = await this.getUserPreferences(telegramId);
    return this.updateUserPreferences(telegramId, {
      highContrast: !preferences.highContrast
    });
  }

  async toggleAutoSave(telegramId: string): Promise<UserPreferences> {
    const preferences = await this.getUserPreferences(telegramId);
    return this.updateUserPreferences(telegramId, {
      autoSave: !preferences.autoSave
    });
  }

  async toggleNotifications(telegramId: string): Promise<UserPreferences> {
    const preferences = await this.getUserPreferences(telegramId);
    return this.updateUserPreferences(telegramId, {
      notifications: !preferences.notifications
    });
  }

  async setFontSize(telegramId: string, size: 'small' | 'large'): Promise<UserPreferences> {
    return this.updateUserPreferences(telegramId, { fontSize: size });
  }
} 