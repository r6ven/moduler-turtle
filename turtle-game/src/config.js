export const CONFIG = {
  canvasMaxSize: 800,
  desktopHexRadius: 46,
  mobileHexRadius: 34,
  mobileBreakpoint: 500,

  // Local fallback için duruyor. Asıl kayıt artık Supabase.
  saveKey: "zen-kaplumbaga-progress-v1",

  turtle: {
    scaleReference: 43,
    maxScale: 1.06,
    offsetXRatio: 0.32,
    offsetYRatio: 0.20
  },

  performance: {
    sampleSize: 120,
    evaluationIntervalMs: 2500,
    downgradeWindows: 2,
    upgradeWindows: 4,
    thresholds: {
      highToMedium: 52,
      mediumToLow: 40,
      mediumToHigh: 57,
      lowToMedium: 50
    },
    profiles: {
      high: {
        renderScale: 1,
        maxPixelRatio: 2,
        flowStreakCount: 3,
        bubbleCount: 2,
        particleScale: 1,
        wakeTrailStep: 1,
        menuFps: 30
      },
      medium: {
        renderScale: 0.86,
        maxPixelRatio: 1.6,
        flowStreakCount: 2,
        bubbleCount: 1,
        particleScale: 0.66,
        wakeTrailStep: 2,
        menuFps: 24
      },
      low: {
        renderScale: 0.72,
        maxPixelRatio: 1.25,
        flowStreakCount: 1,
        bubbleCount: 0,
        particleScale: 0.4,
        wakeTrailStep: 3,
        menuFps: 20
      }
    }
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
    activeTile: "#e0c98f",
    activeTileTop: "#f4e7c8",
    activeTileBottom: "#b99458",
    activeSolvedTile: "#b8d66f",
    solvedTileTop: "#dce9a7",
    solvedTileBottom: "#809a45",
    inactiveTile: "rgba(218, 205, 171, 0.58)",
    inactiveTileTop: "rgba(242, 226, 194, 0.72)",
    inactiveTileBottom: "rgba(174, 148, 100, 0.54)",
    inactiveStroke: "rgba(122, 73, 62, 0.34)",
    solvedStroke: "#71853e",
    idleStroke: "#a9824f",
    tileShadow: "rgba(79, 57, 44, 0.24)",
    tileSide: "#9c7549",
    solvedTileSide: "#6f873d",
    tileHighlight: "rgba(255, 249, 229, 0.82)",
    tileTexture: "rgba(122, 73, 62, 0.12)",
    tileTextureLight: "rgba(255, 250, 231, 0.28)",
    tileTextureShade: "rgba(113, 78, 54, 0.085)",
    sandSpeck: "rgba(143, 105, 73, 0.42)",
    stoneTop: "#aaa493",
    stoneShade: "#746b5f",
    stoneWarm: "#b69472",
    stoneLight: "#d9d1bd",
    grassLight: "#9daa4f",
    grassDark: "#65752f",
    wildflowerStem: "#6c7b35",
    wildflowerPink: "#d98d91",
    wildflowerYellow: "#d8a13b",
    wildflowerLavender: "#c69679",
    wildflowerWhite: "#fff8e8",
    channelBedIdle: "#7f9997",
    channelBedActive: "#176e78",
    channelBedShadow: "#10555e",
    matchedWater: "#168f9c",
    matchedWaterDeep: "#0b6d78",
    matchedWaterLight: "#4fb8b8",
    idleWater: "#75bec0",
    idleWaterDeep: "#4d979a",
    idleWaterLight: "#a8d9d3",
    waterHighlight: "rgba(255, 248, 232, 0.80)",
    turtleWaterShadow: "rgba(25, 100, 105, 0.38)",
    turtleWake: "rgba(244, 249, 224, 0.80)",
    sourceCore: "#d8f4e8",
    sinkCore: "#164f55",
    connectionGlow: "rgba(184, 214, 111, 0.78)",
    turtleOutline: "#35564b",
    turtleSkin: "#a8a94e",
    turtleSkinLight: "#d1d278",
    turtleSkinSpot: "rgba(95, 112, 49, 0.50)",
    turtleShell: "#287d79",
    turtleShellLight: "#4a9c8f",
    turtleShellDark: "#18565a",
    turtleShellSeam: "#d7a33f",
    flowerPetal: "#d98d91",
    flowerCenter: "#d8a13b",
    endpointCenter: "#d28b3d"
  }
};
