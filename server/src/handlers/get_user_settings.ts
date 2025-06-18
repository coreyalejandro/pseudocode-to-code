
import { db } from '../db';
import { userSettingsTable } from '../db/schema';
import { type UserSettings } from '../schema';
import { eq } from 'drizzle-orm';

export const getUserSettings = async (userId: string): Promise<UserSettings> => {
  try {
    let result = await db.select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.user_id, userId))
      .execute();

    if (result.length === 0) {
      try {
        // Create default settings for new user
        const defaultSettings = await db.insert(userSettingsTable)
          .values({
            user_id: userId,
            accessibility_mode: 'standard',
            voice_enabled: false,
            preferred_languages: JSON.stringify(['python']),
            font_size: 16,
            high_contrast: false,
            audio_feedback: false,
            error_verbosity: 'standard',
            updated_at: new Date()
          })
          .returning()
          .execute();

        result = defaultSettings;
      } catch (insertError) {
        // If insertion fails due to race condition, try to select again
        result = await db.select()
          .from(userSettingsTable)
          .where(eq(userSettingsTable.user_id, userId))
          .execute();
          
        if (result.length === 0) {
          throw insertError;
        }
      }
    }

    const settings = result[0];
    
    return {
      ...settings,
      preferred_languages: JSON.parse(settings.preferred_languages)
    };
  } catch (error) {
    console.error('Get user settings failed:', error);
    throw error;
  }
};
