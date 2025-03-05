import { PostsToDb } from '../src/utils/upload-posts-to-db';

async function main() {
  try {
    await PostsToDb();
    console.log('✅ Contenido indexado correctamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al indexar contenido:', error);
    process.exit(1);
  }
}

main();

// uso : directorio --> "npx tsx scripts/upload-blog.ts" 
// o "node --trace-deprecation scripts/upload-blog.ts"
