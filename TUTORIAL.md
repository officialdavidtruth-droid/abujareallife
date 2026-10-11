# In-game tutorial: shows once per account

NEW components/Tutorial.tsx - objective card + glowing buttons; steps finish when the player does them.
NEW app/api/tutorial/route.ts - GET {done}, POST marks done. Stored in Save.state.tut (no migration).
EDITED app/api/save/route.ts - autosave keeps the tut flag.
EDITED components/Sim.tsx - renders <Tutorial/>; the menu replay button is removed.
EDITED components/GameLayer.tsx - old Goals welcome chip stays hidden while the tutorial runs.
Finish or Skip = never shown again (server + this device). components/Guide.tsx is unused: delete it.
