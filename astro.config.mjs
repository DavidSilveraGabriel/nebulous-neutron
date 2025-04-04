// @ts-check 
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import nodejs from '@astrojs/node';

//import preact from "@astrojs/preact";
import react from '@astrojs/react';
import icon from "astro-icon";

import vercel from "@astrojs/vercel";


import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';

//import starlight from '@astrojs/starlight';

//
//import vercel from '@astrojs/vercel/serverless';
//import vercel from '@astrojs/vercel/static';
//
// https://astro.build/config

export default defineConfig({
  // MODIFICAR CON LA URL FINAL
  site: "https://silveradavid.site/",
  integrations: [
    // preact(), // Removed Preact integration
    react(),
    tailwind(),
    sitemap(),
    icon({
      include: {
        mdi: ['*'] // Esto incluirá todos los iconos de Material Design
      }
    }),
    // Expressive Code integration will automatically load config from ec.config.mjs
    // No need to pass options here unless overriding ec.config.mjs
    expressiveCode(), 
    mdx() // Keep mdx() if you are using MDX features beyond basic markdown
  ],
  //  output: "server",
    adapter: vercel({webAnalytics: {
      enabled: true,
    },}),
  vite: {
    define: {
      'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL),
      'process.env.SUPABASE_KEY': JSON.stringify(process.env.SUPABASE_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY),
      'process.env.PUBLIC_SUPABASE_URL': JSON.stringify(process.env.PUBLIC_SUPABASE_URL),
      'process.env.PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(process.env.PUBLIC_SUPABASE_ANON_KEY),
    }
  },
  output: 'server',
  
});
