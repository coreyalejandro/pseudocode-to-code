
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { conversionRequestsTable, conversionResultsTable, errorLogsTable } from '../db/schema';
import { getConversionById } from '../handlers/get_conversion_by_id';

describe('getConversionById', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get conversion with all associated data', async () => {
    // Create a conversion request
    const requestResult = await db.insert(conversionRequestsTable)
      .values({
        pseudocode: 'test pseudocode',
        target_languages: JSON.stringify(['python', 'javascript']),
        include_flowchart: true,
        user_id: 'test-user',
        accessibility_mode: 'high_contrast',
        voice_enabled: true
      })
      .returning()
      .execute();

    const requestId = requestResult[0].id;

    // Create conversion results
    await db.insert(conversionResultsTable)
      .values([
        {
          request_id: requestId,
          language: 'python',
          output_type: 'code',
          generated_code: 'print("hello")',
          execution_time_ms: 150,
          success: true,
          error_message: null
        },
        {
          request_id: requestId,
          language: 'mermaid',
          output_type: 'flowchart',
          generated_code: 'graph TD\n  A[Start]',
          execution_time_ms: 200,
          success: true,
          error_message: null
        }
      ])
      .execute();

    // Create error logs
    await db.insert(errorLogsTable)
      .values({
        request_id: requestId,
        error_type: 'syntax_warning',
        error_message: 'Minor syntax issue',
        user_friendly_message: 'Small formatting improvement suggested',
        fix_suggestions: JSON.stringify(['Add semicolon', 'Check indentation']),
        avoid_suggestions: JSON.stringify(['Avoid complex nesting']),
        visual_indicators: 'yellow_highlight',
        audio_feedback: 'soft_beep',
        severity: 'low'
      })
      .execute();

    const result = await getConversionById(requestId);

    // Verify request data
    expect(result.request.id).toEqual(requestId);
    expect(result.request.pseudocode).toEqual('test pseudocode');
    expect(result.request.target_languages).toEqual(['python', 'javascript']);
    expect(result.request.include_flowchart).toBe(true);
    expect(result.request.user_id).toEqual('test-user');
    expect(result.request.accessibility_mode).toEqual('high_contrast');
    expect(result.request.voice_enabled).toBe(true);
    expect(result.request.created_at).toBeInstanceOf(Date);
    expect(result.request.updated_at).toBeInstanceOf(Date);

    // Verify results data
    expect(result.results).toHaveLength(2);
    
    const pythonResult = result.results.find(r => r.language === 'python');
    expect(pythonResult).toBeDefined();
    expect(pythonResult!.output_type).toEqual('code');
    expect(pythonResult!.generated_code).toEqual('print("hello")');
    expect(pythonResult!.execution_time_ms).toEqual(150);
    expect(pythonResult!.success).toBe(true);
    expect(pythonResult!.error_message).toBeNull();

    const flowchartResult = result.results.find(r => r.language === 'mermaid');
    expect(flowchartResult).toBeDefined();
    expect(flowchartResult!.output_type).toEqual('flowchart');
    expect(flowchartResult!.generated_code).toEqual('graph TD\n  A[Start]');

    // Verify error logs data
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error_type).toEqual('syntax_warning');
    expect(result.errors[0].error_message).toEqual('Minor syntax issue');
    expect(result.errors[0].user_friendly_message).toEqual('Small formatting improvement suggested');
    expect(result.errors[0].fix_suggestions).toEqual(['Add semicolon', 'Check indentation']);
    expect(result.errors[0].avoid_suggestions).toEqual(['Avoid complex nesting']);
    expect(result.errors[0].visual_indicators).toEqual('yellow_highlight');
    expect(result.errors[0].audio_feedback).toEqual('soft_beep');
    expect(result.errors[0].severity).toEqual('low');
  });

  it('should get conversion with minimal data', async () => {
    // Create a basic conversion request with minimal fields
    const requestResult = await db.insert(conversionRequestsTable)
      .values({
        pseudocode: 'basic test',
        target_languages: JSON.stringify(['python']),
        include_flowchart: false,
        user_id: null,
        accessibility_mode: 'standard',
        voice_enabled: false
      })
      .returning()
      .execute();

    const requestId = requestResult[0].id;

    const result = await getConversionById(requestId);

    // Should return empty arrays for results and errors
    expect(result.request.id).toEqual(requestId);
    expect(result.request.pseudocode).toEqual('basic test');
    expect(result.request.target_languages).toEqual(['python']);
    expect(result.request.user_id).toBeNull();
    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should throw error for non-existent conversion', async () => {
    const nonExistentId = 99999;

    expect(getConversionById(nonExistentId)).rejects.toThrow(/not found/i);
  });

  it('should handle conversion with only results', async () => {
    // Create request
    const requestResult = await db.insert(conversionRequestsTable)
      .values({
        pseudocode: 'test with results only',
        target_languages: JSON.stringify(['javascript']),
        include_flowchart: false,
        user_id: 'test-user-2',
        accessibility_mode: 'standard',
        voice_enabled: false
      })
      .returning()
      .execute();

    const requestId = requestResult[0].id;

    // Create only results, no errors
    await db.insert(conversionResultsTable)
      .values({
        request_id: requestId,
        language: 'javascript',
        output_type: 'code',
        generated_code: 'console.log("test")',
        execution_time_ms: 100,
        success: true,
        error_message: null
      })
      .execute();

    const result = await getConversionById(requestId);

    expect(result.request.id).toEqual(requestId);
    expect(result.results).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.results[0].language).toEqual('javascript');
    expect(result.results[0].generated_code).toEqual('console.log("test")');
  });
});
