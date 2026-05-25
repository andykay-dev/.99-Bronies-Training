// ────────────────────────────────────────────────────────────
//  window.storage shim — robust three-tier fallback
//
//  Tier 1: localStorage  (persists across tabs and restarts)
//  Tier 2: sessionStorage (persists within the browser session)
//  Tier 3: in-memory Map  (survives for the current page load only)
//
//  Chrome mobile in certain privacy modes blocks localStorage.
//  This shim tries each tier in order and uses the best available
//  one, so the app always works even if storage is restricted.
//
//  The API mirrors Claude.ai's window.storage exactly:
//    await window.storage.get(key)    → { value } | null
//    await window.storage.set(key, v) → { value }
//    await window.storage.delete(key) → { deleted: true }
//    await window.storage.list(pfx)   → { keys: [] }
// ────────────────────────────────────────────────────────────

const PREFIX = "bronies.";
function safeKey(k) { return PREFIX + String(k); }

// Test which storage tier is actually writable
function detectStorage() {
  const testKey = "__bronies_test__";
  const testVal = "1";
  // Try localStorage first
  try {
    localStorage.setItem(testKey, testVal);
    if (localStorage.getItem(testKey) === testVal) {
      localStorage.removeItem(testKey);
      return localStorage;
    }
  } catch (e) { /* blocked */ }
  // Fall back to sessionStorage
  try {
    sessionStorage.setItem(testKey, testVal);
    if (sessionStorage.getItem(testKey) === testVal) {
      sessionStorage.removeItem(testKey);
      console.warn("[.99 Training] localStorage unavailable — using sessionStorage (data won't persist across browser restarts)");
      return sessionStorage;
    }
  } catch (e) { /* blocked */ }
  // Last resort: in-memory Map
  console.warn("[.99 Training] localStorage and sessionStorage unavailable — using in-memory storage (data will be lost on page refresh)");
  return null; // signals to use the in-memory fallback
}

// In-memory fallback Map
const memStore = new Map();

// Detect the best available storage once, at module load time
const store = detectStorage();

function storageGet(key) {
  if (store) return store.getItem(safeKey(key));
  return memStore.get(safeKey(key)) ?? null;
}

function storageSet(key, value) {
  const k = safeKey(key);
  const v = String(value);
  if (store) {
    try {
      store.setItem(k, v);
      return;
    } catch (e) {
      // QuotaExceededError — try to clear old items and retry once
      if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED") {
        console.warn("[.99 Training] Storage quota exceeded — clearing old data and retrying");
        try {
          // Only remove our own keys
          const toRemove = [];
          for (let i = 0; i < store.length; i++) {
            const k2 = store.key(i);
            if (k2?.startsWith(PREFIX)) toRemove.push(k2);
          }
          // Remove all but the most important ones (keep profile and event)
          toRemove
            .filter(k2 => !k2.includes("profile") && !k2.includes("event"))
            .forEach(k2 => store.removeItem(k2));
          store.setItem(k, v);
          return;
        } catch (e2) { /* give up on native storage */ }
      }
    }
  }
  memStore.set(k, v);
}

function storageDelete(key) {
  const k = safeKey(key);
  if (store) {
    try { store.removeItem(k); } catch(e) {}
  }
  memStore.delete(k);
}

function storageList(prefix) {
  const wantPrefix = safeKey(prefix || "");
  const out = [];
  if (store) {
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k?.startsWith(wantPrefix)) out.push(k.slice(PREFIX.length));
      }
    } catch (e) {}
  } else {
    memStore.forEach((_, k) => {
      if (k.startsWith(wantPrefix)) out.push(k.slice(PREFIX.length));
    });
  }
  return out;
}

if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      try {
        const raw = storageGet(key);
        if (raw === null || raw === undefined) return null;
        return { value: raw };
      } catch (err) {
        console.error("[.99 Training] storage.get failed", key, err);
        return null;
      }
    },
    async set(key, value) {
      try {
        storageSet(key, value);
        return { value };
      } catch (err) {
        console.error("[.99 Training] storage.set failed", key, err);
        return null;
      }
    },
    async delete(key) {
      try {
        storageDelete(key);
        return { deleted: true };
      } catch (err) {
        console.error("[.99 Training] storage.delete failed", key, err);
        return null;
      }
    },
    async list(prefix) {
      try {
        return { keys: storageList(prefix) };
      } catch (err) {
        console.error("[.99 Training] storage.list failed", err);
        return { keys: [] };
      }
    },
  };
}
