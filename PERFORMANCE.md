# Performance Optimization Plan

## Current Issues
1. ❌ Leaflet CSS loaded synchronously (blocks render)
2. ❌ Stations API fetches 1000+ stops immediately (not needed initially)
3. ❌ No skeleton/progressive loading UI
4. ❌ Verbose console.logs in production
5. ❌ Leaflet library loaded in useEffect (causes flicker)
6. ❌ No lazy loading of components
7. ❌ No image optimization
8. ❌ API responses not cached at edge

## Optimization Strategy

### Phase 1: Critical Path Optimization (Target: <500ms First Paint)
- [ ] Move Leaflet CSS to dynamic import
- [ ] Show skeleton UI immediately (no data dependency)
- [ ] Defer stations API call (only fetch when "Show Stops" clicked)
- [ ] Add loading=lazy to images
- [ ] Remove console.logs from production

### Phase 2: Progressive Enhancement (Target: <1s Interactive)
- [ ] Lazy load Leaflet library on page load (not useEffect)
- [ ] Add route-based code splitting
- [ ] Implement incremental bus loading (load 10 at a time)
- [ ] Add stale-while-revalidate headers to APIs

### Phase 3: Advanced Optimizations
- [ ] Implement virtual scrolling for station list
- [ ] Add service worker for offline caching
- [ ] Compress API responses with gzip
- [ ] Optimize map tile loading strategy

## Performance Budget
- First Contentful Paint (FCP): <500ms
- Time to Interactive (TTI): <1000ms
- Largest Contentful Paint (LCP): <1500ms
- Total Blocking Time (TBT): <200ms
