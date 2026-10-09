import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { projectSchema } from './data/project-schema';

export const collections = {
  projects: defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/projects' }), schema: projectSchema }),
};
