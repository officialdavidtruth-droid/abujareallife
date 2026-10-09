/* Client-side bridge between the home sim (Sim.tsx), the city and the building interior for "free will" work. */
export const AUTO = {
  free: true,                                   // mirrors the Free will toggle
  work: null as null | { bizId: string; idx: number; name: string; job: string; x: number; z: number }, // workplace (server-saved)
  lastInput: Date.now(),                        // last time the player touched the controls: free will only acts when they are idle
  minNeed: () => 100,                           // lowest need, set by Sim.tsx
  drain: null as null | (() => void),           // applied after each auto shift (work makes you hungry / tired)
  blocked: false,                               // work refused by the server (rank etc.): stop trying this session
};
export const idleFor = () => Date.now() - AUTO.lastInput;
