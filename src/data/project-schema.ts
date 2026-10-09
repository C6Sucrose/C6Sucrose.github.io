import { z } from 'astro/zod';

export const projectSchema = z.object({
  title: z.string(), summary: z.string(), number: z.number().int().min(1).max(7),
  category: z.enum(['agents', 'vision', 'tooling']),
  depth: z.enum(['full', 'compact']), visibility: z.enum(['public', 'private']),
  repo: z.url(), revision: z.string().regex(/^[a-f0-9]{40}$/),
  branch: z.enum(['main', 'master']).default('main'),
  reviewed: z.string(), status: z.string(), stack: z.array(z.string()),
  highlight: z.string(), highlightLabel: z.string(),
  review: z.array(z.object({ path: z.string(), note: z.string() })),
  runs: z.array(z.object({ label: z.string(), requirements: z.string(), commands: z.string(), note: z.string() })),
  evidence: z.array(z.object({ label: z.string(), url: z.url(), note: z.string() })),
});

export type Run = z.infer<typeof projectSchema>['runs'][number];
