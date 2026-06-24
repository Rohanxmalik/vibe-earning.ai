import type { Config } from "tailwindcss";

// The portal already ships a hand-written design system in app/globals.css.
// Tailwind is layered in only for the marketing hero (components/ui/*), so two
// core plugins are turned off to avoid clobbering the existing pages:
//   - preflight: Tailwind's global reset would fight globals.css. We scope an
//     equivalent reset to `.kbi-tw` (the hero subtree) inside globals.css instead.
//   - container: globals.css defines its own `.container` (max-width: var(--maxw))
//     used by every non-home page; Tailwind's responsive container would override it.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  corePlugins: {
    preflight: false,
    container: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
