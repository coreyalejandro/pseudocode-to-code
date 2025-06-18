
import { type VoiceCommandInput } from '../schema';

export declare function processVoiceCommand(input: VoiceCommandInput): Promise<{ success: boolean; message: string; data?: any }>;
