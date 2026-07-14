export const CONFIG = {
  canvasMaxSize: 800,
  desktopHexRadius: 46,
  mobileHexRadius: 34,
  mobileBreakpoint: 500,

  completionDelayMs: 900,

  // Local fallback için duruyor. Asıl kayıt artık Supabase.
  saveKey: "zen-kaplumbaga-progress-v1",

  supabase: {
    url:  "https://dcpmbjmjlaafrwzxlmsx.supabase.co",
    anonKey:  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjcG1iam1qbGFhZnJ3enhsbXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NzgwNDksImV4cCI6MjA5OTE1NDA0OX0.fPmyjagZZ-b4g6zmRcHFsRDehjYv9wcLdUIkMgWNLkg"
  },

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
      if (level < 6) return 0.00;
      if (level < 12) return 0.05;
      return 0.08;
    },

    getTargetMoves(activeTileCount, level) {
      return Math.ceil(activeTileCount * 2.2 + Math.min(level, 12));
    }
  },

  colors: {
    activeTile: "#fff8c9",
    activeTileTop: "#fffde8",
    activeTileBottom: "#eadc8c",
    activeSolvedTile: "#dff5d8",
    solvedTileTop: "#f4ffef",
    solvedTileBottom: "#94cf92",
    inactiveTile: "rgba(235, 228, 166, 0.42)",
    inactiveTileTop: "rgba(255, 253, 220, 0.52)",
    inactiveTileBottom: "rgba(168, 184, 132, 0.34)",
    inactiveStroke: "rgba(126, 159, 120, 0.28)",
    solvedStroke: "#78bd7c",
    idleStroke: "#d6cc82",
    tileShadow: "rgba(48, 78, 54, 0.16)",
    tileSide: "#c9bd70",
    solvedTileSide: "#73ad77",
    tileHighlight: "rgba(255, 255, 255, 0.72)",
    tileTexture: "rgba(91, 115, 72, 0.10)",
    sandSpeck: "rgba(166, 137, 65, 0.34)",
    stoneTop: "#a8b6ad",
    stoneShade: "#70837a",
    grassLight: "#78b66d",
    grassDark: "#3f8551",
    channelBedIdle: "#8eb8b5",
    channelBedActive: "#167f9a",
    matchedWater: "#29b6f6",
    idleWater: "#b8e1e7",
    waterHighlight: "rgba(255, 255, 255, 0.68)",
    connectionGlow: "rgba(113, 214, 144, 0.78)",
    flowerPetal: "#ff80ab",
    flowerCenter: "#ffd54f",
    endpointCenter: "#ffca28"
  }
};
