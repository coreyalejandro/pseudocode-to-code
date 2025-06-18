
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { conversionRequestsTable } from '../db/schema';
import { type GetConversionHistoryInput } from '../schema';
import { getConversionHistory } from '../handlers/get_conversion_history';

// Test input
const testInput: GetConversionHistoryInput = {
  user_id: 'test-user-123',
  limit: 20,
  offset: 0
};

// Helper function to add delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('getConversionHistory', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return conversion history for user', async () => {
    // Create first test conversion request
    await db.insert(conversionRequestsTable).values({
      pseudocode: 'if x > 0 then print "positive"',
      target_languages: JSON.stringify(['python', 'javascript']),
      include_flowchart: false,
      user_id: 'test-user-123',
      accessibility_mode: 'standard',
      voice_enabled: false
    }).execute();

    // Add small delay to ensure different timestamps
    await delay(10);

    // Create second test conversion request (should be more recent)
    await db.insert(conversionRequestsTable).values({
      pseudocode: 'for i from 1 to 10 do print i',
      target_languages: JSON.stringify(['java', 'cpp']),
      include_flowchart: true,
      user_id: 'test-user-123',
      accessibility_mode: 'high_contrast',
      voice_enabled: true
    }).execute();

    const result = await getConversionHistory(testInput);

    expect(result).toHaveLength(2);
    
    // Check first result (should be most recent due to ordering)
    expect(result[0].pseudocode).toEqual('for i from 1 to 10 do print i');
    expect(result[0].target_languages).toEqual(['java', 'cpp']);
    expect(result[0].include_flowchart).toBe(true);
    expect(result[0].user_id).toEqual('test-user-123');
    expect(result[0].accessibility_mode).toEqual('high_contrast');
    expect(result[0].voice_enabled).toBe(true);
    expect(result[0].id).toBeDefined();
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].updated_at).toBeInstanceOf(Date);

    // Check second result
    expect(result[1].pseudocode).toEqual('if x > 0 then print "positive"');
    expect(result[1].target_languages).toEqual(['python', 'javascript']);
    expect(result[1].include_flowchart).toBe(false);
    expect(result[1].accessibility_mode).toEqual('standard');
    expect(result[1].voice_enabled).toBe(false);
  });

  it('should return empty array for user with no history', async () => {
    const result = await getConversionHistory({
      user_id: 'nonexistent-user',
      limit: 20,
      offset: 0
    });

    expect(result).toHaveLength(0);
  });

  it('should respect limit parameter', async () => {
    // Create 5 test conversion requests
    for (let i = 0; i < 5; i++) {
      await db.insert(conversionRequestsTable).values({
        pseudocode: `test pseudocode ${i}`,
        target_languages: JSON.stringify(['python']),
        include_flowchart: false,
        user_id: 'test-user-123',
        accessibility_mode: 'standard',
        voice_enabled: false
      }).execute();
      
      // Small delay to ensure different timestamps
      if (i < 4) await delay(5);
    }

    const result = await getConversionHistory({
      user_id: 'test-user-123',
      limit: 3,
      offset: 0
    });

    expect(result).toHaveLength(3);
  });

  it('should respect offset parameter for pagination', async () => {
    // Create first request
    await db.insert(conversionRequestsTable).values({
      pseudocode: 'first request',
      target_languages: JSON.stringify(['python']),
      include_flowchart: false,
      user_id: 'test-user-123',
      accessibility_mode: 'standard',
      voice_enabled: false
    }).execute();

    // Add delay to ensure different timestamps
    await delay(10);

    // Create second request (should be more recent)
    await db.insert(conversionRequestsTable).values({
      pseudocode: 'second request',
      target_languages: JSON.stringify(['javascript']),
      include_flowchart: false,
      user_id: 'test-user-123',
      accessibility_mode: 'standard',
      voice_enabled: false
    }).execute();

    // Get first page
    const firstPage = await getConversionHistory({
      user_id: 'test-user-123',
      limit: 1,
      offset: 0
    });

    // Get second page
    const secondPage = await getConversionHistory({
      user_id: 'test-user-123',
      limit: 1,
      offset: 1
    });

    expect(firstPage).toHaveLength(1);
    expect(secondPage).toHaveLength(1);
    expect(firstPage[0].id).not.toEqual(secondPage[0].id);
    
    // Should be ordered by created_at DESC, so first page should have more recent request
    expect(firstPage[0].pseudocode).toEqual('second request');
    expect(secondPage[0].pseudocode).toEqual('first request');
  });

  it('should only return requests for specified user', async () => {
    // Create requests for different users
    await db.insert(conversionRequestsTable).values([
      {
        pseudocode: 'user 1 request',
        target_languages: JSON.stringify(['python']),
        include_flowchart: false,
        user_id: 'user-1',
        accessibility_mode: 'standard',
        voice_enabled: false
      },
      {
        pseudocode: 'user 2 request',
        target_languages: JSON.stringify(['javascript']),
        include_flowchart: false,
        user_id: 'user-2',
        accessibility_mode: 'standard',
        voice_enabled: false
      }
    ]).execute();

    const result = await getConversionHistory({
      user_id: 'user-1',
      limit: 20,
      offset: 0
    });

    expect(result).toHaveLength(1);
    expect(result[0].pseudocode).toEqual('user 1 request');
    expect(result[0].user_id).toEqual('user-1');
  });
});
