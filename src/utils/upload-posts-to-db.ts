// scripts/upload-posts-to-db.ts
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export async function PostsToDb() {
    console.log("Iniciando subida de posts...");

    const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY!;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Error: Faltan variables de entorno");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const postsDirectory = path.join(process.cwd(), 'src/content', 'blog');

    try {
        const files = await fs.readdir(postsDirectory);
        const mdFiles = files.filter(file => path.extname(file).toLowerCase() === '.md');

        console.log(`Encontrados ${mdFiles.length} archivos MD`);

        for (const mdFile of mdFiles) {
            const filePath = path.join(postsDirectory, mdFile);
            console.log(`Procesando: '${mdFile}'`);
            
            try {
                const fileContents = await fs.readFile(filePath, 'utf8');
                
                // Extraer frontmatter con gray-matter
                const { data: frontmatter, content } = matter(fileContents);
                const slug = path.basename(mdFile, '.md');

                // Insertar en Supabase SIN procesar MDX
                const postData = {
                    slug: slug,
                    contenido: content,  // Contenido Markdown sin frontmatter
                    metadata: frontmatter  // Metadatos extraídos
                };

                const { data, error } = await supabase
                    .from('posts')
                    .insert([postData])
                    .select();

                if (error) {
                    console.error(`Error insertando ${mdFile}:`, error);
                } else {
                    console.log(`Post ${mdFile} insertado. ID: ${data?.[0]?.id}`);
                }
            } catch (error) {
                console.error(`Error procesando ${mdFile}:`, error);
            }
        }

        console.log("Proceso completado");
    } catch (error) {
        console.error("Error leyendo directorio:", error);
    }
}

//PostsToDb().catch(error => console.error("Error no manejado:", error));