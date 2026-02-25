# Next.js 16 Upgrade Guide

## Issue Encountered

The automatic upgrade tool (`@next/codemod upgrade`) failed due to an ESLint version conflict:

- Next.js 16 requires ESLint 9+
- The tool upgraded Next.js but left ESLint at version 8
- This created a peer dependency conflict

## Fix Applied

Updated `package.json`:

```diff
- "eslint": "^8",
+ "eslint": "^9",
```

## Complete the Upgrade

Run these commands to finish the upgrade:

```bash
# Remove node_modules and lock file for clean install
rm -rf node_modules package-lock.json

# Install updated dependencies
npm install

# Verify the installation
npm list eslint next react
```

Expected output:

```
porto-app@0.1.0
├── eslint@9.x.x
├── next@16.1.6
└── react@18.3.1
```

## What Changed

### Major Version Updates

- **Next.js**: 14.1.4 → 16.1.6
- **React Types**: 18.x → 19.2.13
- **ESLint**: 8.x → 9.x

### Breaking Changes to Watch For

#### 1. ESLint 9 Configuration

ESLint 9 uses a new flat config format. You may need to update `.eslintrc.json` if you have custom rules.

**Before (ESLint 8):**

```json
{
  "extends": "next/core-web-vitals"
}
```

**After (ESLint 9):** Should still work with `next/core-web-vitals`, but custom configs may need updates.

#### 2. Next.js 16 Changes

- Improved performance and stability
- Better TypeScript support
- Enhanced App Router features
- Updated caching behavior

#### 3. React 18 Preserved

The upgrade kept React 18 (recommended choice for mixed pages/app router usage).

## Verify Everything Works

After installation, test:

1. **Development Server:**

   ```bash
   npm run dev
   ```

2. **Build:**

   ```bash
   npm run build
   ```

3. **Linting:**

   ```bash
   npm run lint
   ```

4. **Test Key Pages:**
   - Home: http://localhost:3000
   - Map: http://localhost:3000/map
   - API: http://localhost:3000/api/buses

## Potential Issues & Solutions

### Issue: ESLint Configuration Errors

**Symptom:** `npm run lint` fails with config errors

**Solution:** Update `.eslintrc.json` to use flat config or add compatibility:

```json
{
  "extends": ["next/core-web-vitals"]
}
```

### Issue: Type Errors with React 19 Types

**Symptom:** TypeScript errors about React types

**Solution:** The `overrides` section in package.json should handle this, but if issues persist:

```bash
npm install --save-dev @types/react@19.2.13 @types/react-dom@19.2.3
```

### Issue: Build Failures

**Symptom:** `npm run build` fails

**Solution:**

1. Clear Next.js cache: `rm -rf .next`
2. Rebuild: `npm run build`

## Rollback Plan (If Needed)

If the upgrade causes issues, rollback:

```bash
# Restore previous versions
npm install next@14.1.4 eslint@8.57.1 eslint-config-next@14.1.4 --save-dev

# Also update types
npm install @types/react@18.2.0 @types/react-dom@18.2.0 --save-dev

# Remove overrides from package.json
```

## Next Steps

1. ✅ Run `npm install` to complete the upgrade
2. ✅ Test all pages and API routes
3. ✅ Run `npm run build` to verify production build
4. ✅ Update any custom ESLint rules if needed
5. ✅ Review Next.js 16 changelog for new features

## Resources

- [Next.js 16 Release Notes](https://nextjs.org/blog/next-16)
- [Next.js 15 Migration Guide](https://nextjs.org/docs/app/guides/upgrading/version-15) - **Important for 14 → 15 → 16 upgrade path**
- [ESLint 9 Migration Guide](https://eslint.org/docs/latest/use/migrate-to-9.0.0)
- [Next.js Upgrade Guide](https://nextjs.org/docs/app/building-your-application/upgrading)

## Next.js 15+ Breaking Changes to Review

Since you're upgrading from Next.js 14 → 16 (skipping 15), review these key changes from the [Next.js 15 migration guide](https://nextjs.org/docs/app/guides/upgrading/version-15):

### 1. Async Request APIs (Breaking Change)

**Affected:** `headers()`, `cookies()`, `params`, `searchParams`

In Next.js 15+, these are now async:

```typescript
// Before (Next.js 14)
const headersList = headers();
const cookieStore = cookies();

// After (Next.js 15+)
const headersList = await headers();
const cookieStore = await cookies();
```

**Action Required:** Check if you use these APIs anywhere.

### 2. Route Segment Config Changes

- `runtime` prop changes
- `dynamic` behavior updates
- Caching defaults changed

### 3. fetch() Caching Changes

**Important:** `fetch()` requests are no longer cached by default in Next.js 15+.

**Before:** All fetch requests cached automatically
**After:** Must explicitly opt-in to caching

```typescript
// Opt-in to caching
fetch("https://...", { cache: "force-cache" });

// Or set in route segment
export const dynamic = "force-static";
```

### 4. Route Handlers (`GET`, `POST`, etc.)

GET handlers now opt out of caching by default. Add caching if needed:

```typescript
export const dynamic = "force-static";
```

### Impact on Porto Explore App

Based on our codebase review:

✅ **No Action Needed:**

- We don't use `headers()` or `cookies()` directly
- Our API routes (`/api/buses`, `/api/stations`) use Pages Router (not affected)
- Client-side data fetching via SWR (not affected)

⚠️ **Monitor:**

- FIWARE API calls in `/api/buses` - already configured with explicit headers
- OTP GraphQL calls in `/api/stations` - using fetch without cache options

**Recommendation:** No immediate changes needed, but monitor API route performance after upgrade.
