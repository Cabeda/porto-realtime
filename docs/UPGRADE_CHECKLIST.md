# Next.js 16 Upgrade Checklist

## Pre-Upgrade Status
- ✅ ESLint version fixed (8 → 9)
- ✅ package.json updated
- ✅ Migration guide reviewed

## Complete the Upgrade

### Step 1: Clean Install
```bash
# Remove old dependencies
rm -rf node_modules package-lock.json

# Install with fixed ESLint version
npm install
```

### Step 2: Verify Installation
```bash
# Check versions
npm list eslint next react

# Should show:
# ├── eslint@9.x.x
# ├── next@16.1.6
# └── react@18.3.1
```

### Step 3: Test Development Server
```bash
npm run dev
```

**Test these URLs:**
- [ ] http://localhost:3000 (home page)
- [ ] http://localhost:3000/map (live bus map)
- [ ] http://localhost:3000/api/buses (bus API)
- [ ] http://localhost:3000/api/stations (stations API)

### Step 4: Test Production Build
```bash
npm run build
```

Look for:
- [ ] No build errors
- [ ] All routes compile successfully
- [ ] No TypeScript errors

### Step 5: Test Linting
```bash
npm run lint
```

### Step 6: Functional Testing

**Home Page:**
- [ ] Station list loads
- [ ] "Live Map" button visible
- [ ] Closest stations show (with location permission)
- [ ] Favorites work
- [ ] Filter works

**Map Page:**
- [ ] Map loads
- [ ] Location permission requested on page load
- [ ] Bus markers appear (🚌 emoji)
- [ ] Route numbers display correctly (not "Route urn")
- [ ] "My Location" button works
- [ ] Location pin appears (📍)
- [ ] Bus popups show route info
- [ ] Map auto-refreshes every 30s

**Station Page:**
- [ ] Visit any station detail page
- [ ] Departures load
- [ ] Real-time updates work

## Key Changes from Next.js 15 Migration Guide

### ✅ Already Compatible
Our app uses:
- Pages Router API routes → Not affected by async changes
- Client-side SWR → Not affected by fetch caching changes
- No use of `headers()`, `cookies()` → Not affected

### ⚠️ Watch For
- API route performance (caching defaults changed)
- If any issues, add explicit caching to API routes

## If Something Breaks

### ESLint Config Issues
If `npm run lint` fails, check `.eslintrc.json`:
```json
{
  "extends": ["next/core-web-vitals"]
}
```

### Type Errors
The `overrides` in package.json should handle React 19 types, but if issues:
```bash
npm install --save-dev @types/react@19.2.13 @types/react-dom@19.2.3 --force
```

### Build Failures
Clear cache and rebuild:
```bash
rm -rf .next
npm run build
```

### Complete Rollback
If major issues:
```bash
# Edit package.json and change:
# "next": "14.1.4"
# "eslint": "^8"
# "eslint-config-next": "14.1.4"
# "@types/react": "^18"
# "@types/react-dom": "^18"
# Remove the "overrides" section

# Then:
rm -rf node_modules package-lock.json
npm install
```

## Migration Complete ✅

Once all tests pass:
- ✅ Upgrade successful
- ✅ All features working
- ✅ Ready for production

## Next.js 16 New Features to Explore

After confirming stability:
- Improved performance metrics
- Enhanced App Router features
- Better TypeScript integration
- Turbopack improvements (if using)

## Resources

- [Next.js 15 Migration Guide](https://nextjs.org/docs/app/guides/upgrading/version-15)
- [Next.js 16 Release](https://nextjs.org/blog/next-16)
- [ESLint 9 Migration](https://eslint.org/docs/latest/use/migrate-to-9.0.0)
