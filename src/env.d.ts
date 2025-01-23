/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
    readonly GEMINI_API_KEY: string;
    readonly SUPABASE_URL: string;
    readonly SUPABASE_KEY: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }