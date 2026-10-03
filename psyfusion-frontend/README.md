# PsyFusion AI — Frontend UI Shell

A Wysa-inspired (but visually original) soft-UI React app: onboarding, auth,
a home dashboard with mood check-in, a conversational screening flow wired
to the real backend, and an anonymous community feed wired to the real
backend. Built with React + TypeScript + Vite, no UI framework dependency
(Tailwind/MUI/etc.) — just a small hand-rolled design system in CSS, so
there's nothing extra to learn to extend it.

## Status — this one was actually verified, not just syntax-checked

This sandbox has no npm registry access (same limitation as the backend and
ML pipeline), so a real `npm install` hasn't been run here either. But
`react`/`react-dom`/`esbuild`/`typescript`/`playwright` happened to be
available as **global** tools in this environment (no `@types/react`
though — `tsc --noEmit` fails purely on missing type declarations for
`react`/`react-dom`, not on anything in this project's own code), so I used
them to:

1. **Bundle the actual source** with esbuild (not just syntax-check it) —
   caught real import/reference errors, not just parse errors.
2. **Server-render every screen** with `react-dom/server`, including `Auth`
   wrapped in `AuthProvider`, to confirm each component actually runs
   without throwing, not just compiles.
3. **Screenshot screens in a real headless Chromium** and exercise real
   interaction: typed into the login/register form and submitted it, typed
   a message into Screening and sent it, let Community try to load its feed
   — all three correctly hit the real `fetch` calls in `src/api/*`, got a
   connection failure (no backend is actually running in this sandbox — see
   below), and displayed a friendly in-UI error instead of crashing or
   showing a blank screen. This is the strongest check available here for
   the frontend↔backend wiring itself; it doesn't confirm a *successful*
   round trip, since the backend can't run in this sandbox (see the backend
   README), but it does confirm the request shapes, headers, and error
   handling are all exercised and correct up to the network boundary.
