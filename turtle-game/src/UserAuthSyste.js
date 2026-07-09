import { CONFIG } from "./config.js";

export class UserAuthSystem {
  constructor() {
    this.store = this.loadStore();
  }

  hasCurrentUser() {
    return Boolean(this.store.currentUser && this.store.users[this.store.currentUser]);
  }

  getCurrentUser() {
    if (!this.hasCurrentUser()) return null;
    return this.store.users[this.store.currentUser];
  }

  getCurrentUsername() {
    const user = this.getCurrentUser();
    return user ? user.username : null;
  }

  async register(username, password) {
    const normalizedUsername = this.normalizeUsername(username);
    const validation = this.validateCredentials(normalizedUsername, password);

    if (!validation.ok) {
      return validation;
    }

    if (this.store.users[normalizedUsername]) {
      return { ok: false, error: "Bu kullanıcı adı zaten kayıtlı." };
    }

    const salt = this.createSalt();
    const passwordHash = await this.hashPassword(password, salt);

    this.store.users[normalizedUsername] = {
      username: normalizedUsername,
      salt,
      passwordHash,
      progress: {
        lastLevel: 1,
        bestByLevel: {}
      }
    };

    this.store.currentUser = normalizedUsername;
    this.saveStore();

    return { ok: true, user: this.store.users[normalizedUsername] };
  }

  async login(username, password) {
    const normalizedUsername = this.normalizeUsername(username);
    const user = this.store.users[normalizedUsername];

    if (!user) {
      return { ok: false, error: "Kullanıcı bulunamadı." };
    }

    const passwordHash = await this.hashPassword(password, user.salt);

    if (passwordHash !== user.passwordHash) {
      return { ok: false, error: "Şifre hatalı." };
    }

    this.store.currentUser = normalizedUsername;
    this.saveStore();

    return { ok: true, user };
  }

  logout() {
    this.store.currentUser = null;
    this.saveStore();
  }

  loadProgressForCurrentUser() {
    const user = this.getCurrentUser();

    if (!user || !user.progress) {
      return {
        lastLevel: 1,
        bestByLevel: {}
      };
    }

    return {
      lastLevel: Number(user.progress.lastLevel) || 1,
      bestByLevel: user.progress.bestByLevel || {}
    };
  }

  saveProgressForCurrentUser(progress) {
    if (!this.hasCurrentUser()) return;

    const key = this.store.currentUser;
    this.store.users[key].progress = {
      lastLevel: Number(progress.lastLevel) || 1,
      bestByLevel: progress.bestByLevel || {}
    };

    this.saveStore();
  }

  clearProgressForCurrentUser() {
    if (!this.hasCurrentUser()) return;

    const key = this.store.currentUser;
    this.store.users[key].progress = {
      lastLevel: 1,
      bestByLevel: {}
    };

    this.saveStore();
  }

  validateCredentials(username, password) {
    if (!username || username.length < 3) {
      return { ok: false, error: "Kullanıcı adı en az 3 karakter olmalı." };
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return { ok: false, error: "Kullanıcı adında sadece harf, rakam, nokta, tire ve alt çizgi kullan." };
    }

    if (!password || password.length < 4) {
      return { ok: false, error: "Şifre en az 4 karakter olmalı." };
    }

    return { ok: true };
  }

  normalizeUsername(username) {
    return String(username || "")
      .trim()
      .toLowerCase();
  }

  createSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${salt}:${password}`);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  loadStore() {
    try {
      const raw = localStorage.getItem(CONFIG.authKey);

      if (!raw) {
        return {
          currentUser: null,
          users: {}
        };
      }

      const parsed = JSON.parse(raw);

      return {
        currentUser: parsed.currentUser || null,
        users: parsed.users || {}
      };
    } catch {
      return {
        currentUser: null,
        users: {}
      };
    }
  }

  saveStore() {
    try {
      localStorage.setItem(CONFIG.authKey, JSON.stringify(this.store));
    } catch {
      // Kayıt başarısızsa oyunu bozmuyoruz.
    }
  }
}