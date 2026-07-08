export const CONFIG = {
  canvasMaxSize: 800,
  desktopHexRadius: 46,
  mobileHexRadius: 34,
  mobileBreakpoint: 500,

  completionDelayMs: 900,
  saveKey: "zen-kaplumbaga-progress-v1",

  difficulty: {
    getMapRadius(level) {
      return level >= 3 ? 3 : 2;
    },

    getActiveTileCount(level, mapRadius, totalTileCount) {
      if (mapRadius === 2) {
        return Math.min(10 + level, 13, totalTileCount);
      }

      return Math.min(14 + level, 24, totalTileCount);
    },

    getExtraLoopChance(level) {
      // Düşük tutuyoruz. Fazla döngü görseli kirletir.
      if (level < 6) return 0.00;
      if (level < 12) return 0.05;
      return 0.08;
    },

    getTargetMoves(activeTileCount, level) {
      return Math.ceil(activeTileCount * 2.2 + Math.min(level, 12));
    }
  },

  colors: {
    activeTile: "#fff9c4",
    activeSolvedTile: "#e8f5e9",
    inactiveTile: "rgba(255, 249, 196, 0.42)",
    inactiveStroke: "rgba(165, 214, 167, 0.28)",
    solvedStroke: "#a5d6a7",
    idleStroke: "#f0f4c3",
    matchedWater: "#29b6f6",
    idleWater: "#b3e5fc",
    flowerPetal: "#ff80ab",
    flowerCenter: "#ffd54f",
    endpointCenter: "#ffca28"
  }
};
