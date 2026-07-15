export const CONFIG = {
  canvasMaxSize: 800,
  desktopHexRadius: 46,
  mobileHexRadius: 34,
  mobileBreakpoint: 500,

  completionDelayMs: 900,

  // Local fallback için duruyor. Asıl kayıt artık Supabase.
  saveKey: "zen-kaplumbaga-progress-v1",

  turtle: {
    scaleReference: 43,
    maxScale: 1.06,
    offsetXRatio: 0.32,
    offsetYRatio: 0.20
  },

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
    activeTile: "#e8c96a",
    activeTileTop: "#f4e5a0",
    activeTileBottom: "#c69d43",
    activeSolvedTile: "#9fd48b",
    solvedTileTop: "#cce9aa",
    solvedTileBottom: "#57a05a",
    inactiveTile: "rgba(103, 153, 106, 0.40)",
    inactiveTileTop: "rgba(149, 189, 126, 0.50)",
    inactiveTileBottom: "rgba(48, 111, 76, 0.38)",
    inactiveStroke: "rgba(22, 74, 65, 0.36)",
    solvedStroke: "#347c4a",
    idleStroke: "#a17e38",
    tileShadow: "rgba(15, 63, 56, 0.26)",
    tileSide: "#9d7040",
    solvedTileSide: "#3e8050",
    tileHighlight: "rgba(255, 248, 203, 0.70)",
    tileTexture: "rgba(89, 88, 43, 0.15)",
    sandSpeck: "rgba(138, 96, 66, 0.46)",
    stoneTop: "#89978e",
    stoneShade: "#586b62",
    grassLight: "#6db563",
    grassDark: "#327647",
    wildflowerStem: "#3c824c",
    wildflowerPink: "#f07883",
    wildflowerYellow: "#f0c751",
    wildflowerLavender: "#a58ad0",
    wildflowerWhite: "#f4f0c9",
    channelBedIdle: "#679ca2",
    channelBedActive: "#147c91",
    matchedWater: "#22a9c3",
    idleWater: "#74d4df",
    waterHighlight: "rgba(245, 248, 223, 0.78)",
    connectionGlow: "rgba(104, 200, 116, 0.82)",
    turtleOutline: "#164a41",
    turtleSkin: "#9db75c",
    turtleSkinLight: "#d4dc7d",
    turtleSkinSpot: "rgba(66, 112, 49, 0.54)",
    turtleShell: "#286a4c",
    turtleShellLight: "#57a05a",
    turtleShellDark: "#174a3b",
    turtleShellSeam: "#e0b94f",
    turtleEye: "#68422d",
    flowerPetal: "#f07883",
    flowerCenter: "#f0c751",
    endpointCenter: "#edae3f"
  }
};
