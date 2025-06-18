
import { serial, text, pgTable, timestamp, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const supportedLanguageEnum = pgEnum('supported_language', [
  'python', 'javascript', 'java', 'csharp', 'cpp', 'go', 'rust'
]);

export const outputTypeEnum = pgEnum('output_type', ['code', 'flowchart']);

export const accessibilityModeEnum = pgEnum('accessibility_mode', [
  'standard', 'high_contrast', 'large_text', 'simplified'
]);

export const severityEnum = pgEnum('severity', ['low', 'medium', 'high', 'critical']);

export const errorVerbosityEnum = pgEnum('error_verbosity', ['minimal', 'standard', 'detailed']);

// Tables
export const conversionRequestsTable = pgTable('conversion_requests', {
  id: serial('id').primaryKey(),
  pseudocode: text('pseudocode').notNull(),
  target_languages: text('target_languages').notNull(), // JSON array as text
  include_flowchart: boolean('include_flowchart').notNull().default(false),
  user_id: text('user_id'),
  accessibility_mode: accessibilityModeEnum('accessibility_mode').notNull().default('standard'),
  voice_enabled: boolean('voice_enabled').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const conversionResultsTable = pgTable('conversion_results', {
  id: serial('id').primaryKey(),
  request_id: integer('request_id').notNull(),
  language: text('language').notNull(), // Can be programming language or 'mermaid'
  output_type: outputTypeEnum('output_type').notNull(),
  generated_code: text('generated_code').notNull(),
  execution_time_ms: integer('execution_time_ms').notNull(),
  success: boolean('success').notNull(),
  error_message: text('error_message'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const errorLogsTable = pgTable('error_logs', {
  id: serial('id').primaryKey(),
  request_id: integer('request_id'),
  error_type: text('error_type').notNull(),
  error_message: text('error_message').notNull(),
  user_friendly_message: text('user_friendly_message').notNull(),
  fix_suggestions: text('fix_suggestions').notNull(), // JSON array as text
  avoid_suggestions: text('avoid_suggestions').notNull(), // JSON array as text
  visual_indicators: text('visual_indicators'),
  audio_feedback: text('audio_feedback'),
  severity: severityEnum('severity').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const userSettingsTable = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  user_id: text('user_id').notNull().unique(),
  accessibility_mode: accessibilityModeEnum('accessibility_mode').notNull().default('standard'),
  voice_enabled: boolean('voice_enabled').notNull().default(false),
  preferred_languages: text('preferred_languages').notNull(), // JSON array as text
  font_size: integer('font_size').notNull().default(16),
  high_contrast: boolean('high_contrast').notNull().default(false),
  audio_feedback: boolean('audio_feedback').notNull().default(false),
  error_verbosity: errorVerbosityEnum('error_verbosity').notNull().default('standard'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const conversionRequestsRelations = relations(conversionRequestsTable, ({ many }) => ({
  results: many(conversionResultsTable),
  errors: many(errorLogsTable),
}));

export const conversionResultsRelations = relations(conversionResultsTable, ({ one }) => ({
  request: one(conversionRequestsTable, {
    fields: [conversionResultsTable.request_id],
    references: [conversionRequestsTable.id],
  }),
}));

export const errorLogsRelations = relations(errorLogsTable, ({ one }) => ({
  request: one(conversionRequestsTable, {
    fields: [errorLogsTable.request_id],
    references: [conversionRequestsTable.id],
  }),
}));

// Export all tables for relation queries
export const tables = {
  conversionRequests: conversionRequestsTable,
  conversionResults: conversionResultsTable,
  errorLogs: errorLogsTable,
  userSettings: userSettingsTable,
};
