import { config } from 'dotenv';
config({ path: '.env' }); // Forzar la carga desde raíz

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';

// Verifica que las variables existen
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.GEMINI_API_KEY) {
  throw new Error('Faltan variables de entorno en el archivo .env');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function extractEmbeddings(content: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "embedding-001" });
    const { embedding } = await model.embedContent(content);
    return embedding.values;
  } catch (error) {
    console.error('Embedding error:', error);
    return null;
  }
}

export async function indexBlogPosts() {
  const blogDir = path.join(process.cwd(), 'src/content/blog');
  const files = fs.readdirSync(blogDir);

  for (const file of files) {
    console.log(`Procesando: ${file}`);
    try {
      const filePath = path.join(blogDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const embeddings = await extractEmbeddings(content);

      if (!embeddings) {
        console.log(`Saltando ${file} - Embeddings fallidos`);
        continue;
      }

      const { error } = await supabase
        .from('content_embeddings')
        .insert({
          file_name: file,
          content: content.substring(0, 10000), // Limitar contenido
          embeddings,
          metadata: {
            source: 'blog',
            created_at: new Date().toISOString()
          }
        });

      if (error) console.error(`Indexing error for ${file}:`, error);
      else console.log(`Indexed: ${file}`);

    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
    console.log(`✅ Indexado: ${file}`);
  }
}