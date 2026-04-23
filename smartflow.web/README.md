## SmartFlow MVP — Web (V1)

Single-screen React + TypeScript app for entering a litre amount and watching the dispense happen in real time. Spec: `../docs/versions/V1.md`. Version matrix: `../docs/tech-stack/TECH_STACK.md`.

### Stack

- Vite 8 + React 19 + TypeScript 6
- Tailwind CSS 4 (via `@tailwindcss/vite`)
- Material UI 9 + Emotion 11
- GSAP 3 for the hero litre counter + water-fill animation
- Axios for the REST call, native `WebSocket` for progress

### Quick start

```bash
cp .env.example .env          # defaults point at http://localhost:8000
npm install
npm run dev                   # http://localhost:5173
```

### Env

| Var | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Server origin for `/api/dispense` |
| `VITE_WS_BASE_URL` | `ws://localhost:8000` | Server origin for `/api/ws/dispense/{id}` |
| `VITE_MAX_LITRES` | `100` | Client-side input cap (mirrors server's `MAX_LITRES`) |

### Layout

```
src/
├── App.tsx                         # screen state machine + snackbar
├── main.tsx                        # React entry, MUI theme, Tailwind import
├── index.css                       # Tailwind + design tokens
├── theme.ts                        # MUI theme (aqua primary)
├── lib/
│   ├── api.ts                      # axios + error mapping
│   └── ws.ts                       # progress WebSocket helper
└── components/
    ├── DispenseForm.tsx            # litre input + Dispense button
    └── DispenseProgress.tsx        # hero counter, water fill, status chip
```
