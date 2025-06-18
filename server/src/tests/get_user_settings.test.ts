
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { userSettingsTable } from '../db/schema';
import { getUserSettings } from '../handlers/get_user_settings';

describe('getUserSettings', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should retrieve user settings', async () => {
    // Create test user settings
    const testUserId = 'test-user-123';
    await db.insert(userSettingsTable)
      .values({
        user_id: testUserId,
        accessibility_mode: 'high_contrast',
        voice_enabled: true,
        preferred_languages: JSON.stringify(['python', 'javascript']),
        font_size: 18,
        high_contrast: true,
        audio_feedback: true,
        error_verbosity: 'detailed'
      })
      .execute();

    const result = await getUserSettings(testUserId);

    expect(result.user_id).toEqual(testUserId);
    expect(result.accessibility_mode).toEqual('high_contrast');
    expect(result.voice_enabled).toEqual(true);
    expect(result.preferred_languages).toEqual(['python', 'javascript']);
    expect(result.font_size).toEqual(18);
    expect(result.high_contrast).toEqual(true);
    expect(result.audio_feedback).toEqual(true);
    expect(result.error_verbosity).toEqual('detailed');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should handle default values correctly', async () => {
    // Create minimal user settings to test defaults
    const testUserId = 'test-user-defaults';
    await db.insert(userSettingsTable)
      .values({
        user_id: testUserId,
        preferred_languages: JSON.stringify(['python'])
      })
      .execute();

    const result = await getUserSettings(testUserId);

    expect(result.user_id).toEqual(testUserId);
    expect(result.accessibility_mode).toEqual('standard');
    expect(result.voice_enabled).toEqual(false);
    expect(result.preferred_languages).toEqual(['python']);
    expect(result.font_size).toEqual(16);
    expect(result.high_contrast).toEqual(false);
    expect(result.audio_feedback).toEqual(false);
    expect(result.error_verbosity).toEqual('standard');
  });

  it('should create default settings for non-existent user', async () => {
    const result = await getUserSettings('non-existent-user');
    
    expect(result.user_id).toEqual('non-existent-user');
    expect(result.accessibility_mode).toEqual('standard');
    expect(result.voice_enabled).toEqual(false);
    expect(result.preferred_languages).toEqual(['python']);
    expect(result.font_size).toEqual(16);
    expect(result.high_contrast).toEqual(false);
    expect(result.audio_feedback).toEqual(false);
    expect(result.error_verbosity).toEqual('standard');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should parse JSON preferred languages correctly', async () => {
    const testUserId = 'test-user-json';
    await db.insert(userSettingsTable)
      .values({
        user_id: testUserId,
        preferred_languages: JSON.stringify(['java', 'csharp', 'cpp'])
      })
      .execute();

    const result = await getUserSettings(testUserId);

    expect(Array.isArray(result.preferred_languages)).toBe(true);
    expect(result.preferred_languages).toEqual(['java', 'csharp', 'cpp']);
    expect(result.preferred_languages.length).toEqual(3);
  });
});
