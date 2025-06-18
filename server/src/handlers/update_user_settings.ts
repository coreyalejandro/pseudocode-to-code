
import { db } from '../db';
import { userSettingsTable } from '../db/schema';
import { type UpdateUserSettingsInput, type UserSettings } from '../schema';
import { eq } from 'drizzle-orm';

export const updateUserSettings = async (input: UpdateUserSettingsInput): Promise<UserSettings> => {
  try {
    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.accessibility_mode !== undefined) {
      updateData.accessibility_mode = input.accessibility_mode;
    }

    if (input.voice_enabled !== undefined) {
      updateData.voice_enabled = input.voice_enabled;
    }

    if (input.preferred_languages !== undefined) {
      updateData.preferred_languages = JSON.stringify(input.preferred_languages);
    }

    if (input.font_size !== undefined) {
      updateData.font_size = input.font_size;
    }

    if (input.high_contrast !== undefined) {
      updateData.high_contrast = input.high_contrast;
    }

    if (input.audio_feedback !== undefined) {
      updateData.audio_feedback = input.audio_feedback;
    }

    if (input.error_verbosity !== undefined) {
      updateData.error_verbosity = input.error_verbosity;
    }

    // Update user settings
    const result = await db.update(userSettingsTable)
      .set(updateData)
      .where(eq(userSettingsTable.user_id, input.user_id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`User settings not found for user_id: ${input.user_id}`);
    }

    // Parse JSON fields back to arrays
    const settings = result[0];
    return {
      ...settings,
      preferred_languages: JSON.parse(settings.preferred_languages)
    };
  } catch (error) {
    console.error('User settings update failed:', error);
    throw error;
  }
};
