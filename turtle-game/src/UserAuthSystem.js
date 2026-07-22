import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "./config.js";

const DEVICE_SESSION_KEY = "zen-kaplumbaga-device-session-v1";
const DEVICE_KEY_DATABASE = "zen-kaplumbaga-device-keys";
const DEVICE_KEY_STORE = "crypto-keys";
const DEVICE_KEY_ID = "auth-session-key-v1";
const DEVICE_SESSION_AAD = "zen-kaplumbaga-auth-v1";
const PERSISTENT_SESSION_USERS = new Set(["seydayilmaz"]);

export class UserAuthSystem {
  constructor() {
    this.supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);

    this.currentUsername = null;
    this.currentPassword = null;

    this.currentProgress = {
      lastLevel: 1,
      bestByLevel: {}
    };
  }

  hasCurrentUser() {
    return Boolean(this.currentUsername && this.currentPassword);
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

    if (!validation.ok) {
      return validation;
    }

    const { data, error } = await this.supabase.rpc("register_player", {
      p_username: normalizedUsername,
      p_password: password
    });

    if (error) {
      return {
        ok: false,
        error: `Kayıt oluşturulamadı: ${error.message}`
      };
    }

    const result = this.normalizeRpcResponse(data);

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "Kayıt oluşturulamadı."
      };
    }

    this.setSession(normalizedUsername, password, result);
    await this.rememberDeviceSession(normalizedUsername, password);

    return {
      ok: true,
      user: this.getCurrentUser()
    };
  }

  async login(username, password, { remember = true } = {}) {
    const normalizedUsername = this.normalizeUsername(username);
    const validation = this.validateCredentials(normalizedUsername, password);

    if (!validation.ok) {
      return validation;
    }

    const { data, error } = await this.supabase.rpc("login_player", {
      p_username: normalizedUsername,
      p_password: password
    });

    if (error) {
      return {
        ok: false,
        error: `Giriş yapılamadı: ${error.message}`
      };
    }

    const result = this.normalizeRpcResponse(data);

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "Kullanıcı adı veya şifre hatalı."
      };
    }

    this.setSession(normalizedUsername, password, result);

    if (remember) {
      await this.rememberDeviceSession(normalizedUsername, password);
    }

    return {
      ok: true,
      user: this.getCurrentUser()
    };
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

    if (!Array.isArray(result)) {
      return {
        ok: true,
        records: []
      };
    }

    return {
      ok: true,
      records: result
    };
  }

  logout() {
    this.currentUsername = null;
    this.currentPassword = null;
    this.currentProgress = {
      lastLevel: 1,
      bestByLevel: {}
    };
    void this.forgetDeviceSession();
  }

  async restoreDeviceSession() {
    const credentials = await this.readDeviceSession();

    if (!credentials) {
      return { ok: false, restored: false };
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

    return { ...result, restored: true };
  }

  async rememberDeviceSession(username, password) {
    if (!PERSISTENT_SESSION_USERS.has(this.normalizeUsername(username))) {
      await this.forgetDeviceSession();
      return false;
    }

    if (!this.supportsSecureDeviceSession()) return false;

    try {
      const key = await this.getOrCreateDeviceKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const payload = new TextEncoder().encode(JSON.stringify({
        username,
        password
      }));
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
        version: 1,
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
        stored?.version !== 1 ||
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
      const password = typeof credentials?.password === "string"
        ? credentials.password
        : "";

      if (!this.validateCredentials(username, password).ok) {
        throw new Error("Invalid credentials");
      }

      if (!PERSISTENT_SESSION_USERS.has(username)) {
        throw new Error("Persistent session not enabled for this user");
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
        error: "Aktif kullanıcı yok."
      };
    }

    const safeProgress = {
      lastLevel: Number(progress.lastLevel) || 1,
      bestByLevel: progress.bestByLevel || {}
    };

    const { data, error } = await this.supabase.rpc("save_player_progress", {
      p_username: this.currentUsername,
      p_password: this.currentPassword,
      p_last_level: safeProgress.lastLevel,
      p_best_by_level: safeProgress.bestByLevel
    });

    if (error) {
      console.warn("Supabase kayıt hatası:", error.message);

      return {
        ok: false,
        error: error.message
      };
    }

    const result = this.normalizeRpcResponse(data);

    if (!result.ok) {
      console.warn("Supabase kayıt reddedildi:", result.error);

      return {
        ok: false,
        error: result.error || "Kayıt güncellenemedi."
      };
    }

    this.currentProgress = {
      lastLevel: Number(result.last_level) || safeProgress.lastLevel,
      bestByLevel: result.best_by_level || safeProgress.bestByLevel
    };

    return {
      ok: true,
      progress: this.currentProgress
    };
  }

  async clearProgressForCurrentUser() {
    if (!this.hasCurrentUser()) {
      return {
        ok: false,
        error: "Aktif kullanıcı yok."
      };
    }

    const { data, error } = await this.supabase.rpc("reset_player_progress", {
      p_username: this.currentUsername,
      p_password: this.currentPassword
    });

    if (error) {
      console.warn("Supabase reset hatası:", error.message);

      return {
        ok: false,
        error: error.message
      };
    }

    const result = this.normalizeRpcResponse(data);

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "Kayıt sıfırlanamadı."
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
    this.currentUsername = username;
    this.currentPassword = password;

    this.currentProgress = {
      lastLevel: Number(rpcResult.last_level) || 1,
      bestByLevel: rpcResult.best_by_level || {}
    };
  }

  validateCredentials(username, password) {
    if (!username || username.length < 3) {
      return {
        ok: false,
        error: "Kullanıcı adı en az 3 karakter olmalı."
      };
    }

    if (!/^[a-z0-9_.-]+$/.test(username)) {
      return {
        ok: false,
        error: "Kullanıcı adında sadece harf, rakam, nokta, tire ve alt çizgi kullan."
      };
    }

    if (!password || password.length < 4) {
      return {
        ok: false,
        error: "Şifre en az 4 karakter olmalı."
      };
    }

    return {
      ok: true
    };
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
        error: "Sunucudan boş cevap geldi."
      };
    }

    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch {
        return {
          ok: false,
          error: "Sunucu cevabı okunamadı."
        };
      }
    }

    return data;
  }
}
