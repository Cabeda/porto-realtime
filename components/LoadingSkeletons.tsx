export function MapSkeleton() {
  return (
    <div className="h-screen w-screen flex flex-col bg-gradient-to-b from-blue-50 to-white">
      {/* Header Skeleton */}
      <header className="bg-white shadow-sm z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="h-7 w-64 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 w-48 bg-gray-100 rounded animate-pulse mt-1"></div>
            </div>
            <div className="h-10 w-24 bg-blue-100 rounded-lg animate-pulse"></div>
          </div>
        </div>
      </header>

      {/* Map Skeleton */}
      <main className="flex-1 relative bg-gray-100">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600 text-sm">A carregar mapa...</p>
          </div>
        </div>

        {/* Control Buttons Skeleton */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
          <div className="h-12 w-44 bg-white rounded-lg shadow-lg animate-pulse"></div>
          <div className="h-12 w-44 bg-white rounded-lg shadow-lg animate-pulse"></div>
        </div>
      </main>
    </div>
  );
}

export function StationsSkeleton() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-8">
      <div className="w-full max-w-5xl">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-8">
          <div className="h-10 w-48 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-12 w-32 bg-blue-100 rounded-lg animate-pulse"></div>
        </div>

        {/* Content Skeleton */}
        <div className="space-y-8">
          {/* Closest Stations */}
          <div>
            <div className="h-8 w-56 bg-gray-200 rounded animate-pulse mb-4"></div>
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-32 bg-gray-100 rounded-md animate-pulse"></div>
              ))}
            </div>
          </div>

          {/* Favorites */}
          <div>
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-4"></div>
            <div className="h-20 bg-gray-100 rounded-md animate-pulse"></div>
          </div>

          {/* All Stations */}
          <div>
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-4"></div>
            <div className="h-12 bg-gray-100 rounded-md animate-pulse mb-4"></div>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-md animate-pulse"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
