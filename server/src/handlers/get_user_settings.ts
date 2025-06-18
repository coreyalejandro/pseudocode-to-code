
import { db } from '../db';
import { userSettingsTable } from '../db/schema';
import { type UserSettings } from '../schema';
import { eq } from 'drizzle-orm';

export const getUserSettings = async (userId: string): Promise<UserSettings> => {
  try {
    const result = await db.select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.user_id, userId))
      .execute();

    if (result.length === 0) {
      throw new Error(`User settings not found for user_id: ${userId}`);
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