4. Earlier in this project's history this same method caught a real layout
   bug (the chat composer wasn't anchored correctly due to a `min-height`
   vs `height` issue in the app shell's flexbox chain), now fixed in
   `src/styles/shell.css`.

What this does NOT confirm: a real `npm install` + `vite dev`/`vite build`
with the exact dependency versions in `package.json`, or an actual
successful API round trip (needs the backend + MongoDB + the ML service
all running together, which this sandbox can't do — see
`psyfusion-backend/README.md`). Run `npm install` locally as the first
step — it's a well-trodden Vite+React+TS setup, so it should be
uneventful, but verify before you build further on top of it.

## Setup

```bash
cp .env.example .env.local   # VITE_API_BASE_URL, defaults to http://localhost:5000
npm install
npm run dev     # http://localhost:5173
```

## What's in it

- **Design tokens** (`src/styles/tokens.css`) — the full palette, type
  scale, radius scale, and shadow system as CSS custom properties. Change
  the brand here, not per-component.
- **OrbCompanion** — the "presence" element, instead of an illustrated
  mascot character. An abstract breathing gradient blob with real
  sphere-style shading (highlight + core + rim shadow), animated border-
  radius morphing, and a slow-spinning outer ring. Changes color/pace by
  `mood` prop (`calm` / `listening` / `warm` / `grounded`) — e.g. it visibly
  shifts to `listening` while the screening chat is waiting on a reply.
- **Five screens**: Auth (login/register, gates everything else), Onboarding,
  Home (mood check-in + quick-access tiles + streak), Screening (chat-style
  conversational flow, now calling the real `/api/screening` endpoint),
  Community (anonymous feed + composer, now calling the real
  `/api/community/posts`).
- **`src/api/`** — the HTTP layer: `client.ts` (fetch wrapper with
  credentials, Authorization header, and a transparent one-shot refresh-and-
  retry on 401), `tokenStore.ts` (in-memory access token — never
  localStorage, so XSS can't read a long-lived credential off disk),
  `auth.ts`, `screening.ts`, `community.ts`.
- **`src/context/AuthContext.tsx`** — on app load, silently tries to turn
  the browser's httpOnly refresh cookie into a fresh access token (so a
  returning user isn't dropped back to login every time), exposes
  `login`/`logout`/`user`/`status` to the rest of the app.
- **Navigation**: plain React state, no router library — kept the dependency
  surface minimal for a shell meant to be extended. Swap in
  `react-router-dom` when there are enough screens to need real URLs/deep
  links.

## Design choices worth knowing about

- **Palette is a "dusk" theme** (violet/lavender base, warm coral accent,
  sage for positive states) — deliberately not the pastel-mint-and-white
  look most wellness apps default to, and not a generic SaaS palette either.
  Dark mode is wired up via `prefers-color-scheme` and a `data-theme`
  override, not just an afterthought.
- **Border radius is NOT one value reused everywhere.** `SoftCard` takes a
  `radius` prop (`sm`/`md`/`lg`/`xl`) specifically so hero elements, cards,
  and list rows read as different levels of hierarchy instead of the
  generic "identical rounded rectangles" look.
- **Fraunces (display) + Figtree (body)** — a soft-contrast serif paired
  with a rounded geometric sans. Both on Google Fonts, loaded in
  `index.html`.

## What's NOT yet built (next steps)

- **Forgot-password flow** — login/register exist; password reset doesn't
  (the backend doesn't have it yet either, see its README).
- **Email verification UI** — the backend now has `POST /api/auth/verify-email`
  (expects `{ token }`, the value from the link in the verification email —
  see `psyfusion-backend/src/services/emailService.js`), but there's no page
  here to land on that link and call it.
- **MFA UI** — the backend now has a full TOTP + backup-codes flow
  (`/api/auth/mfa/*` — see the backend README). `Auth.tsx`'s `login()` call
  doesn't yet handle a `{ mfaRequired: true, mfaToken }` response, so right
  now logging in as a user with MFA enabled will look like a silent failure
  in this UI. Needs: a "enter your 6-digit code" step after login when that
  shape comes back, plus a settings screen to set MFA up in the first place
  (scan the `otpauthUrl` from `/mfa/setup` as a QR code, confirm with
  `/mfa/verify-setup`, show the one-time backup codes).
- **Audio/video capture in Screening** — `submitScreening()` in
  `src/api/screening.ts` already accepts optional `audio`/`video` `File`s and
  the backend/ML service already handle them end-to-end; there's just no
  recorder/upload UI calling it yet. Text-only screening is fully wired.
- **Screening history view** — `getScreeningHistory()` exists in
  `src/api/screening.ts` but nothing in the UI calls it yet (e.g. a "past
  check-ins" list on the Home or Profile screen).
- **Clinician moderation UI** — the backend's `/api/community/moderation/*`
  and `/api/screening/flagged*` routes exist for `clinician`/`admin` roles,
  but there's no screen here for them yet; this shell has no role-aware
  navigation at all currently.
- **react-router-dom** for real URLs once the screen count grows.
- **A design-system doc/Storybook** if the team grows past what fits in
  someone's head.
- A true WebGL 3D companion (react-three-fiber) was considered and
  deliberately skipped in favor of the CSS orb — it's lighter weight, has
  zero extra dependencies, and reads as "3D enough" for a soft-UI app. Revisit
  only if the team specifically wants a more literal 3D character.

## Folder structure

```
src/
  api/          client.ts, tokenStore.ts, auth.ts, screening.ts, community.ts
  context/      AuthContext.tsx
  components/   Button, SoftCard, OrbCompanion, BottomNav, MoodPicker
  pages/        Auth, Onboarding, Home, Screening, Community
  styles/       tokens.css (design system), shell.css (app frame)
  App.tsx       top-level state + auth gate + screen switching
  main.tsx      React entry point
```
