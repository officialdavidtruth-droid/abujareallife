Abuja Real Life — CityTerrain build fix

Copy these files into your repository, preserving the folder paths:
- components/CityTerrain.tsx
- lib/terrain.ts

Important: remove the misplaced duplicate at the repository root (CityTerrain.tsx). Keep components/CityTerrain.tsx. Then commit and push.

Commands from the repository root:
  git rm --ignore-unmatch CityTerrain.tsx
  git add components/CityTerrain.tsx lib/terrain.ts
  git commit -m "fix: correct CityTerrain component paths"
  git push origin main