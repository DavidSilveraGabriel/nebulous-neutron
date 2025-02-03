import { config } from 'dotenv';
config({ path: '.env' });
import matter from 'gray-matter';
import { glob } from 'glob';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';

// Validación mejorada de variables de entorno
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'GEMINI_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Faltan variables de entorno: ${missingVars.join(', ')}`);
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Mejora: Dividir contenido en chunks lógicos manteniendo contexto
function splitContent(content: string, maxByteSize = 9500): string[] {
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;

  // Conservar estructura básica de markdown
  const sections = content.split(/(\n#{1,6}\s+.*|\n\*\*\*+|\n-{3,})/g);
  
  for (const section of sections) {
    const sectionSize = Buffer.byteLength(section, 'utf8');
    
    if (currentSize + sectionSize > maxByteSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join(''));
      currentChunk = [];
      currentSize = 0;
    }
    
    currentChunk.push(section);
    currentSize += sectionSize;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(''));
  }

  return chunks;
}

// Mejora: Procesamiento mejorado de contenido MD/MDX
async function parseMDContent(filePath: string) {
  try {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const { content, data: metadata } = matter(rawContent);

    // Preservar bloques de código y URLs
    const codeBlocks: string[] = [];
    let processedContent = content
      // Extraer y guardar bloques de código
      .replace(/```[\s\S]*?```/g, (match) => {
        codeBlocks.push(match);
        return `CODE_BLOCK_${codeBlocks.length - 1}`;
      })
      // Limpiar contenido restante
      .replace(/(\r\n|\n|\r)/gm, ' ')
      .replace(/\s+/g, ' ')
      // Mantener más caracteres relevantes
      .replace(/[^\w\sáéíóúñÁÉÍÓÚÑ\-_~!$&*+,;=:@%#?/\d()[\]'"{}⟨⟩<>«»“”‘’¿¡°–—§€®™•·.,]/gi, '');

    // Reinsertar bloques de código preservados
    processedContent = processedContent.replace(/CODE_BLOCK_(\d+)/g, (_, index) => 
      codeBlocks[parseInt(index)].replace(/\n/g, ' ')
    );

    // Validar metadatos esenciales
    const requiredMetadata = ['title'];
    const missingMetadata = requiredMetadata.filter(field => !metadata[field]);
    if (missingMetadata.length > 0) {
      console.warn(`⚠️ Metadata faltante en ${path.basename(filePath)}: ${missingMetadata.join(', ')}`);
    }

    return {
      content: processedContent.trim(),
      metadata: {
        ...metadata,
        original_length: content.length,
        code_blocks: codeBlocks.length,
        internal_links: (processedContent.match(/\[[^\]]+\]\([^)]+\)/g) || []).length
      }
    };
  } catch (error) {
    console.error(`❌ Error procesando ${filePath}:`, error);
    return { content: '', metadata: {} };
  }
}

// Función de embeddings con reintentos
async function safeExtractEmbeddings(content: string, filePath: string, retries = 3) {
  const byteSize = Buffer.byteLength(content, 'utf8');
  
  if (byteSize > 9999) {
    console.warn(`🟡 Tamaño excedido: ${filePath} (${byteSize} bytes)`);
    return null;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
      const result = await model.embedContent(content);
      return result.embedding.values;
    } catch (error: any) {
      if (attempt < retries && error?.response?.status === 429) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⌛ Reintento ${attempt} para ${filePath} en ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  return null;
}

// Función principal mejorada
export async function indexContent() {
  const contentDir = path.join(process.cwd(), 'src/content');
  
  try {
    const files = await glob('**/*.{md,mdx}', { 
      cwd: contentDir,
      ignore: ['**/node_modules/**', '**/drafts/**']
    });

    console.log(`📂 Encontrados ${files.length} archivos para procesar`);

    for (const file of files) {
      const startTime = Date.now();
      const filePath = path.join(contentDir, file);
      
      try {
        const { content, metadata } = await parseMDContent(filePath);
        if (!content) {
          console.warn(`⏩ Saltando archivo vacío: ${file}`);
          continue;
        }

        const chunks = splitContent(content);
        console.log(`📑 ${file} dividido en ${chunks.length} chunks`);

        for (const [index, chunk] of chunks.entries()) {
          const embeddings = await safeExtractEmbeddings(chunk, filePath);
          
          if (!embeddings) {
            console.warn(`⏩ Saltando chunk ${index + 1} de ${file}`);
            continue;
          }

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
          console.log(`✅ Chunk ${index + 1}/${chunks.length} indexado`);
        }

        console.log(`⏱️  Tiempo procesamiento ${file}: ${(Date.now() - startTime)/1000}s`);
        
      } catch (error) {
        console.error(`🔥 Error procesando ${file}:`, error);
        // Opcional: Registrar error en base de datos
      }
    }
    
    console.log('🎉 Proceso completado');
    return true;

  } catch (error) {
    console.error('🚨 Error crítico en el proceso:', error);
    return false;
  }
}