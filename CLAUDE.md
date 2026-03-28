# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (root)
```bash
npm run dev       # Start Vite dev server
npm run build     # tsc -b && vite build
npm run lint      # ESLint
npm run preview   # Preview production build
```

### Firebase Functions (`firebase-functions/`)
```bash
npm run build     # Compile TypeScript
npm run serve     # Build + start Firebase emulator
npm run deploy    # Deploy to Firebase
npm run logs      # View function logs
```

### Cloudflare Worker (`workers/notification-cron/`)
Uses Wrangler CLI for deployment.

## Architecture

This is a personal portfolio + protected productivity web app.

**Frontend:** React 19 + TypeScript (strict), Vite 6, TailwindCSS 4, Radix UI, React Router DOM v7. Path alias `@` → `./src`.

**Backend:**
- Firebase Auth, Firestore, Storage
- Firebase Cloud Functions (`firebase-functions/src/index.ts`) — currently handles password reset emails via Resend
- Cloudflare Worker (`workers/notification-cron/`) — cron job running every minute for push notifications

**AI:** Google Generative AI (`@google/generative-ai`) used in the quiz module to parse PDFs into quiz questions.

**PWA:** Service worker at `public/firebase-messaging-sw.js` handles Firebase Cloud Messaging push notifications.

## App Structure

The app has two major sections split in routing (`src/main.tsx`):

1. **Portfolio** (`src/portfolio/`) — Public-facing personal portfolio showcase, no auth required.
2. **App** (`src/app/`) — Protected routes requiring Firebase auth:
   - `auth/` — Login, password reset, `AuthContext`, `ProtectedRoute`
   - `dashboard/` — User overview
   - `quiz/` — Quiz builder/player; supports PDF import via Gemini AI, image caching (`imageCache.ts`), sharing modals
   - `timetable/` — School schedule planner
   - `settings/` — Profile & preferences
   - `shared/` — Firebase config, `ThemeContext`, `AppLoadingContext`, toast hook, shared UI

**Shared UI components** (`components/ui/`) are Radix UI-based reusable primitives.

## Key Conventions

- TypeScript strict mode — no unused locals/parameters (`tsconfig.app.json`)
- `@` path alias used throughout for imports from `src/`
- Each feature module (quiz, timetable) contains its own `modals/`, `views/`, `constants.ts`, and CSS file
- Firebase config lives in `src/app/shared/firebase.ts`
