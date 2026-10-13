Copy these into the project (same paths):
  public/models/characters/kara.glb        (your Kara model, bones renamed to mixamorig:*, textures shrunk to 1024 webp)
  public/models/characters/animations.glb  (all 18 Mixamo clips + root motion removed)
  components/GlbHuman.tsx                  (new)
  components/Human.tsx                     (replaces the old one; same props)
No new npm packages needed (three, @react-three/drei already installed).
To change who uses the GLB: edit useGlbFor() in components/Human.tsx.
