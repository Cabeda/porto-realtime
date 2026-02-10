# Performance Testing Guide

## Running Performance Tests

### Prerequisites
```bash
pnpm install
```

### Run Tests
```bash
# Run performance tests
pnpm test:perf

# Run with UI (interactive mode)
pnpm test:perf:ui
```

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| First Contentful Paint (FCP) | <500ms | TBD |
| Time to Interactive (TTI) | <1000ms | TBD |
| API Response Time (/api/buses) | <200ms | TBD |
| API Response Time (/api/stations) | Deferred | N/A |

## Test Scenarios

### 1. Homepage Load Time
- **Test**: `homepage should load in less than 1 second`
- **Measures**: Total time from navigation to DOM ready
- **Target**: <1000ms

### 2. Initial UI Elements
- **Test**: `homepage should show initial UI elements immediately`
- **Measures**: Time until header and main content visible
- **Target**: <500ms (Time to Interactive)

### 3. Stations Page Load
- **Test**: `stations page should load in less than 1 second`
- **Measures**: Full page load including data fetch
- **Target**: <1000ms

### 4. Progressive Rendering
- **Test**: `map should render progressively`
- **Measures**: Map container appears before data loads
- **Success**: Skeleton UI visible immediately

## Optimization Strategies Implemented

### ✅ Phase 1: Critical Path (Completed)
1. **Deferred Stations API**: Only fetch when "Show Stops" clicked (-500ms)
2. **Skeleton Loading**: Instant visual feedback
3. **Production Logging**: No console.logs in prod (-50-100ms)
4. **Cache Headers**: s-maxage=10s, stale-while-revalidate=60s

### 🔄 Phase 2: Advanced (In Progress)
1. **Lazy Leaflet**: Dynamic import of map library
2. **Incremental Rendering**: Load buses in batches
3. **Code Splitting**: Route-based chunks
4. **Image Optimization**: loading="lazy" attributes

### 📋 Phase 3: Future
1. **Service Worker**: Offline caching with PWA
2. **Virtual Scrolling**: For large station lists
3. **HTTP/2 Push**: Critical assets
4. **WebP Images**: Smaller image formats

## Monitoring

### Response Time Headers
All API routes include `X-Response-Time` header:
```bash
curl -I http://localhost:3000/api/buses
# X-Response-Time: 145ms
```

### Browser DevTools
1. Open Chrome DevTools
2. Go to Performance tab
3. Record page load
4. Analyze FCP, TTI, LCP metrics

### Lighthouse CI
```bash
# Install Lighthouse
npm install -g @lhci/cli

# Run audit
lhci autorun
```

## Troubleshooting

### Slow API Responses
- Check network tab for API timing
- Verify cache headers are set
- Check for network throttling

### Slow Map Rendering
- Check number of markers (should be <100 initially)
- Verify incremental loading is working
- Check for JavaScript errors

### High Total Blocking Time
- Check for synchronous console.logs
- Verify production build (NODE_ENV=production)
- Check for large bundle sizes

## Best Practices

1. **Always test in production mode**: `pnpm build && pnpm start`
2. **Test with throttled network**: DevTools > Network > Slow 3G
3. **Test on mobile devices**: Real devices perform differently
4. **Monitor real user data**: Use analytics to track performance

## Resources
- [Web Vitals](https://web.dev/vitals/)
- [Playwright Performance Testing](https://playwright.dev/docs/test-timeouts)
- [Next.js Performance](https://nextjs.org/docs/pages/building-your-application/optimizing)
