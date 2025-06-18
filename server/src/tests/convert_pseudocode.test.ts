
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { conversionRequestsTable, conversionResultsTable, errorLogsTable } from '../db/schema';
import { type CreateConversionRequestInput } from '../schema';
import { convertPseudocode } from '../handlers/convert_pseudocode';
import { eq } from 'drizzle-orm';

const testInput: CreateConversionRequestInput = {
  pseudocode: 'BEGIN\n  SET x = 10\n  PRINT x\nEND',
  target_languages: ['python', 'javascript'],
  include_flowchart: false,
  user_id: 'test-user-123',
  accessibility_mode: 'standard',
  voice_enabled: false
};

describe('convertPseudocode', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create conversion request and results', async () => {
    const result = await convertPseudocode(testInput);

    // Check request was created
    expect(result.request.pseudocode).toEqual(testInput.pseudocode);
    expect(result.request.target_languages).toEqual(['python', 'javascript']);
    expect(result.request.include_flowchart).toBe(false);
    expect(result.request.user_id).toEqual('test-user-123');
    expect(result.request.accessibility_mode).toEqual('standard');
    expect(result.request.voice_enabled).toBe(false);
    expect(result.request.id).toBeDefined();
    expect(result.request.created_at).toBeInstanceOf(Date);
    expect(result.request.updated_at).toBeInstanceOf(Date);

    // Check results were created for each language
    expect(result.results).toHaveLength(2);
    
    const pythonResult = result.results.find(r => r.language === 'python');
    expect(pythonResult).toBeDefined();
    expect(pythonResult!.output_type).toEqual('code');
    expect(pythonResult!.generated_code).toContain('# Converted from pseudocode');
    expect(pythonResult!.success).toBe(true);
    expect(pythonResult!.execution_time_ms).toBeGreaterThan(0);

    const jsResult = result.results.find(r => r.language === 'javascript');
    expect(jsResult).toBeDefined();
    expect(jsResult!.output_type).toEqual('code');
    expect(jsResult!.generated_code).toContain('// Converted from pseudocode');
    expect(jsResult!.success).toBe(true);
  });

  it('should generate flowchart when requested', async () => {
    const inputWithFlowchart = {
      ...testInput,
      include_flowchart: true
    };

    const result = await convertPseudocode(inputWithFlowchart);

    expect(result.results).toHaveLength(3); // 2 languages + 1 flowchart
    
    const flowchartResult = result.results.find(r => r.language === 'mermaid');
    expect(flowchartResult).toBeDefined();
    expect(flowchartResult!.output_type).toEqual('flowchart');
    expect(flowchartResult!.generated_code).toContain('graph TD');
    expect(flowchartResult!.success).toBe(true);
  });

  it('should save data to database correctly', async () => {
    const result = await convertPseudocode(testInput);

    // Check request in database
    const requests = await db.select()
      .from(conversionRequestsTable)
      .where(eq(conversionRequestsTable.id, result.request.id))
      .execute();

    expect(requests).toHaveLength(1);
    expect(requests[0].pseudocode).toEqual(testInput.pseudocode);
    expect(JSON.parse(requests[0].target_languages)).toEqual(['python', 'javascript']);

    // Check results in database
    const results = await db.select()
      .from(conversionResultsTable)
      .where(eq(conversionResultsTable.request_id, result.request.id))
      .execute();

    expect(results).toHaveLength(2);
    expect(results.every(r => r.success)).toBe(true);
    expect(results.every(r => r.generated_code.length > 0)).toBe(true);
  });

  it('should handle missing optional fields', async () => {
    const minimalInput: CreateConversionRequestInput = {
      pseudocode: 'PRINT "Hello World"',
      target_languages: ['python'],
      include_flowchart: false,
      accessibility_mode: 'standard',
      voice_enabled: false
    };

    const result = await convertPseudocode(minimalInput);

    expect(result.request.user_id).toBeNull();
    expect(result.request.include_flowchart).toBe(false);
    expect(result.request.accessibility_mode).toEqual('standard');
    expect(result.request.voice_enabled).toBe(false);
    expect(result.results).toHaveLength(1);
  });

  it('should handle single language conversion', async () => {
    const singleLanguageInput: CreateConversionRequestInput = {
      ...testInput,
      target_languages: ['java']
    };

    const result = await convertPseudocode(singleLanguageInput);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].language).toEqual('java');
    expect(result.results[0].generated_code).toContain('/* Converted from pseudocode');
    expect(result.results[0].success).toBe(true);
  });

  it('should work with different accessibility modes', async () => {
    const accessibilityInput = {
      ...testInput,
      accessibility_mode: 'high_contrast' as const,
      voice_enabled: true
    };

    const result = await convertPseudocode(accessibilityInput);

    expect(result.request.accessibility_mode).toEqual('high_contrast');
    expect(result.request.voice_enabled).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  it('should handle empty errors array when no errors occur', async () => {
    const result = await convertPseudocode(testInput);

    expect(result.errors).toHaveLength(0);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
