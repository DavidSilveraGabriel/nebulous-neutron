// scripts/upload-posts-to-db.ts

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkFrontmatter from 'remark-frontmatter';
import * as yaml from 'js-yaml';
import {matter as matterPlugin} from 'vfile-matter';
import parse from 'js-yaml';
import { VFile } from 'vfile';
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' }); // Explicitly load .env.local file

export async function PostsToDb() {
    console.log("Script upload-posts-to-db.ts: Iniciando subida de posts a la base de datos Supabase...");

    const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Script upload-posts-to-db.ts: Error - Variables de entorno PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY no configuradas.");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const postsDirectory = path.join(process.cwd(), 'src/content', 'blog');

    console.log(`Script upload-posts-to-db.ts: Buscando archivos MD en la carpeta: '${postsDirectory}'`);

    try {
        const files = await fs.readdir(postsDirectory);
        const mdFiles = files.filter(file => path.extname(file).toLowerCase() === '.md');

        console.log(`Script upload-posts-to-db.ts: Encontrados ${mdFiles.length} archivos MD en la carpeta 'content/blog'.`);

        for (const mdFile of mdFiles) {
            const filePath = path.join(postsDirectory, mdFile);
            console.log(`Script upload-posts-to-db.ts: Procesando archivo: '${mdFile}'`);
            try {
                const fileContents = await fs.readFile(filePath, 'utf8');
                const matterResult = matter(fileContents);

                let content = "", frontmatter = {};

                if (matterResult) {
                    content = matterResult.content;
                    frontmatter = matterResult.data;
                }


                const slug = path.basename(mdFile, '.md');

                const processedMdx = await unified()
                    .use(remarkParse)
                    .use(remarkMdx)
                    .use(remarkFrontmatter, {
                        parsers: {
                            yaml: parse,
                        },
                        type: 'yaml',
                        marker: '-'
                    })
                    .use(matterPlugin as any) // Castear a 'any' para evitar error de TypeScript
                    // .process(mdxContent); // ❌ ¡¡¡LÍNEA ELIMINADA!!!


                const metadata = processedMdx.data || frontmatter || {};


                const postData = {
                    slug: slug,
                    contenido: content,
                    metadata: metadata,
                };

                console.log(`Script upload-posts-to-db.ts: Insertando post '${mdFile}' en la base de datos...`);

                const { data, error } = await supabase
                    .from('posts')
                    .insert([postData])
                    .select();

                if (error) {
                    console.error(`Script upload-posts-to-db.ts: Error al insertar post '${mdFile}' en la base de datos:`, error);
                    console.error("Script upload-posts-to-db.ts: Error Details (Inserción DB):", error);
                } else {
                    console.log(`Script upload-posts-to-db.ts: Post '${mdFile}' insertado exitosamente en la base de datos. ID: ${data?.[0]?.id}, Slug: ${data?.[0]?.slug}`);
                }
            } catch (fileProcessingError) {
                console.error(`Script upload-posts-to-db.ts: Error al procesar archivo '${mdFile}':`, fileProcessingError);
                console.error("Script upload-posts-to-db.ts: Error Details (Procesamiento Archivo):", fileProcessingError);
            }
        }

        console.log("Script upload-posts-to-db.ts: Proceso de subida de posts a la base de datos completado.");

    } catch (directoryError) {
        console.error("Script upload-posts-to-db.ts: Error al leer la carpeta de posts:", directoryError);
        console.error("Script upload-posts-to-db.ts: Error Details (Lectura Carpeta):", directoryError);
    }
}

PostsToDb().catch(error => console.error("Script upload-posts-to-db.ts: Error no manejado:", error));

// Para ejecutar este script:
// npx tsx src/utils/upload-posts-to-db.ts