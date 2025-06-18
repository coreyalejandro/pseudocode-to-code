
import { db } from '../db';
import { errorLogsTable } from '../db/schema';
import { type ErrorLog } from '../schema';
import { eq, desc } from 'drizzle-orm';

export const getErrorLogs = async (requestId?: number, limit: number = 50): Promise<ErrorLog[]> => {
  try {
    // Build the base query
    const baseQuery = db.select().from(errorLogsTable);

    // Apply filters and execute query
    const results = requestId !== undefined
      ? await baseQuery
          .where(eq(errorLogsTable.request_id, requestId))
          .orderBy(desc(errorLogsTable.created_at))
          .limit(limit)
          .execute()
      : await baseQuery
          .orderBy(desc(errorLogsTable.created_at))
          .limit(limit)
          .execute();

    // Parse JSON arrays and return ErrorLog objects
    return results.map(result => ({
      ...result,
      fix_suggestions: JSON.parse(result.fix_suggestions),
      avoid_suggestions: JSON.parse(result.avoid_suggestions)
    }));
  } catch (error) {
    console.error('Error logs retrieval failed:', error);
    throw error;
  }
};
