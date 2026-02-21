# Agent Guide: PortoMove

## Project Overview

PortoMove is a Next.js 16 web application providing real-time public transit information for Porto, Portugal. It shows live bus positions on an interactive map, station departure times, bike infrastructure, and community reviews — all powered by the Porto OpenTripPlanner GraphQL API, FIWARE Urban Platform, and Explore Porto open data.

## Architecture

### Framework & Routing
- **Next.js 16** with App Router (all pages and API routes under `/app`)
- **TypeScript** for type safety
- **pnpm** as package manager (enforced via `preinstall` script)
- **Node.js >= 22.19.0** required
- Client-side rendering for interactive features (`"use client"`)
- Deployed on **Vercel**

### Database & Auth
- **Neon PostgreSQL** via `@neondatabase/serverless` + Prisma ORM
- **Neon Auth** (powered by Better Auth) for authentication
  - Email/password sign-up with OTP email verification
  - Google OAuth (via `authClient.signIn.social`)
  - Password reset flow
- **Prisma** with `@prisma/adapter-neon` for serverless-compatible DB access
- Schema in `prisma/schema.prisma`, generated client in `prisma/generated/prisma`

### Pages Structure
- `/` — Live bus map (homepage) with route filtering, layer chips, onboarding flow
- `/stations` — Station list with search, favorites, and geolocation
- `/station?gtfsId={id}` — Individual station page with live departures
- `/reviews` — Community reviews hub with sub-pages:
  - `/reviews/line` — Line reviews
  - `/reviews/stop` — Stop reviews
  - `/reviews/vehicle` — Vehicle reviews
  - `/reviews/bike-park` — Bike park reviews
  - `/reviews/bike-lane` — Bike lane reviews
- `/offline` — Offline fallback page (PWA)

### API Routes (App Router)
Located in `/app/api/`:
- `buses/route.ts` — Real-time bus positions from FIWARE, enriched with OTP route data
- `stations/route.ts` — All transit stops from OTP GraphQL (with `vehicleMode`)
- `station/route.ts` — Real-time departures for a specific station by `gtfsId`
- `routes/route.ts` — All transit routes from OTP (bus + metro)
- `route-shapes/route.ts` — Route pattern geometries from OTP, decodes polylines
- `line/route.ts` — Line details
- `bike-parks/route.ts` — Bike parking stations from Explore Porto API
- `bike-lanes/route.ts` — Bike lanes (ciclovias) from Explore Porto API
- `feedback/route.ts` — GET (list) + POST (create/update) reviews with rate limiting and content filtering
- `feedback/vote/route.ts` — POST toggle upvote on reviews (Reddit-style, auto-upvote on creation)
- `feedback/summary/route.ts` — Aggregated rating summaries
- `feedback/rankings/route.ts` — Top-rated targets
- `auth/[...path]/route.ts` — Neon Auth catch-all handler

## Key Technologies

- **React 18** with hooks for state management
- **SWR** for data fetching with auto-revalidation and localStorage caching
- **Leaflet** (vanilla, not react-leaflet) for interactive maps
- **Tailwind CSS** for styling with custom design tokens (CSS variables)
- **Prisma 7** with Neon serverless adapter
- **Zod 4** for API response validation (`lib/schemas/`)
- **PWA** with service worker for offline support
- **Vitest** for unit tests, **Playwright** for performance tests

### Data Fetching
- Bus positions refresh every 30 seconds via SWR
- Station departures refresh every 30 seconds
- Stations list cached for 7 days in localStorage
- Bike parks refresh every 5 minutes
- Shared fetchers in `lib/fetchers.ts` with localStorage fallback for instant loads

## Data Models

### Prisma Schema (`prisma/schema.prisma`)

```
User          — id, email, name, role (USER/ADMIN), feedbacks[], feedbackVotes[]
Feedback      — id, userId, type, targetId, rating (1-5), comment, metadata, votes[]
FeedbackVote  — id, userId, feedbackId (unique per user+feedback)
```

**FeedbackType enum**: `BUS` (deprecated), `LINE`, `STOP`, `VEHICLE`, `BIKE_PARK`, `BIKE_LANE`

### TypeScript Types (`lib/types.ts`)

Key interfaces: `Bus`, `Stop` (with `vehicleMode`), `RouteInfo`, `PatternGeometry`, `StoptimesWithoutPatterns`, `BikePark`, `BikeLane`, `FeedbackItem` (with `voteCount`, `userVoted`)

