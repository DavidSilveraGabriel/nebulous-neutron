// src/content.config.ts
import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

const postsCollection = defineCollection({
    type: 'content',
    schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    description: z.string(),
    author: z.string(),
    image: z.object({
        url: z.string(),
        alt: z.string()
    }),
    tags: z.array(z.string()),
    category: z.enum(['tutorial', 'case-study', 'technical', 'blog']).optional(),
    readingTime: z.number().optional(), // en minutos
    featured: z.boolean().optional(),
    draft: z.boolean().optional()
    })
});


export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  blog: postsCollection, // Agrega esta línea
};