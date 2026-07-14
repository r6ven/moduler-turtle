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
    activeTile: "#dccf91",
    activeTileTop: "#f0e6b5",
    activeTileBottom: "#a9975f",
    activeSolvedTile: "#b9d79f",
    solvedTileTop: "#dcebc5",
    solvedTileBottom: "#6f9c68",
    inactiveTile: "rgba(173, 185, 128, 0.40)",
    inactiveTileTop: "rgba(222, 216, 163, 0.50)",
    inactiveTileBottom: "rgba(105, 126, 83, 0.36)",
    inactiveStroke: "rgba(66, 101, 72, 0.32)",
    solvedStroke: "#527e52",
    idleStroke: "#97875a",
    tileShadow: "rgba(24, 62, 49, 0.24)",
    tileSide: "#8f754a",
    solvedTileSide: "#4f744f",
    tileHighlight: "rgba(255, 250, 218, 0.62)",
    tileTexture: "rgba(78, 91, 54, 0.14)",
    sandSpeck: "rgba(121, 91, 47, 0.40)",
    stoneTop: "#9b9c84",
    stoneShade: "#626f62",
    grassLight: "#719a5e",
    grassDark: "#3e704d",
    wildflowerStem: "#467a4d",
    wildflowerPink: "#df7580",
    wildflowerYellow: "#e4b849",
    wildflowerLavender: "#9889c2",
    wildflowerWhite: "#f4efd7",
    channelBedIdle: "#78989a",
    channelBedActive: "#276f80",
    matchedWater: "#2d9db2",
    idleWater: "#9fcbd0",
    waterHighlight: "rgba(238, 245, 220, 0.72)",
    connectionGlow: "rgba(131, 179, 112, 0.76)",
    turtleOutline: "#173f35",
    turtleSkin: "#8fa85a",
    turtleSkinLight: "#c3cd73",
    turtleSkinSpot: "rgba(70, 102, 48, 0.52)",
    turtleShell: "#315f45",
    turtleShellLight: "#4f7e4d",
    turtleShellDark: "#1f493b",
    turtleShellSeam: "#caa95b",
    turtleEye: "#5d3c2c",
    flowerPetal: "#df7580",
    flowerCenter: "#e7bd55",
    endpointCenter: "#e8aa46"
  }
};
