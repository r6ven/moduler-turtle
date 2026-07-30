import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "./config.js";

const DEVICE_SESSION_KEY = "zen-kaplumbaga-device-session-v1";
const DEVICE_KEY_DATABASE = "zen-kaplumbaga-device-keys";
const DEVICE_KEY_STORE = "crypto-keys";
const DEVICE_KEY_ID = "auth-session-key-v1";
const DEVICE_SESSION_AAD = "zen-kaplumbaga-auth-v1";
const PERSISTENT_SESSION_USERS = new Set(["seydayilmaz"]);

export class UserAuthSystem {
  constructor({ supabase = null } = {}) {
    this.supabase = supabase || createClient(
      CONFIG.supabase.url,
      CONFIG.supabase.anonKey
    );

    this.currentUsername = null;
    this.currentPassword = null;
    this.currentSessionToken = null;
    this.currentSessionExpiresAt = null;
    this.currentProgress = {
      lastLevel: 1,
      bestByLevel: {}
    };
  }

  hasCurrentUser() {
    return Boolean(
      this.currentUsername &&
      (this.currentSessionToken || this.currentPassword)
    );
  }

  hasRememberedDeviceSession() {
    try {
      return Boolean(localStorage.getItem(DEVICE_SESSION_KEY));
    } catch {
      return false;
    }
  }

  usesSessionToken() {
    return Boolean(this.currentSessionToken);
  }

  getCurrentUsername() {
    return this.currentUsername;
  }

  getCurrentUser() {
    if (!this.hasCurrentUser()) return null;

    return {
      username: this.currentUsername,
      progress: this.currentProgress
    };
  }

