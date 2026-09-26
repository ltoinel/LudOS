import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // text: console · json-summary: README badges · cobertura: Azure DevOps
      reporter: ['text', 'json-summary', 'cobertura'],
      // The pure, unit-testable logic. DOM / WebGPU / network glue (the shell
      // UI, windows, the LLM engine, the HTTP server) is exercised in the
      // browser instead, and the commands' own code runs via AsyncFunction,
      // which v8 coverage cannot attribute to the .md files.
      include: ['src/lib/**/*.ts', 'server/**/*.ts'],
      exclude: [
        'src/lib/terminal.ts',
        'src/lib/windows.ts',
        'src/lib/llm.ts',
        'src/lib/themes.ts',
        'src/lib/wallpapers.ts',
        'src/lib/workers.ts',
        'src/lib/content.ts',
        'src/lib/shell-ctx.ts',
        'server/msg-server.ts',
      ],
    },
  },
});
