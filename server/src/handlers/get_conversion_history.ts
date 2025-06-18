
import { db } from '../db';
import { conversionRequestsTable } from '../db/schema';
import { type GetConversionHistoryInput, type ConversionRequest } from '../schema';
import { eq, desc } from 'drizzle-orm';

export const getConversionHistory = async (input: GetConversionHistoryInput): Promise<ConversionRequest[]> => {
  try {
    // Build query with user filter
    let query = db.select()
      .from(conversionRequestsTable)
      .where(eq(conversionRequestsTable.user_id, input.user_id))
      .orderBy(desc(conversionRequestsTable.created_at))
      .limit(input.limit)
      .offset(input.offset);

    const results = await query.execute();

    // Parse JSON fields and return properly typed results
    return results.map(result => ({
      ...result,
      target_languages: JSON.parse(result.target_languages),
      created_at: result.created_at,
      updated_at: result.updated_at
    }));
  } catch (error) {
    console.error('Get conversion history failed:', error);
    throw error;
  }
};
