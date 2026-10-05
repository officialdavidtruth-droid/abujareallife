# Abuja Real Life — Mobile/iPad Patch

This patch makes the Three.js/R3F world mobile-first:

- iPhone/Android touch joystick
- iPad/tablet controls
- Touch action buttons
- Responsive district selector
- Safe-area support for notched phones
- Landscape phone support
- Performance-friendly R3F DPR
- Fixes the R3F hook error by moving `useFrame()` player movement inside `<Canvas>`

## Install

1. Replace your existing `components/World.tsx` with the included file.
2. Import the CSS from your existing global stylesheet, for example:
   `import './globals.css';`
   or copy the CSS into your current global CSS file.
3. Keep the page as a client-only/dynamic import for the game world if you are using Next.js SSR:
   `dynamic(() => import('@/components/World'), { ssr: false })`.

The mobile controls are designed for the next Sims-like systems:
phone UI, interactions, inventory, needs, jobs, relationships, housing and vehicles.
