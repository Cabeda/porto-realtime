export const translations = {
  // Map page (/)
  map: {
    busesCount: (count: number) => `${count} autocarros`,
    loading: "A carregar...",
    hideStops: "Esconder paragens",
    showStops: "Mostrar paragens",
    stopsUnavailable: "Dados de paragens indisponíveis",
    refreshTitle: "Clique para atualizar autocarros e localização",
    centerMapTitle: "Centrar mapa na minha localização",
    geolocationNotSupported: "Geolocalização não é suportada pelo seu navegador",
    locationPermissionDenied: "Permissão de localização negada - usando localização padrão do Porto",
    unableToGetLocation: "Não foi possível obter a sua localização",
    locationRefreshFailed: "Atualização da localização falhou, mantendo localização atual",
    route: "Rota",
    destination: "Destino",
    speed: "Velocidade",
    lastUpdated: "Última atualização",
    kmh: "km/h",
    errorLoadingBuses: "Falha ao carregar dados de autocarros. Por favor, tente novamente mais tarde.",
    stopsUnavailableError: "Paragens de autocarro indisponíveis. O mapa mostra apenas autocarros.",
    loadingBusLocations: "A carregar localizações de autocarros...",
    filterRoutes: "Filtrar linhas",
    allRoutes: "Todas as linhas",
    clearFilters: "Limpar filtros",
    routesSelected: (count: number) => `${count} linha${count !== 1 ? 's' : ''} selecionada${count !== 1 ? 's' : ''}`,
  },
  
  // Stations page (/stations)
  stations: {
    title: "Estações",
    favorites: "Favoritas",
    noFavorites: "Sem favoritas",
    noFavoritesDesc: "Adicione estações aos favoritos clicando na estrela",
    closestStations: "Estações Próximas",
    allStations: "Todas as Estações",
    filterPlaceholder: "Filtrar estações por nome",
    addToFavorites: "Adicionar aos favoritos",
    removeFromFavorites: "Remover dos favoritos",
    geolocationNotSupported: "Geolocalização não é suportada por este navegador",
    km: "km",
    loading: "A carregar estações...",
    errorLoading: "Ocorreu um erro ao carregar os dados.",
  },
  
  // Station detail page (/station)
  station: {
    loading: "A carregar...",
    noData: "Sem dados disponíveis",
    noDepartures: "Sem partidas previstas",
    alreadyLeft: "Já partiu",
    minutes: (min: number) => `${min} min`,
    addToFavorites: "Adicionar aos favoritos",
    removeFromFavorites: "Remover dos favoritos",
    realtime: "Tempo real",
    scheduled: "Agendado",
    leaves: "Partida",
    route: "Linha",
    destination: "Destino",
  },
  
  // Layout/Navigation
  nav: {
    stations: "Estações",
    map: "Mapa",
  },
};

export type TranslationsType = typeof translations;
