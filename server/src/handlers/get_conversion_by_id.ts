
import { db } from '../db';
import { conversionRequestsTable, conversionResultsTable, errorLogsTable } from '../db/schema';
import { type ConversionResponse } from '../schema';
import { eq } from 'drizzle-orm';

export const getConversionById = async (id: number): Promise<ConversionResponse> => {
  try {
    // Get the conversion request
    const requests = await db.select()
      .from(conversionRequestsTable)
      .where(eq(conversionRequestsTable.id, id))
      .execute();

    if (requests.length === 0) {
      throw new Error(`Conversion request with id ${id} not found`);
    }

    const request = requests[0];

    // Get the conversion results for this request
    const results = await db.select()
      .from(conversionResultsTable)
      .where(eq(conversionResultsTable.request_id, id))
      .execute();

    // Get the error logs for this request
    const errors = await db.select()
      .from(errorLogsTable)
      .where(eq(errorLogsTable.request_id, id))
      .execute();

    // Parse JSON arrays from text fields and transform data
    return {
      request: {
        ...request,
        target_languages: JSON.parse(request.target_languages)
      },
      results: results.map(result => ({
        ...result,
        language: result.language as any // Type assertion since it can be programming language or 'mermaid'
      })),
      errors: errors.map(error => ({
        ...error,
        fix_suggestions: JSON.parse(error.fix_suggestions),
        avoid_suggestions: JSON.parse(error.avoid_suggestions)
      }))
    };
  } catch (error) {
    console.error('Get conversion by id failed:', error);
    throw error;
  }
};