**Time calculation for departures**: `(serviceDay + realtimeDeparture) * 1000` (milliseconds).

## External APIs

All transit data originates from **STCP (Sociedade de Transportes Colectivos do Porto)**, officially published on the [Porto Open Data portal](https://opendata.porto.digital/organization/sociedade-de-transportes-colectivos-do-porto-stcp).

### Porto OpenTripPlanner
- **URL**: `https://otp.portodigital.pt/otp/routers/default/index/graphql`
- **Protocol**: GraphQL over HTTP POST
- **Auth**: None (requires `Origin: https://explore.porto.pt` header)
- **Features**: Real-time departures, stops (with vehicleMode: BUS/SUBWAY), routes, pattern geometries

### FIWARE Urban Platform (Bus Positions)
- **URL**: `https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000`
- **Protocol**: REST (NGSI v2)
- **Auth**: None
- Returns real-time GPS positions for STCP buses

### Explore Porto (Bike Infrastructure)
- **Bike Parks**: `https://portal.api.portodigital.pt/portal/records/1.0/search/?dataset=parques-de-bicicletas`
- **Bike Lanes**: `https://portal.api.portodigital.pt/portal/records/1.0/search/?dataset=ciclovias`
- **Auth**: None

## File Structure

```
porto-realtime/
├── app/
│   ├── page.tsx                    # Bus map page (homepage)
│   ├── layout.tsx                  # Root layout with Providers (Auth, i18n)
│   ├── globals.css                 # Global styles + Leaflet + design tokens
│   ├── stations/page.tsx           # Station list page
│   ├── station/page.tsx            # Station detail page
│   ├── reviews/                    # Community reviews
│   │   ├── page.tsx                # Reviews hub
│   │   ├── line/page.tsx           # Line reviews
│   │   ├── stop/page.tsx           # Stop reviews
│   │   ├── vehicle/page.tsx        # Vehicle reviews
│   │   ├── bike-park/page.tsx      # Bike park reviews
│   │   └── bike-lane/page.tsx      # Bike lane reviews
│   ├── offline/page.tsx            # PWA offline fallback
│   └── api/                        # API routes (see above)
├── components/
│   ├── LeafletMap.tsx              # Map with bus/stop/bike markers, route polylines
│   ├── MapLayerChips.tsx           # Google Maps-style compact layer toggles
│   ├── RouteFilterPanel.tsx        # Route selection grid (bus + metro)
│   ├── AuthModal.tsx               # Sign-in/sign-up modal (email + Google OAuth)
│   ├── FeedbackForm.tsx            # Star rating + comment form
│   ├── ReviewCard.tsx              # Reusable review card with upvote
│   ├── UpvoteButton.tsx            # Reddit-style arrow upvote button
│   ├── SettingsModal.tsx           # Language, theme, map style, account
│   ├── GlobalSearch.tsx            # Search across routes and stops
│   ├── OnboardingFlow.tsx          # 3-step onboarding (welcome → routes → location)
│   ├── BottomSheet.tsx             # Slide-up panel for feedback
│   ├── BottomNav.tsx               # Mobile bottom navigation
│   ├── UserMenu.tsx                # Auth state display + logout
│   ├── FeedbackSummary.tsx         # Rating summary with distribution bars
│   ├── RatingDistribution.tsx      # Star rating distribution chart
│   ├── Providers.tsx               # AuthProvider + LocaleProvider wrapper
│   ├── LoadingSkeletons.tsx        # Skeleton loading states
│   ├── PWAInstallPrompt.tsx        # PWA install + update prompts
│   ├── AboutModal.tsx              # About dialog
│   ├── DarkModeToggle.tsx          # Dark mode toggle
│   └── LanguageSwitcher.tsx        # PT/EN language switcher
├── lib/
│   ├── types.ts                    # Shared TypeScript interfaces
│   ├── translations.ts             # PT + EN i18n strings
│   ├── i18n.tsx                    # Locale context provider
│   ├── fetchers.ts                 # SWR fetchers with localStorage cache
│   ├── schemas/
│   │   ├── otp.ts                  # Zod schemas for OTP API responses
│   │   └── fiware.ts               # Zod schemas for FIWARE API responses
│   ├── hooks/
│   │   ├── useAuth.tsx             # Auth context (signIn, signUp, signInSocial, logout)
│   │   ├── useTranslations.ts      # Translation hook
│   │   ├── useFeedback.ts          # Feedback list fetching hook
│   │   └── useFavorites.ts         # Station favorites hook
│   ├── auth.ts                     # Server-side Neon Auth config
│   ├── auth-client.ts              # Client-side Neon Auth client
│   ├── prisma.ts                   # Prisma client singleton
│   ├── content-filter.ts           # Comment content moderation
│   ├── sanitize.ts                 # HTML sanitization
│   ├── simulate.ts                 # Bus simulation for testing
│   ├── storage.ts                  # localStorage wrapper with expiry
│   └── logger.ts                   # Environment-aware logging
├── prisma/
│   ├── schema.prisma               # Database schema
│   ├── prisma.config.ts            # Prisma config with Neon adapter
│   └── migrations/                 # Database migrations
├── public/                         # Static assets, PWA manifest, service worker
├── __tests__/                      # Unit tests (Vitest)
├── tests/                          # Integration + performance tests
├── scripts/                        # Build scripts (SW version update)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs                 # Next.js config with PWA plugin
├── vitest.config.ts
├── playwright.config.ts
└── vercel.json
```

## Key Features

### Bus Map (`/`)
- Real-time bus markers with route number + destination labels
- SVG bus stop icons (teal) and metro stop icons (blue "M" circle)
- Metro stops visible from zoom 12+, bus stops from zoom 15+
- Google Maps-style compact layer chips (stops, paths, bike parks, bike lanes)
- Route filtering with favorites (persisted in localStorage)
- Route path visualization (polylines from OTP pattern geometries)
- Map style switcher (Standard, Satellite, Terrain) in Settings
- Max zoom 19, tile pre-loading buffer for smooth panning
- User geolocation with fly-to animation
- Station highlighting via URL param (`/?station=2:BRRS2`)
- 3-step onboarding for first-time users
- Dark mode support

### Community Reviews
- Star ratings (1-5) + optional comments for lines, stops, vehicles, bike parks, bike lanes
- Reddit-style upvoting (auto-upvote own reviews, toggle on/off)
- Sort by most recent or most helpful
- Content filtering and rate limiting (20 submissions/hour)
- Reusable ReviewCard component across all 5 review types

### Authentication
- Email/password sign-up with OTP email verification
- Google OAuth sign-in (via Neon Auth)
- Password reset flow
- Auth modal rendered via React portal (avoids nesting issues)

### Station Departures (`/station`)
- Live departure times using `serviceDay + departureSeconds`
- Color-coded urgency (red ≤2min, orange ≤5min, blue ≤10min)
- Real-time vs scheduled indicator

### Stations List (`/stations`)
- 5 closest stations via Haversine distance
- Favorites with localStorage persistence
- Text search filter

## Development Guidelines

### Setup
1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in Neon credentials
3. `pnpm install`
4. `pnpm dev` (runs on port 3000 by default)

### Adding Features
1. **New API endpoints**: Add to `/app/api/` as `route.ts` files
2. **New pages**: Add to `/app/` directory
3. **Shared types**: Add to `lib/types.ts`
4. **Data fetching**: Use SWR with fetchers from `lib/fetchers.ts`
5. **Components**: Extract to `components/` directory
6. **Translations**: Add to both PT and EN sections in `lib/translations.ts`
7. **Database changes**: Update `prisma/schema.prisma`, run `prisma migrate dev`

### Testing
- `pnpm test` — Run unit tests (Vitest)
- `pnpm test:watch` — Watch mode
- `pnpm test:integration` — OTP API integration tests
- `pnpm test:perf` — Playwright performance tests

### Code Patterns
- All modals use `createPortal(…, document.body)` to avoid nesting issues
- Auth-gated actions show `AuthModal` when unauthenticated
- API routes use Zod for input validation
- Feedback endpoints use `auth.getSession()` for user identity
- Prisma `upsert` pattern for one-rating-per-user-per-target

## Environment Variables

```
DATABASE_URL          — Neon PostgreSQL connection string
NEON_AUTH_BASE_URL    — Neon Auth endpoint URL
NEON_AUTH_COOKIE_SECRET — Secret for session cookies (min 32 chars)
```

Google OAuth is configured in the Neon Console (Settings → Auth → OAuth Providers), not via env vars.

## Known Issues
- Bus positions (FIWARE) work independently from OTP schedule data
- LSP may show false positive errors for `AuthUser.name` and `@/lib/auth` imports (stale type cache)
- Pre-existing LSP errors in `lib/resend.ts` and legacy `app/api/auth/{login,verify,logout,me}/route.ts` files
