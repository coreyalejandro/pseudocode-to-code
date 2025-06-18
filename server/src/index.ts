
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  createConversionRequestInputSchema,
  getConversionHistoryInputSchema,
  updateUserSettingsInputSchema,
  voiceCommandInputSchema
} from './schema';

// Import handlers
import { convertPseudocode } from './handlers/convert_pseudocode';
import { getConversionHistory } from './handlers/get_conversion_history';
import { getUserSettings } from './handlers/get_user_settings';
import { updateUserSettings } from './handlers/update_user_settings';
import { processVoiceCommand } from './handlers/process_voice_command';
import { getConversionById } from './handlers/get_conversion_by_id';
import { getErrorLogs } from './handlers/get_error_logs';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Core conversion functionality
  convertPseudocode: publicProcedure
    .input(createConversionRequestInputSchema)
    .mutation(({ input }) => convertPseudocode(input)),

  getConversionById: publicProcedure
    .input(z.number())
    .query(({ input }) => getConversionById(input)),

  // User management
  getConversionHistory: publicProcedure
    .input(getConversionHistoryInputSchema)
    .query(({ input }) => getConversionHistory(input)),

  getUserSettings: publicProcedure
    .input(z.string())
    .query(({ input }) => getUserSettings(input)),

  updateUserSettings: publicProcedure
    .input(updateUserSettingsInputSchema)
    .mutation(({ input }) => updateUserSettings(input)),

  // Voice controls
  processVoiceCommand: publicProcedure
    .input(voiceCommandInputSchema)
    .mutation(({ input }) => processVoiceCommand(input)),

  // Error handling and monitoring
  getErrorLogs: publicProcedure
    .input(z.object({
      requestId: z.number().optional(),
      limit: z.number().int().positive().max(100).default(50)
    }))
    .query(({ input }) => getErrorLogs(input.requestId, input.limit)),

  // Utility endpoints
  getSupportedLanguages: publicProcedure
    .query(() => {
      return {
        languages: ['python', 'javascript', 'java', 'csharp', 'cpp', 'go', 'rust'],
        accessibilityModes: ['standard', 'high_contrast', 'large_text', 'simplified'],
        voiceCommands: ['convert', 'clear', 'copy', 'accessibility_toggle', 'language_select']
      };
    }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();
