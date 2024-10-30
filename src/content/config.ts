// Import utilities from `astro:content`
import { z, defineCollection } from "astro:content";
// Define a `type` and `schema` for each collection
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
      category: z.enum(['tutorial', 'case-study', 'technical', 'blog']),
      readingTime: z.number(), // en minutos
      featured: z.boolean().optional(),
      draft: z.boolean().optional()
    })
});

export const collections = {
  posts: postsCollection,
};