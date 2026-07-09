import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "./config.js";

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

    return {
      ok: true,
      user: this.getCurrentUser()
    };
  }

  async login(username, password) {
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