  async register(username, password) {
    const normalizedUsername = this.normalizeUsername(username);
    const validation = this.validateCredentials(normalizedUsername, password);

    if (!validation.ok) return validation;

    const sessionAttempt = await this.authenticateWithSessionRpc(
      "register_player_session",
      normalizedUsername,
      password
    );

    if (sessionAttempt.available) {
      if (!sessionAttempt.ok) {
        return {
          ok: false,
          error: sessionAttempt.error || "KayÄ±t oluÅŸturulamadÄ±."
        };
      }

      this.setTokenSession(normalizedUsername, sessionAttempt.result);
      await this.rememberDeviceSession(normalizedUsername);

      return { ok: true, user: this.getCurrentUser() };
    }

    const { data, error } = await this.supabase.rpc("register_player", {
      p_username: normalizedUsername,
      p_password: password
    });

    if (error) {
      return {
        ok: false,
        error: `KayÄ±t oluÅŸturulamadÄ±: ${error.message}`
      };
    }

    const result = this.normalizeRpcResponse(data);

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "KayÄ±t oluÅŸturulamadÄ±."
      };
    }

    this.setLegacySession(normalizedUsername, password, result);
    await this.rememberDeviceSession(normalizedUsername, password);

    return { ok: true, user: this.getCurrentUser() };
  }

  async login(username, password, { remember = true } = {}) {
    const normalizedUsername = this.normalizeUsername(username);
    const validation = this.validateCredentials(normalizedUsername, password);

    if (!validation.ok) return validation;

    const sessionAttempt = await this.authenticateWithSessionRpc(
      "login_player_session",
      normalizedUsername,
      password
    );

    if (sessionAttempt.available) {
      if (!sessionAttempt.ok) {
        return {
          ok: false,
          error: sessionAttempt.error || "KullanÄ±cÄ± adÄ± veya ÅŸifre hatalÄ±."
        };
      }

      this.setTokenSession(normalizedUsername, sessionAttempt.result);

      if (remember) {
        await this.rememberDeviceSession(normalizedUsername);
      }

      return { ok: true, user: this.getCurrentUser() };
    }

    const { data, error } = await this.supabase.rpc("login_player", {
      p_username: normalizedUsername,
      p_password: password
    });

    if (error) {
      return {
        ok: false,
        error: `GiriÅŸ yapÄ±lamadÄ±: ${error.message}`
      };
    }

    const result = this.normalizeRpcResponse(data);

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "KullanÄ±cÄ± adÄ± veya ÅŸifre hatalÄ±."
      };
    }

    this.setLegacySession(normalizedUsername, password, result);

    if (remember) {
      await this.rememberDeviceSession(normalizedUsername, password);
    }

    return { ok: true, user: this.getCurrentUser() };
  }

  async authenticateWithSessionRpc(rpcName, username, password) {
    const { data, error } = await this.supabase.rpc(rpcName, {
      p_username: username,
      p_password: password
    });

    if (error && this.isMissingRpcError(error)) {
      return { available: false, ok: false };
    }

    if (error) {
      return {
        available: true,
        ok: false,
        error: error.message
      };
    }

    const result = this.normalizeRpcResponse(data);

    return {
      available: true,
      ok: Boolean(result.ok && result.session_token),
      error: result.error,
      result
    };
  }

  isMissingRpcError(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "").toLowerCase();

    return (
      code === "PGRST202" ||
      code === "42883" ||
      message.includes("could not find the function") ||
      message.includes("does not exist")
    );
  }

  async getLeaderboard() {
    const { data, error } = await this.supabase.rpc("get_leaderboard");

    if (error) {
      return {
        ok: false,
        error: error.message,
        records: []
      };
    }

    const result = this.normalizeRpcResponse(data);

    return {
      ok: true,
      records: Array.isArray(result) ? result : []
    };
  }


  async callRankedRpc(name, args = {}) {
    if (!this.currentSessionToken) {
      return {
        ok: false,
        error: "Dereceli Sprint i\u00e7in g\u00fcvenli oturum gerekli."
      };
    }

    const { data, error } = await this.supabase.rpc(name, {
      p_session_token: this.currentSessionToken,
      ...args
    });

    if (error) return { ok: false, error: error.message };
    return this.normalizeRpcResponse(data);
  }

  claimRankedSprint() {
    return this.callRankedRpc("claim_ranked_sprint_attempt");
  }

  startRankedSprintAttempt(attemptId) {
    return this.callRankedRpc("start_ranked_sprint_attempt", {
      p_attempt_id: attemptId
    });
  }

  submitRankedPuzzle(attemptId, slot, moves, checksum) {
    return this.callRankedRpc("submit_ranked_puzzle_result", {
      p_attempt_id: attemptId,
      p_slot: slot,
      p_moves: moves,
      p_checksum: checksum
    });
  }

  invalidateRankedSprint(attemptId, reason) {
    const args = {
      p_session_token: this.currentSessionToken,
      p_attempt_id: attemptId,
      p_reason: String(reason || "client_invalidated")
    };

    try {
      void fetch(`${CONFIG.supabase.url}/rest/v1/rpc/invalidate_ranked_sprint_attempt`, {
        method: "POST",
        keepalive: true,
        headers: {
          apikey: CONFIG.supabase.anonKey,
          authorization: `Bearer ${CONFIG.supabase.anonKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(args)
      });
    } catch {
      // The unique daily attempt still prevents a reloaded run from ranking.
    }

    return this.callRankedRpc("invalidate_ranked_sprint_attempt", {
      p_attempt_id: attemptId,
      p_reason: args.p_reason
    });
  }

  async getRankedLeaderboards() {
    const daily = await this.callRankedRpc("get_ranked_daily_leaderboard");
    const monthly = await this.callRankedRpc("get_ranked_monthly_leaderboard");
    return {
      ok: Boolean(daily.ok && monthly.ok),
      daily: Array.isArray(daily.records) ? daily.records : [],
      monthly: Array.isArray(monthly.records) ? monthly.records : [],
      provisional: daily.provisional !== false,
      error: daily.error || monthly.error || ""
    };
  }

  async getStoryV2Leaderboard() {
    const { data, error } = await this.supabase.rpc("get_story_v2_leaderboard");
    if (error) return { ok: false, error: error.message, records: [] };
    const result = this.normalizeRpcResponse(data);
    return { ok: result.ok !== false, error: result.error || "", records: Array.isArray(result.records) ? result.records : Array.isArray(result) ? result : [] };
  }

  saveStoryV2Result(level, result) {
    if (!this.currentSessionToken) return Promise.resolve({ ok: false, error: "secure_session_required" });
    return this.supabase.rpc("save_story_v2_result", {
      p_session_token: this.currentSessionToken,
      p_level: level,
      p_puzzle_id: `story-v2-${level}`,
      p_stars: result.stars,
      p_moves: result.moves,
      p_time_seconds: result.timeSeconds
    }).then(({ data, error }) => error ? { ok: false, error: error.message } : this.normalizeRpcResponse(data));
  }

  logout() {
    const sessionToken = this.currentSessionToken;

    this.clearSession();
    void this.forgetDeviceSession();

    if (sessionToken) {
      void this.revokeSessionToken(sessionToken);
    }
  }

  async revokeSessionToken(sessionToken) {
    try {
      await this.supabase.rpc("logout_player_session", {
        p_session_token: sessionToken
      });
    } catch {
      // The server-side expiry still limits an unreached logout request.
    }
  }

  clearSession() {
    this.currentUsername = null;
    this.currentPassword = null;
    this.currentSessionToken = null;
    this.currentSessionExpiresAt = null;
    this.currentProgress = {
      lastLevel: 1,
      bestByLevel: {}
    };
  }

  async restoreDeviceSession() {
    const credentials = await this.readDeviceSession();

    if (!credentials) {
      return { ok: false, restored: false };
    }

    if (credentials.sessionToken) {
      const { data, error } = await this.supabase.rpc(
        "restore_player_session",
        { p_session_token: credentials.sessionToken }
      );

      if (error) {
        await this.forgetDeviceSession();
        return { ok: false, restored: false };
      }

      const result = this.normalizeRpcResponse(data);

      if (!result.ok) {
        await this.forgetDeviceSession();
        return { ok: false, restored: false };
      }

      this.setTokenSession(credentials.username, {
        ...result,
        session_token: credentials.sessionToken
      });

      return {
        ok: true,
        restored: true,
        user: this.getCurrentUser()
      };
    }

    const result = await this.login(
      credentials.username,
      credentials.password,
      { remember: false }
    );

    if (!result.ok) {
      await this.forgetDeviceSession();
      return { ok: false, restored: false };
    }

    await this.rememberDeviceSession(
      credentials.username,
      credentials.password
    );

    return { ...result, restored: true };
  }

  async rememberDeviceSession(username, password = null) {
    if (!PERSISTENT_SESSION_USERS.has(this.normalizeUsername(username))) {
      await this.forgetDeviceSession();
      return false;
    }

    if (!this.supportsSecureDeviceSession()) return false;

    const credentials = this.currentSessionToken
      ? {
          version: 2,
          username,
          sessionToken: this.currentSessionToken,
          expiresAt: this.currentSessionExpiresAt
        }
      : {
          version: 1,
          username,
          password
        };

    if (!credentials.sessionToken && !credentials.password) return false;

    try {
      const key = await this.getOrCreateDeviceKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const payload = new TextEncoder().encode(JSON.stringify(credentials));
      const encrypted = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: new TextEncoder().encode(DEVICE_SESSION_AAD)
        },
        key,
        payload
      );

      localStorage.setItem(DEVICE_SESSION_KEY, JSON.stringify({
        version: 2,
        iv: this.bytesToBase64(iv),
        ciphertext: this.bytesToBase64(new Uint8Array(encrypted))
      }));

      return true;
    } catch {
      await this.forgetDeviceSession();
      return false;
    }
  }

  async readDeviceSession() {
    if (!this.supportsSecureDeviceSession()) return null;

    try {
      const raw = localStorage.getItem(DEVICE_SESSION_KEY);

      if (!raw) return null;

      const stored = JSON.parse(raw);

      if (
        ![1, 2].includes(stored?.version) ||
        typeof stored.iv !== "string" ||
        typeof stored.ciphertext !== "string"
      ) {
        throw new Error("Invalid device session");
      }

      const key = await this.getOrCreateDeviceKey();
      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: this.base64ToBytes(stored.iv),
          additionalData: new TextEncoder().encode(DEVICE_SESSION_AAD)
        },
        key,
        this.base64ToBytes(stored.ciphertext)
      );
      const credentials = JSON.parse(new TextDecoder().decode(decrypted));
      const username = this.normalizeUsername(credentials?.username);

      if (!PERSISTENT_SESSION_USERS.has(username)) {
        throw new Error("Persistent session not enabled for this user");
      }

      if (
        credentials?.version === 2 &&
        typeof credentials.sessionToken === "string" &&
        credentials.sessionToken.length >= 32
      ) {
        return {
          username,
          sessionToken: credentials.sessionToken,
          expiresAt: credentials.expiresAt || null
        };
      }

      const password = typeof credentials?.password === "string"
        ? credentials.password
        : "";

      if (!this.validateCredentials(username, password).ok) {
        throw new Error("Invalid credentials");
      }

      return { username, password };
    } catch {
      await this.forgetDeviceSession();
      return null;
    }
  }

  async forgetDeviceSession() {
    try {
      localStorage.removeItem(DEVICE_SESSION_KEY);
    } catch {
      // Storage may be unavailable in private or restricted browser modes.
    }
  }

  supportsSecureDeviceSession() {
    try {
      return Boolean(
        globalThis.crypto?.subtle &&
        globalThis.indexedDB &&
        globalThis.localStorage
      );
    } catch {
      return false;
    }
  }

  async getOrCreateDeviceKey() {
    const database = await this.openDeviceKeyDatabase();
    const existingKey = await this.readDeviceKey(database);

    if (existingKey) {
      database.close();
      return existingKey;
    }

    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    await this.writeDeviceKey(database, key);
    database.close();
    return key;
  }

  openDeviceKeyDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DEVICE_KEY_DATABASE, 1);

      request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(DEVICE_KEY_STORE)) {
          database.createObjectStore(DEVICE_KEY_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Device key database blocked"));
    });
  }

  readDeviceKey(database) {
    return new Promise((resolve, reject) => {
      const request = database
        .transaction(DEVICE_KEY_STORE, "readonly")
        .objectStore(DEVICE_KEY_STORE)
        .get(DEVICE_KEY_ID);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  writeDeviceKey(database, key) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DEVICE_KEY_STORE, "readwrite");

      transaction.objectStore(DEVICE_KEY_STORE).put(key, DEVICE_KEY_ID);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  bytesToBase64(bytes) {
    let binary = "";

    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });

    return btoa(binary);
  }

  base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  loadProgressForCurrentUser() {
    return {
      lastLevel: Number(this.currentProgress.lastLevel) || 1,
      bestByLevel: this.currentProgress.bestByLevel || {}
    };
  }

  async saveProgressForCurrentUser(progress) {
    if (!this.hasCurrentUser()) {
      return {
        ok: false,
        error: "Aktif kullanÄ±cÄ± yok."
      };
    }

    const safeProgress = {
      lastLevel: Number(progress.lastLevel) || 1,
      bestByLevel: progress.bestByLevel || {}
    };
    const tokenMode = this.usesSessionToken();
    const rpcName = tokenMode
      ? "save_player_progress_session"
      : "save_player_progress";
    const rpcArgs = tokenMode
      ? {
          p_session_token: this.currentSessionToken,
          p_last_level: safeProgress.lastLevel,
          p_best_by_level: safeProgress.bestByLevel
        }
      : {
          p_username: this.currentUsername,
          p_password: this.currentPassword,
          p_last_level: safeProgress.lastLevel,
          p_best_by_level: safeProgress.bestByLevel
        };
    const { data, error } = await this.supabase.rpc(rpcName, rpcArgs);

    if (error) {
      console.warn("Supabase kayÄ±t hatasÄ±:", error.message);
      return { ok: false, error: error.message };
    }

    const result = this.normalizeRpcResponse(data);

    if (!result.ok) {
      console.warn("Supabase kayÄ±t reddedildi:", result.error);
      return {
        ok: false,
        error: result.error || "KayÄ±t gÃ¼ncellenemedi."
      };
    }

    this.applyProgressFromRpc({
      last_level: Number(result.last_level) || safeProgress.lastLevel,
      best_by_level: result.best_by_level || safeProgress.bestByLevel
    });

    return {
      ok: true,
      progress: this.currentProgress
    };
  }

  async clearProgressForCurrentUser() {
    if (!this.hasCurrentUser()) {
      return {
        ok: false,
        error: "Aktif kullanÄ±cÄ± yok."
      };
    }

    const tokenMode = this.usesSessionToken();
    const rpcName = tokenMode
      ? "reset_player_progress_session"
      : "reset_player_progress";
    const rpcArgs = tokenMode
      ? { p_session_token: this.currentSessionToken }
      : {
          p_username: this.currentUsername,
          p_password: this.currentPassword
        };
    const { data, error } = await this.supabase.rpc(rpcName, rpcArgs);

    if (error) {
      console.warn("Supabase reset hatasÄ±:", error.message);
      return { ok: false, error: error.message };
    }

    const result = this.normalizeRpcResponse(data);

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "KayÄ±t sÄ±fÄ±rlanamadÄ±."
      };
    }

    this.currentProgress = {
      lastLevel: 1,
      bestByLevel: {}
    };

    return {
      ok: true,
      progress: this.currentProgress
    };
  }

  setSession(username, password, rpcResult) {
    this.setLegacySession(username, password, rpcResult);
  }

  setLegacySession(username, password, rpcResult) {
    this.currentUsername = username;
    this.currentPassword = password;
    this.currentSessionToken = null;
    this.currentSessionExpiresAt = null;
    this.applyProgressFromRpc(rpcResult);
  }

  setTokenSession(username, rpcResult) {
    this.currentUsername = username;
    this.currentPassword = null;
    this.currentSessionToken = rpcResult.session_token;
    this.currentSessionExpiresAt = rpcResult.session_expires_at || null;
    this.applyProgressFromRpc(rpcResult);
  }

  applyProgressFromRpc(rpcResult) {
    this.currentProgress = {
      lastLevel: Number(rpcResult.last_level) || 1,
      bestByLevel: rpcResult.best_by_level || {}
    };
  }

  validateCredentials(username, password) {
    if (!username || username.length < 3) {
      return {
        ok: false,
        error: "KullanÄ±cÄ± adÄ± en az 3 karakter olmalÄ±."
      };
    }

    if (!/^[a-z0-9_.-]+$/.test(username)) {
      return {
        ok: false,
        error: "KullanÄ±cÄ± adÄ±nda sadece harf, rakam, nokta, tire ve alt Ã§izgi kullan."
      };
    }

    if (!password || password.length < 4) {
      return {
        ok: false,
        error: "Åifre en az 4 karakter olmalÄ±."
      };
    }

    return { ok: true };
  }

  normalizeUsername(username) {
    return String(username || "")
      .trim()
      .toLowerCase();
  }

  normalizeRpcResponse(data) {
    if (!data) {
      return {
        ok: false,
        error: "Sunucudan boÅŸ cevap geldi."
      };
    }

    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch {
        return {
          ok: false,
          error: "Sunucu cevabÄ± okunamadÄ±."
        };
      }
    }

    return data;
  }
}
