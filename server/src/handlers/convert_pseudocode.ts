
import { db } from '../db';
import { conversionRequestsTable, conversionResultsTable, errorLogsTable } from '../db/schema';
import { type CreateConversionRequestInput, type ConversionResponse, type ConversionResult, supportedLanguages } from '../schema';

// Mock conversion functions for demonstration
const convertToLanguage = async (pseudocode: string, language: string): Promise<{ code: string; executionTime: number }> => {
  const startTime = Date.now();
  
  // Simple mock conversion - in reality this would use AI/ML models
  let code = '';
  switch (language) {
    case 'python':
      code = `# Converted from pseudocode\n${pseudocode.split('\n').map(line => `# ${line}`).join('\n')}`;
      break;
    case 'javascript':
      code = `// Converted from pseudocode\n${pseudocode.split('\n').map(line => `// ${line}`).join('\n')}`;
      break;
    case 'java':
      code = `/* Converted from pseudocode\n${pseudocode}\n*/`;
      break;
    default:
      code = `// Converted from pseudocode\n${pseudocode}`;
  }
  
  const executionTime = Date.now() - startTime;
  return { code, executionTime };
};

const generateFlowchart = async (pseudocode: string): Promise<{ code: string; executionTime: number }> => {
  const startTime = Date.now();
  
  // Simple mermaid flowchart generation
  const code = `graph TD
    A[Start] --> B[${pseudocode.substring(0, 30)}...]
    B --> C[End]`;
  
  const executionTime = Date.now() - startTime;
  return { code, executionTime };
};

export const convertPseudocode = async (input: CreateConversionRequestInput): Promise<ConversionResponse> => {
  try {
    // Create conversion request
    const requestResult = await db.insert(conversionRequestsTable)
      .values({
        pseudocode: input.pseudocode,
        target_languages: JSON.stringify(input.target_languages),
        include_flowchart: input.include_flowchart,
        user_id: input.user_id || null,
        accessibility_mode: input.accessibility_mode,
        voice_enabled: input.voice_enabled,
        updated_at: new Date()
      })
      .returning()
      .execute();

    const request = requestResult[0];
    const results: ConversionResult[] = [];
    const errors = [];

    // Convert to each target language
    for (const language of input.target_languages) {
      try {
        const { code, executionTime } = await convertToLanguage(input.pseudocode, language);
        
        const resultData = await db.insert(conversionResultsTable)
          .values({
            request_id: request.id,
            language: language,
            output_type: 'code',
            generated_code: code,
            execution_time_ms: executionTime,
            success: true,
            error_message: null
          })
          .returning()
          .execute();

        results.push(resultData[0] as ConversionResult);
      } catch (error) {
        // Log conversion error
        const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
        
        const errorData = await db.insert(errorLogsTable)
          .values({
            request_id: request.id,
            error_type: 'conversion_error',
            error_message: errorMessage,
            user_friendly_message: `Failed to convert pseudocode to ${language}`,
            fix_suggestions: JSON.stringify([
              'Check pseudocode syntax',
              'Try a different target language',
              'Simplify the pseudocode'
            ]),
            avoid_suggestions: JSON.stringify([
              'Do not use language-specific syntax in pseudocode',
              'Avoid overly complex nested structures'
            ]),
            visual_indicators: 'error-highlight',
            audio_feedback: 'conversion-failed',
            severity: 'medium'
          })
          .returning()
          .execute();

        errors.push(errorData[0]);

        // Still create a failed result record
        const failedResult = await db.insert(conversionResultsTable)
          .values({
            request_id: request.id,
            language: language,
            output_type: 'code',
            generated_code: '',
            execution_time_ms: 0,
            success: false,
            error_message: errorMessage
          })
          .returning()
          .execute();

        results.push(failedResult[0] as ConversionResult);
      }
    }

    // Generate flowchart if requested
    if (input.include_flowchart) {
      try {
        const { code, executionTime } = await generateFlowchart(input.pseudocode);
        
        const flowchartResult = await db.insert(conversionResultsTable)
          .values({
            request_id: request.id,
            language: 'mermaid',
            output_type: 'flowchart',
            generated_code: code,
            execution_time_ms: executionTime,
            success: true,
            error_message: null
          })
          .returning()
          .execute();

        results.push(flowchartResult[0] as ConversionResult);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown flowchart error';
        
        const errorData = await db.insert(errorLogsTable)
          .values({
            request_id: request.id,
            error_type: 'flowchart_error',
            error_message: errorMessage,
            user_friendly_message: 'Failed to generate flowchart',
            fix_suggestions: JSON.stringify([
              'Simplify the pseudocode structure',
              'Use more descriptive step names'
            ]),
            avoid_suggestions: JSON.stringify([
              'Avoid overly complex branching logic'
            ]),
            visual_indicators: 'flowchart-error',
            audio_feedback: 'flowchart-failed',
            severity: 'low'
          })
          .returning()
          .execute();

        errors.push(errorData[0]);
      }
    }

    // Parse JSON fields and return response
    return {
      request: {
        ...request,
        target_languages: JSON.parse(request.target_languages)
      },
      results: results,
      errors: errors.map(error => ({
        ...error,
        fix_suggestions: JSON.parse(error.fix_suggestions),
        avoid_suggestions: JSON.parse(error.avoid_suggestions)
      }))
    };
  } catch (error) {
    console.error('Pseudocode conversion failed:', error);
    throw error;
  }
};
