import { indexContent } from '../src/utils/IndexContent';

async function main() {
  try {
    await indexContent();
    console.log('✅ Contenido indexado correctamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al indexar contenido:', error);
    process.exit(1);
  }
}

main();

// uso : directorio --> "npx tsx scripts/index-content.ts" 
// o "node --trace-deprecation scripts/index-content.ts"

