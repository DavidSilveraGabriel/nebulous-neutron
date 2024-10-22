// @ts-check 
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

import preact from "@astrojs/preact";
import react from '@astrojs/react';
import icon from "astro-icon";

import vercel from "@astrojs/vercel/serverless";
//
//import vercel from '@astrojs/vercel/serverless';
//import vercel from '@astrojs/vercel/static';
//
// https://astro.build/config
export default defineConfig({
  // MODIFICAR CON LA URL FINAL
  site: "https://nebulous-neutron-pink.vercel.app/",

  integrations: [
                preact(),
                react(),
                tailwind(),
                icon({
                include: {
                  mdi: ['*'] // Esto incluirá todos los iconos de Material Design
                    }
                  })
            ],
//  output: "server",
//  adapter: vercel({webAnalytics: {
//    enabled: true,
//  },})
});