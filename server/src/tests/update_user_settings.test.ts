
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { userSettingsTable } from '../db/schema';
import { type UpdateUserSettingsInput } from '../schema';
import { updateUserSettings } from '../handlers/update_user_settings';
import { eq } from 'drizzle-orm';

// Create initial user settings for testing
const createInitialSettings = async (userId: string) => {
  await db.insert(userSettingsTable)
    .values({
      user_id: userId,
      accessibility_mode: 'standard',
      voice_enabled: false,
      preferred_languages: JSON.stringify(['python', 'javascript']),
      font_size: 16,
      high_contrast: false,
      audio_feedback: false,
      error_verbosity: 'standard'
    })
    .execute();
};

describe('updateUserSettings', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should update user settings with all fields', async () => {
    const userId = 'test-user-123';
    await createInitialSettings(userId);

    const input: UpdateUserSettingsInput = {
      user_id: userId,
      accessibility_mode: 'high_contrast',
      voice_enabled: true,
      preferred_languages: ['java', 'cpp', 'go'],
      font_size: 20,
      high_contrast: true,
      audio_feedback: true,
      error_verbosity: 'detailed'
    };

    const result = await updateUserSettings(input);

    expect(result.user_id).toEqual(userId);
    expect(result.accessibility_mode).toEqual('high_contrast');
    expect(result.voice_enabled).toEqual(true);
    expect(result.preferred_languages).toEqual(['java', 'cpp', 'go']);
    expect(result.font_size).toEqual(20);
    expect(result.high_contrast).toEqual(true);
    expect(result.audio_feedback).toEqual(true);
    expect(result.error_verbosity).toEqual('detailed');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update only specified fields', async () => {
    const userId = 'test-user-456';
    await createInitialSettings(userId);

    const input: UpdateUserSettingsInput = {
      user_id: userId,
      font_size: 18,
      voice_enabled: true
    };

    const result = await updateUserSettings(input);

    // Updated fields
    expect(result.font_size).toEqual(18);
    expect(result.voice_enabled).toEqual(true);

    // Unchanged fields should retain original values
    expect(result.accessibility_mode).toEqual('standard');
    expect(result.preferred_languages).toEqual(['python', 'javascript']);
    expect(result.high_contrast).toEqual(false);
    expect(result.audio_feedback).toEqual(false);
    expect(result.error_verbosity).toEqual('standard');
  });

  it('should update settings in database', async () => {
    const userId = 'test-user-789';
    await createInitialSettings(userId);

    const input: UpdateUserSettingsInput = {
      user_id: userId,
      accessibility_mode: 'large_text',
      preferred_languages: ['rust', 'csharp']
    };

    await updateUserSettings(input);

    // Verify database was updated
    const settings = await db.select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.user_id, userId))
      .execute();

    expect(settings).toHaveLength(1);
    expect(settings[0].accessibility_mode).toEqual('large_text');
    expect(JSON.parse(settings[0].preferred_languages)).toEqual(['rust', 'csharp']);
    expect(settings[0].updated_at).toBeInstanceOf(Date);
  });

  it('should update timestamp when settings are modified', async () => {
    const userId = 'test-user-time';
    await createInitialSettings(userId);

    // Get original timestamp
    const originalSettings = await db.select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.user_id, userId))
      .execute();

    const originalTimestamp = originalSettings[0].updated_at;

    // Wait a small amount to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    const input: UpdateUserSettingsInput = {
      user_id: userId,
      font_size: 22
    };

    const result = await updateUserSettings(input);

    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at.getTime()).toBeGreaterThan(originalTimestamp.getTime());
  });

  it('should throw error for non-existent user', async () => {
    const input: UpdateUserSettingsInput = {
      user_id: 'non-existent-user',
      font_size: 18
    };

    await expect(updateUserSettings(input)).rejects.toThrow(/User settings not found/i);
  });

  it('should handle empty preferred languages array', async () => {
    const userId = 'test-user-empty';
    await createInitialSettings(userId);

    const input: UpdateUserSettingsInput = {
      user_id: userId,
      preferred_languages: []
    };

    const result = await updateUserSettings(input);

    expect(result.preferred_languages).toEqual([]);
  });
});
