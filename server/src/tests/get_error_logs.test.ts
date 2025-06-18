
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { errorLogsTable, conversionRequestsTable } from '../db/schema';
import { getErrorLogs } from '../handlers/get_error_logs';

// Test data
const testErrorLog1 = {
  error_type: 'syntax_error',
  error_message: 'Invalid syntax detected',
  user_friendly_message: 'Please check your pseudocode syntax',
  fix_suggestions: JSON.stringify(['Add missing semicolon', 'Check parentheses']),
  avoid_suggestions: JSON.stringify(['Avoid complex nesting', 'Keep statements simple']),
  visual_indicators: 'highlight_line_3',
  audio_feedback: 'syntax_error_sound',
  severity: 'medium' as const
};

const testErrorLog2 = {
  error_type: 'conversion_error',
  error_message: 'Failed to convert to target language',
  user_friendly_message: 'Conversion to Python failed',
  fix_suggestions: JSON.stringify(['Simplify logic', 'Break into smaller steps']),
  avoid_suggestions: JSON.stringify(['Avoid goto statements']),
  visual_indicators: null,
  audio_feedback: null,
  severity: 'high' as const
};

const testRequest = {
  pseudocode: 'BEGIN\nPRINT "Hello World"\nEND',
  target_languages: JSON.stringify(['python']),
  include_flowchart: false,
  accessibility_mode: 'standard' as const,
  voice_enabled: false
};

describe('getErrorLogs', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return all error logs when no request ID is provided', async () => {
    // Create test conversion request
    const [request] = await db.insert(conversionRequestsTable)
      .values(testRequest)
      .returning()
      .execute();

    // Create test error logs with separate inserts to ensure different timestamps
    await db.insert(errorLogsTable)
      .values({ ...testErrorLog1, request_id: request.id })
      .execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(errorLogsTable)
      .values({ ...testErrorLog2, request_id: request.id })
      .execute();

    const result = await getErrorLogs();

    expect(result).toHaveLength(2);
    expect(result[0].error_type).toEqual('conversion_error'); // Most recent first
    expect(result[0].fix_suggestions).toEqual(['Simplify logic', 'Break into smaller steps']);
    expect(result[0].avoid_suggestions).toEqual(['Avoid goto statements']);
    expect(result[1].error_type).toEqual('syntax_error');
    expect(result[1].fix_suggestions).toEqual(['Add missing semicolon', 'Check parentheses']);
  });

  it('should filter error logs by request ID', async () => {
    // Create two test conversion requests  
    const [request1] = await db.insert(conversionRequestsTable)
      .values(testRequest)
      .returning()
      .execute();

    const [request2] = await db.insert(conversionRequestsTable)
      .values(testRequest)
      .returning()
      .execute();

    // Create error logs for both requests
    await db.insert(errorLogsTable)
      .values([
        { ...testErrorLog1, request_id: request1.id },
        { ...testErrorLog2, request_id: request2.id }
      ])
      .execute();

    const result = await getErrorLogs(request1.id);

    expect(result).toHaveLength(1);
    expect(result[0].error_type).toEqual('syntax_error');
    expect(result[0].request_id).toEqual(request1.id);
  });

  it('should respect the limit parameter', async () => {
    // Create test conversion request
    const [request] = await db.insert(conversionRequestsTable)
      .values(testRequest)
      .returning()
      .execute();

    // Create multiple error logs
    const errorLogs = Array.from({ length: 5 }, (_, i) => ({
      ...testErrorLog1,
      request_id: request.id,
      error_type: `error_${i}`,
      error_message: `Error message ${i}`
    }));

    await db.insert(errorLogsTable)
      .values(errorLogs)
      .execute();

    const result = await getErrorLogs(undefined, 3);

    expect(result).toHaveLength(3);
  });

  it('should return error logs ordered by created_at descending', async () => {
    // Create test conversion request
    const [request] = await db.insert(conversionRequestsTable)
      .values(testRequest)
      .returning()
      .execute();

    // Create error logs with slight delay to ensure different timestamps
    await db.insert(errorLogsTable)
      .values({ ...testErrorLog1, request_id: request.id })
      .execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(errorLogsTable)
      .values({ ...testErrorLog2, request_id: request.id })
      .execute();

    const result = await getErrorLogs();

    expect(result).toHaveLength(2);
    expect(result[0].error_type).toEqual('conversion_error'); // Most recent first
    expect(result[1].error_type).toEqual('syntax_error'); // Older second
    expect(result[0].created_at >= result[1].created_at).toBe(true);
  });

  it('should return empty array when no error logs exist', async () => {
    const result = await getErrorLogs();

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return empty array when filtering by non-existent request ID', async () => {
    // Create test conversion request and error log
    const [request] = await db.insert(conversionRequestsTable)
      .values(testRequest)
      .returning()
      .execute();

    await db.insert(errorLogsTable)
      .values({ ...testErrorLog1, request_id: request.id })
      .execute();

    const result = await getErrorLogs(99999); // Non-existent request ID

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });
});
