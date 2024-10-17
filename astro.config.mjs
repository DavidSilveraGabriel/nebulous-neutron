// @ts-check
import { defineConfig } from 'astro/config';

import preact from "@astrojs/preact";

// https://astro.build/config
export default defineConfig({
  // MODIFICAR CON LA URL FINAL
  site: "https://nebulous-neutron-pink.vercel.app/",

  integrations: [preact()]
});