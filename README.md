# 21 Quake Web Prototype

Standalone React/TypeScript version of the 21 Quake game. It does not require Unity or Blender.

## Run

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. The production build is created with `npm run build`.

## Docker

```powershell
docker compose up --build -d
```

Open <http://localhost:8080>. Stop it with `docker compose down`.

## Game loop

Select up to five tiles, make exactly 21, press QUAKE, score, replace the used tiles, and survive the progressively faster vertical lava timer.
