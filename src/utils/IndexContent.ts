import { config } from 'dotenv';
config({ path: '.env' });
import matter from 'gray-matter';
import { glob } from 'glob';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';

// Validación de variables de entorno
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.GEMINI_API_KEY) {
  throw new Error('Faltan variables de entorno en el archivo .env');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Función para dividir contenido en chunks
function splitContent(content: string, maxChunkSize = 10000): string[] {
  const chunks = [];
  for (let i = 0; i < content.length; i += maxChunkSize) {
    chunks.push(content.substring(i, i + maxChunkSize));
  }
  return chunks;
}

// Función para procesar archivos MD/MDX
async function parseMDContent(filePath: string) {
  try {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const { content, data: metadata } = matter(rawContent);
    
    const optimizedContent = content
      .replace(/(\r\n|\n|\r)/gm, " ")
      .replace(/\s+/g, ' ')
      .replace(/[^\w\sáéíóúñÁÉÍÓÚÑ.,;:¿?¡!]/gi, '')
      .substring(0, 50000); // Aumentamos el límite inicial para chunking

    return { 
      content: optimizedContent,
      metadata: {
        ...metadata,
        original_length: content.length
      }
    };
  } catch (error) {
    console.error(`Error procesando ${filePath}:`, error);
    return { content: '', metadata: {} };
  }
}

// Función segura para extraer embeddings
async function safeExtractEmbeddings(content: string, filePath: string) {
  const byteSize = Buffer.byteLength(content, 'utf8');
  
  if (byteSize > 9500) {
    console.warn(`🟡 Archivo demasiado grande: ${filePath} (${byteSize} bytes)`);
    return null;
  }
  
  try {
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(content);
    return result.embedding.values;
  } catch (error) {
    console.error(`🔴 Error crítico en ${filePath}:`, error);
    return null;
  }
}

// Función principal de indexación
export async function indexContent() {
  const contentDir = path.join(process.cwd(), 'src/content');
  const files = glob.sync('**/*.{md,mdx}', { cwd: contentDir });
  
  for (const file of files) {
    try {
      const filePath = path.join(contentDir, file);
      console.log(`\nProcesando: ${file}`);

      const { content, metadata } = await parseMDContent(filePath);
      const chunks = splitContent(content);
      
      let chunkIndex = 1;
      for (const chunk of chunks) {
        const embeddings = await safeExtractEmbeddings(chunk, filePath);
        
        if (!embeddings) {
          console.log(`⚠️ Saltando chunk ${chunkIndex} de ${file}`);
          continue;
        }

        // Upsert en Supabase
        const { error } = await supabase
          .from('content_embeddings')
          .upsert({
            file_path: `${file}#chunk${chunkIndex}`,
            content: chunk,
            embeddings,
            metadata: {
              ...metadata,
              source: 'content',
              chunk: chunkIndex,
              total_chunks: chunks.length,
              updated_at: new Date().toISOString()
            }
          }, { onConflict: 'file_path' });

        if (error) {
          console.error(`❌ Error indexando chunk ${chunkIndex} de ${file}:`, error);
        } else {
          console.log(`✔️ Chunk ${chunkIndex}/${chunks.length} indexado`);
        }
        
        chunkIndex++;
      }

    } catch (error) {
      console.error(`🔥 Error procesando ${file}:`, error);
    }
  }
}