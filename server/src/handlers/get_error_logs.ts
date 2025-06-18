
import { type ErrorLog } from '../schema';

export declare function getErrorLogs(requestId?: number, limit?: number): Promise<ErrorLog[]>;
