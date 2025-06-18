import { z } from 'zod';

// Enums for supported languages and output types
export const supportedLanguages = ['pseudocode', 'python', 'javascript', 'java', 'csharp', 'cpp', 'go', 'rust'] as const;
export const outputTypes = ['code', 'flowchart'] as const;
export const accessibilityModes = ['standard', 'high_contrast', 'large_text', 'simplified'] as const;
export const voiceCommands = ['convert', 'clear', 'copy', 'accessibility_toggle', 'language_select'] as const;

// Conversion request schema
export const conversionRequestSchema = z.object({
  id: z.number(),
  pseudocode: z.string(),
  target_languages: z.array(z.enum(supportedLanguages)),
  include_flowchart: z.boolean(),
  user_id: z.string().nullable(),
  accessibility_mode: z.enum(accessibilityModes),
  voice_enabled: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type ConversionRequest = z.infer<typeof conversionRequestSchema>;

// Conversion result schema
export const conversionResultSchema = z.object({
  id: z.number(),
  request_id: z.number(),
  language: z.enum([...supportedLanguages, 'mermaid']),
  output_type: z.enum(outputTypes),
  generated_code: z.string(),
  execution_time_ms: z.number(),
  success: z.boolean(),
  error_message: z.string().nullable(),
  created_at: z.coerce.date()
});

export type ConversionResult = z.infer<typeof conversionResultSchema>;

// Error log schema for neuro-aware error handling
export const errorLogSchema = z.object({
  id: z.number(),
  request_id: z.number().nullable(),
  error_type: z.string(),
  error_message: z.string(),
  user_friendly_message: z.string(),
  fix_suggestions: z.array(z.string()),
  avoid_suggestions: z.array(z.string()),
  visual_indicators: z.string().nullable(),
  audio_feedback: z.string().nullable(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  created_at: z.coerce.date()
});

export type ErrorLog = z.infer<typeof errorLogSchema>;

// User settings schema
export const userSettingsSchema = z.object({
  id: z.number(),
  user_id: z.string(),
  accessibility_mode: z.enum(accessibilityModes),
  voice_enabled: z.boolean(),
  preferred_languages: z.array(z.enum(supportedLanguages)),
  font_size: z.number().int().min(12).max(24),
  high_contrast: z.boolean(),
  audio_feedback: z.boolean(),
  error_verbosity: z.enum(['minimal', 'standard', 'detailed']),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

// Input schemas for API operations
export const createConversionRequestInputSchema = z.object({
  pseudocode: z.string().min(1, "Pseudocode cannot be empty"),
  target_languages: z.array(z.enum(supportedLanguages)).min(1, "At least one target language must be selected"),
  include_flowchart: z.boolean().default(false),
  user_id: z.string().nullable().optional(),
  accessibility_mode: z.enum(accessibilityModes).default('standard'),
  voice_enabled: z.boolean().default(false)
});

export type CreateConversionRequestInput = z.infer<typeof createConversionRequestInputSchema>;

export const updateUserSettingsInputSchema = z.object({
  user_id: z.string(),
  accessibility_mode: z.enum(accessibilityModes).optional(),
  voice_enabled: z.boolean().optional(),
  preferred_languages: z.array(z.enum(supportedLanguages)).optional(),
  font_size: z.number().int().min(12).max(24).optional(),
  high_contrast: z.boolean().optional(),
  audio_feedback: z.boolean().optional(),
  error_verbosity: z.enum(['minimal', 'standard', 'detailed']).optional()
});

export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsInputSchema>;

export const voiceCommandInputSchema = z.object({
  command: z.enum(voiceCommands),
  parameters: z.record(z.any()).optional(),
  user_id: z.string().nullable().optional()
});

export type VoiceCommandInput = z.infer<typeof voiceCommandInputSchema>;

export const getConversionHistoryInputSchema = z.object({
  user_id: z.string(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0)
});

export type GetConversionHistoryInput = z.infer<typeof getConversionHistoryInputSchema>;

// Response schemas
export const conversionResponseSchema = z.object({
  request: conversionRequestSchema,
  results: z.array(conversionResultSchema),
  errors: z.array(errorLogSchema)
});

export type ConversionResponse = z.infer<typeof conversionResponseSchema>;