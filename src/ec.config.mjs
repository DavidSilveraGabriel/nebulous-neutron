import { defineEcConfig } from 'astro-expressive-code';

export default defineEcConfig({
  // --- List of Bundled Themes ---
  // Dark Themes:
  // 'andromeeda', 'aurora-x', 'ayu-dark', 'catppuccin-frappe', 'catppuccin-macchiato', 
  // 'catppuccin-mocha', 'dark-plus', 'dracula', 'dracula-soft', 'everforest-dark', 
  // 'github-dark', 'github-dark-default', 'github-dark-dimmed', 'github-dark-high-contrast', 
  // 'houston', 'kanagawa-dragon', 'kanagawa-wave', 'laserwave', 'material-theme', 
  // 'material-theme-darker', 'material-theme-ocean', 'material-theme-palenight', 
  // 'min-dark', 'monokai', 'night-owl', 'nord', 'one-dark-pro', 'plastic', 'poimandres', 
  // 'red', 'rose-pine', 'rose-pine-moon', 'slack-dark', 'solarized-dark', 'synthwave-84', 
  // 'tokyo-night', 'vesper', 'vitesse-black', 'vitesse-dark'
  // Light Themes:
  // 'catppuccin-latte', 'everforest-light', 'github-light', 'github-light-default', 
  // 'github-light-high-contrast', 'kanagawa-lotus', 'light-plus', 'material-theme-lighter', 
  // 'min-light', 'one-light', 'rose-pine-dawn', 'slack-ochin', 'snazzy-light', 
  // 'solarized-light', 'vitesse-light'
  // -----------------------------
  // Choose one dark and one light theme (or just one if you prefer)
  themes: ['night-owl', 'dracula'], // Centralized theme definition
  // -----------------------------
  // Tell Expressive Code how to select the theme based on the presence of '.dark' class
  themeCssSelector: (theme, { styleVariants }) => {
    if (styleVariants.length >= 2) {
      const light = styleVariants.find(({ theme: t }) => t.type === 'light');
      const dark = styleVariants.find(({ theme: t }) => t.type === 'dark');
      // Handle cases where only dark themes are provided
      if (!light && dark) {
         // If only dark themes, always use the first one regardless of light/dark mode
         return `[data-theme='${dark.theme.name}'], .${dark.theme.name}`;
      }
      if (light && dark) {
        return `[data-theme='${light.theme.name}'], .${light.theme.name}, html:not(.dark) .${dark.theme.name}`;
      }
    }
    // Fallback default selector if only one theme or no light/dark pair found
    return `[data-theme='${theme.name}'], .${theme.name}`;
  },
  // Add other expressive-code options here if needed in the future
  // styleOverrides: {
  //   borderRadius: '0.5rem'
  // },
});
