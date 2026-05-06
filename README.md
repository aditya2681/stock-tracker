# StockTrack

HTML-first wholesale stock and purchase-trip tracker built with React, Vite, Tailwind, Dexie, jsPDF, and Convex scaffolding.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start Convex locally in another terminal:

```bash
npx convex dev
```

This step is required to:
- authenticate and create the Convex dev deployment
- write `VITE_CONVEX_URL` into `.env.local`
- generate the real `convex/_generated/*` files

3. Start the frontend:

```bash
npm run dev
```

4. Open the app at the Vite URL, typically `http://localhost:5173`.

## Current implementation status

- The provided HTML UX has been ported into a routed React app with the same visual shell and screen flow.
- Stock updates, register planning, enquiry logging, purchase entry, bag fill, gate pass generation, delivery verification, and PDF export work in local demo mode.
- Dexie caches the app snapshot for read-first offline behavior.
- Convex schema and domain files are included, but full live backend wiring depends on running `npx convex dev`.
