Abuja Real Life — actual supermarket product-renderer patch

Replace components/Interior.tsx with this file.

What changed:
- Dense retail display rooms (70+ decor items) render shelf stock as varied 3D silhouettes rather than one instanced cube mesh.
- Product silhouettes include bottles with necks/caps, cans with metal tops, cartons, jars and packaged products.
- Existing room layout, interaction spots and collision definitions are not changed.

Important:
These are improved procedural 3D product meshes, not scanned or branded real-world assets. For photorealism, add high-quality textured GLB product assets and PBR materials in a later pass.
Run npm run build and test the Supermarket interior before pushing.
