// @ts-check 
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

import preact from "@astrojs/preact";
import react from '@astrojs/react';
import icon from "astro-icon";

import vercel from "@astrojs/vercel/serverless";


import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';


import starlight from '@astrojs/starlight';

//
//import vercel from '@astrojs/vercel/serverless';
//import vercel from '@astrojs/vercel/static';
//
// https://astro.build/config

export default defineConfig({
  // MODIFICAR CON LA URL FINAL
  site: "https://silveradavid.site/",
  integrations: [
    preact(),
    react(),
    tailwind(),
    sitemap(),
    icon({
      include: {
        mdi: ['*'] // Esto incluirá todos los iconos de Material Design
      }
    }),
    starlight({
      title: "DAVID",
      logo: {
        src: './src/assets/icon.png',
        replacesTitle: true,
      },
      expressiveCode: {
        // Configuración de expressive-code
        themes: ['catppuccin-macchiato','snazzy-light'], // o el tema que prefieras
        styleOverrides: {
          borderRadius: '0.5rem' // Radio de borde para los bloques de código
        },
      },
      social: {
        linkedin: 'https://www.linkedin.com/in/davidsilveragabriel',
        github: 'https://github.com/DavidSilveraGabriel',
      },
    }),
     mdx()
  ],
  //  output: "server",
  //  adapter: vercel({webAnalytics: {
  //    enabled: true,
  //  },})
});