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
        minPixelRatio: 1.75,
        maxPixelRatio: 2.5,
        flowStreakCount: 3,
        bubbleCount: 2,
        particleScale: 1,
        wakeTrailStep: 1,
        menuFps: 30
      },
      medium: {
        renderScale: 0.94,
        minPixelRatio: 1.5,
        maxPixelRatio: 2,
        flowStreakCount: 2,
        bubbleCount: 1,
        particleScale: 0.66,
        wakeTrailStep: 2,
        menuFps: 24
      },
      low: {
        renderScale: 0.88,
        minPixelRatio: 1.25,
        maxPixelRatio: 1.75,
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
    activeTile: "#e8c66f",
    activeTileTop: "#fff0c5",
    activeTileBottom: "#b97d3e",
    activeSolvedTile: "#b8dc63",
    solvedTileTop: "#e8f5a7",
    solvedTileBottom: "#6f9c43",
    inactiveTile: "rgba(225, 211, 176, 0.66)",
    inactiveTileTop: "rgba(255, 239, 204, 0.82)",
    inactiveTileBottom: "rgba(176, 143, 91, 0.62)",
    inactiveStroke: "rgba(122, 73, 62, 0.34)",
    solvedStroke: "#71853e",
    idleStroke: "#a9824f",
    tileShadow: "rgba(79, 57, 44, 0.11)",
    tileSide: "#9c7549",
    solvedTileSide: "#6f873d",
    tileHighlight: "rgba(255, 249, 229, 0.82)",
    tileTexture: "rgba(112, 69, 45, 0.16)",
    tileTextureLight: "rgba(255, 247, 211, 0.22)",
    tileTextureShade: "rgba(103, 66, 41, 0.12)",
    sandSpeck: "rgba(143, 91, 52, 0.52)",
    stoneTop: "#bbb39d",
    stoneShade: "#70685c",
    stoneWarm: "#c29a70",
    stoneLight: "#eee3ca",
    grassLight: "#b3c953",
    grassDark: "#58782e",
    wildflowerStem: "#6c7b35",
    wildflowerPink: "#d98d91",
    wildflowerYellow: "#d8a13b",
    wildflowerLavender: "#c69679",
    wildflowerWhite: "#fff8e8",
    channelBank: "#806f51",
    channelBedIdle: "#647f7a",
    channelBedActive: "#126e77",
    channelBedShadow: "#0a505b",
    matchedWater: "#18a9b5",
    matchedWaterDeep: "#0b7883",
    matchedWaterLight: "#49bfbd",
    idleWater: "#78c8c7",
    idleWaterDeep: "#58a5a7",
    idleWaterLight: "#9fd8d1",
    waterHighlight: "rgba(255, 253, 232, 0.86)",
    waterRefraction: "rgba(180, 245, 232, 0.38)",
    waterShade: "rgba(4, 74, 84, 0.24)",
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
