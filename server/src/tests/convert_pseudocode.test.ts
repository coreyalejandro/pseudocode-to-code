
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
    expect(pythonResult!.generated_code).toContain('# Generated Python code from pseudocode');
    expect(pythonResult!.generated_code).toContain('x = 10');
    expect(pythonResult!.generated_code).toContain('print(x)');
    expect(pythonResult!.success).toBe(true);
    expect(pythonResult!.execution_time_ms).toBeGreaterThanOrEqual(1);

    const jsResult = result.results.find(r => r.language === 'javascript');
    expect(jsResult).toBeDefined();
    expect(jsResult!.output_type).toEqual('code');
    expect(jsResult!.generated_code).toContain('// Generated JavaScript code from pseudocode');
    expect(jsResult!.generated_code).toContain('let x = 10');
    expect(jsResult!.generated_code).toContain('console.log(x)');
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
    expect(result.results[0].generated_code).toContain('// Generated Java code from pseudocode');
    expect(result.results[0].generated_code).toContain('public class PseudocodeConverter');
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

  it('should handle complex pseudocode with control structures', async () => {
    const complexInput: CreateConversionRequestInput = {
      pseudocode: `START
        INPUT number
        IF number > 0 THEN
          PRINT "Positive"
        ELSE
          PRINT "Not positive"
        END IF
        FOR i FROM 1 TO 3
          PRINT i
        END FOR
        END`,
      target_languages: ['python'],
      include_flowchart: true,
      accessibility_mode: 'standard',
      voice_enabled: false
    };

    const result = await convertPseudocode(complexInput);

    expect(result.results).toHaveLength(2); // 1 language + 1 flowchart
    
    const pythonResult = result.results.find(r => r.language === 'python');
    expect(pythonResult).toBeDefined();
    expect(pythonResult!.generated_code).toContain('input("Enter number: ")');
    expect(pythonResult!.generated_code).toContain('if number > 0:');
    expect(pythonResult!.generated_code).toContain('else:');
    expect(pythonResult!.generated_code).toContain('for i in range(1, 3 + 1, 1):');
    expect(pythonResult!.success).toBe(true);

    const flowchartResult = result.results.find(r => r.language === 'mermaid');
    expect(flowchartResult).toBeDefined();
    expect(flowchartResult!.generated_code).toContain('graph TD');
    expect(flowchartResult!.generated_code).toContain('Input: number');
    expect(flowchartResult!.generated_code).toContain('number > 0');
    expect(flowchartResult!.success).toBe(true);
  });

  it('should handle parsing errors gracefully', async () => {
    const invalidInput: CreateConversionRequestInput = {
      pseudocode: 'this is not valid pseudocode',
      target_languages: ['python'],
      include_flowchart: false,
      accessibility_mode: 'standard',
      voice_enabled: false
    };

    const result = await convertPseudocode(invalidInput);

    expect(result.results).toHaveLength(1);
    
    // The Python result should now be successful with fallback code for invalid pseudocode
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].generated_code).toContain('Pseudocode conversion issues:');
    expect(result.results[0].generated_code).toContain('Simplified Python fallback');
    
    // Errors should be logged for the syntax issues
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].error_type).toEqual('pseudocode_syntax_error');
    expect(result.errors[0].user_friendly_message).toContain('Pseudocode issue');
  });
});
