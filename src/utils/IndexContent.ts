import { config } from 'dotenv';
config({ path: '.env' });
import matter from 'gray-matter';
import { glob } from 'glob';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';

// Configuración ajustable
const CHUNK_CONFIG = {
  maxChunkSize: 8000,       // 8KB para chunks
  maxPayloadSize: 9800,     // 9.8KB para la API
  maxRetries: 3,
  concurrency: 5            // Procesamiento paralelo
};

// Validación de variables de entorno
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'GEMINI_API_KEY'];
console.log("Variables de entorno process.env:", process.env.SUPABASE_URL ); // <-- Añade esto
console.log("Variables de entorno process.env:", process.env.SUPABASE_KEY ); // <-- Añade esto



const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);
 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Función para dividir contenido grande
function splitLargeContent(text: string, maxByteSize: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  let currentSize = 0;

  const sentences = text.split(/(?<=\b[.!?])\s+/g);

  for (const sentence of sentences) {
    const sentenceSize = Buffer.byteLength(sentence, 'utf8');
    
    if (sentenceSize > maxByteSize) {
      for (let i = 0; i < sentence.length; i += maxByteSize) {
        chunks.push(sentence.slice(i, i + maxByteSize));
      }
    } else if (currentSize + sentenceSize > maxByteSize) {
      chunks.push(currentChunk);
      currentChunk = sentence;
      currentSize = sentenceSize;
    } else {
      currentChunk += sentence;
      currentSize += sentenceSize;
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

// Función principal de división
function splitContent(content: string): string[] {
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;

  const sections = content.split(/(\n#{1,6}\s+.*|\n\*\*\*+|\n-{3,})/g);

  for (const section of sections) {
    const sectionSize = Buffer.byteLength(section, 'utf8');

    if (sectionSize > CHUNK_CONFIG.maxChunkSize) {
      chunks.push(...splitLargeContent(section, CHUNK_CONFIG.maxChunkSize));
      continue;
    }

    if (currentSize + sectionSize > CHUNK_CONFIG.maxChunkSize) {
      chunks.push(currentChunk.join(''));
      currentChunk = [section];
      currentSize = sectionSize;
    } else {
      currentChunk.push(section);
      currentSize += sectionSize;
    }
  }

  if (currentChunk.length > 0) chunks.push(currentChunk.join(''));
  return chunks;
}

// Procesamiento de Markdown mejorado
async function parseMDContent(filePath: string) {
  try {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const { content, data: metadata } = matter(rawContent);

    const codeBlocks: string[] = [];
    const processedContent = content
      .replace(/```[\s\S]*?```/g, (match) => {
        codeBlocks.push(match);
        return `CODE_BLOCK_${codeBlocks.length - 1}`;
      })
      .replace(/(\r\n|\n|\r)/gm, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\sáéíóúñÁÉÍÓÚÑ\-_~!$&*+,;=:@%#?/\d()[\]'"{}⟨⟩<>«»“”‘’¿¡°–—§€®™•·.,]/gi, '');

    const finalContent = processedContent.replace(/CODE_BLOCK_(\d+)/g, (_, index) => 
      codeBlocks[parseInt(index)]
    );

    const requiredMetadata = ['title'];
    const missingMetadata = requiredMetadata.filter(field => !metadata[field]);
    if (missingMetadata.length > 0) {
      console.warn(`⚠️ Missing metadata in ${path.basename(filePath)}: ${missingMetadata.join(', ')}`);
    }

    return {
      content: finalContent.trim(),
      metadata: {
        ...metadata,
        original_length: content.length,
        code_blocks: codeBlocks.length,
        code_blocks_size: codeBlocks.reduce((acc, block) => acc + Buffer.byteLength(block, 'utf8'), 0),
        internal_links: (finalContent.match(/\[[^\]]+\]\([^)]+\)/g) || []).length
      }
    };
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error);
    return { content: '', metadata: {} };
  }
}

// Generación de embeddings con manejo de tamaño
async function safeExtractEmbeddings(content: string, filePath: string) {
  const payload = JSON.stringify({
    model: "text-embedding-004",
    content: content
  });
  
  const payloadSize = Buffer.byteLength(payload, 'utf8');
  
  if (payloadSize > CHUNK_CONFIG.maxPayloadSize) {
    console.warn(`🟡 Size exceeded: ${filePath} (${payloadSize} bytes)`);
    return null;
  }

  for (let attempt = 1; attempt <= CHUNK_CONFIG.maxRetries; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
      const result = await model.embedContent(content);
      return result.embedding.values;
    } catch (error: any) {
      if (attempt < CHUNK_CONFIG.maxRetries && error?.response?.status === 429) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⌛ Retry ${attempt} for ${filePath} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`🔴 Embedding error for ${filePath}:`, error.message);
        return null;
      }
    }
  }
  return null;
}

// Función para registrar errores en Supabase
async function logErrorToDB(filePath: string, error: any) {
  try {
    await supabase.from('indexing_errors').insert({
      file_path: filePath,
      error_message: error.message,
      timestamp: new Date().toISOString()
    });
  } catch (dbError) {
    console.error('❌ Failed to log error to DB:', dbError);
  }
}

// Función principal optimizada
export async function indexContent() {
  const contentDir = path.join(process.cwd(), 'src/content');
  
  try {
    const files = await glob('**/*.{md,mdx}', { 
      cwd: contentDir,
      ignore: ['**/node_modules/**', '**/drafts/**']
    });

    console.log(`📂 Found ${files.length} files to process`);

    for (const file of files) {
      const startTime = Date.now();
      const filePath = path.join(contentDir, file);
      
      try {
        const { content, metadata } = await parseMDContent(filePath);
        if (!content || content.length < 100) {
          console.warn(`⏩ Skipping empty/short file: ${file}`);
          continue;
        }

        const chunks = splitContent(content);
        console.log(`📑 ${file} split into ${chunks.length} chunks`);

        // Procesar chunks en paralelo con límite de concurrencia
        const chunkPromises = chunks.map(async (chunk, index) => {
          try {
            const embeddings = await safeExtractEmbeddings(chunk, filePath);
            if (!embeddings) return;

            const { error } = await supabase
              .from('content_embeddings')
              .upsert({
                file_path: `${file}#chunk${index + 1}`,
                content: chunk,
                embeddings,
                metadata: {
                  ...metadata,
                  source: 'content',
                  chunk: index + 1,
                  total_chunks: chunks.length,
                  updated_at: new Date().toISOString()
                }
              }, { onConflict: 'file_path' });

            if (error) throw error;
            console.log(`✅ Chunk ${index + 1}/${chunks.length} indexed`);
          } catch (chunkError) {
            console.error(`🔥 Error in chunk ${index + 1} of ${file}:`, chunkError);
            await logErrorToDB(filePath, chunkError);
          }
        });

        // Ejecutar en lotes para evitar rate limiting
        while (chunkPromises.length > 0) {
          const batch = chunkPromises.splice(0, CHUNK_CONFIG.concurrency);
          await Promise.all(batch);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Delay entre lotes
        }

        console.log(`⏱️  Processing time ${file}: ${(Date.now() - startTime)/1000}s`);
        
      } catch (error) {
        console.error(`🔥 Error processing ${file}:`, error);
        await logErrorToDB(filePath, error);
      }
    }
    
    console.log('🎉 Process completed');
    return true;

  } catch (error) {
    console.error('🚨 Critical process error:', error);
    return false;
  }
}

// Ejecutar el indexado
indexContent().then(success => {
  if (success) process.exit(0);
  else process.exit(1);
});