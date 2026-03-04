/**
 * FuelBunk Pro — API Client (Drop-in replacement for FuelDB)
 *
 * This module replaces the IndexedDB-based FuelDB class with REST API calls.
 * It has the SAME interface as FuelDB so existing frontend code works without changes.
 *
 * USAGE: Include this BEFORE app.js, and it overrides the FuelDB class.
 *
 * SECURITY: Token stored in memory only. All requests go through sanitized API.
 */

const API_BASE = '/api';
let _authToken = null;
let _tenantId = null;

// ═══════════════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════════════
function setAuthToken(token) {
  _authToken = token;
}
function getAuthToken() {
  return _authToken;
}
function setTenantId(id) {
  _tenantId = id;
}
function getTenantId() {
  return _tenantId;
}
function clearAuth() {
  _authToken = null;
  _tenantId = null;
}

// ═══════════════════════════════════════════
// FETCH WRAPPER WITH AUTH
// ═══════════════════════════════════════════
async function apiFetch(path, options = {}) {
  const url = API_BASE + path;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (_authToken) {
    headers['Authorization'] = 'Bearer ' + _authToken;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    // Session expired — trigger logout
    if (typeof appLogout === 'function') {
      appLogout();
    }
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || err.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════
// AUTH API
// ═══════════════════════════════════════════
const AuthAPI = {
  async superLogin(username, password) {
    const result = await apiFetch('/auth/super-login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (result.token) setAuthToken(result.token);
    return result;
  },

  async adminLogin(username, password, tenantId) {
    const result = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, tenantId })
    });
    if (result.token) {
      setAuthToken(result.token);
      setTenantId(tenantId);
    }
    return result;
  },

  async employeeLogin(pin, tenantId) {
    const result = await apiFetch('/auth/employee-login', {
      method: 'POST',
      body: JSON.stringify({ pin, tenantId })
    });
    if (result.token) {
      setAuthToken(result.token);
      setTenantId(tenantId);
    }
    return result;
  },

  async logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (e) { /* best effort */ }
    clearAuth();
  },

  async checkSession() {
    return apiFetch('/auth/session');
  },

  async changeSuperPassword(newUsername, newPassword, confirmPassword) {
    return apiFetch('/auth/super-change-password', {
      method: 'POST',
      body: JSON.stringify({ newUsername, newPassword, confirmPassword })
    });
  },

  async changePassword(newPassword) {
    return apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword })
    });
  }
};

// ═══════════════════════════════════════════
// TENANT API
// ═══════════════════════════════════════════
const TenantAPI = {
  async list() {
    return apiFetch('/tenants/list');
  },

  async create(data) {
    return apiFetch('/data/tenants', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async update(id, data) {
    return apiFetch('/data/tenants/' + id, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async remove(id) {
    return apiFetch('/data/tenants/' + id, {
      method: 'DELETE'
    });
  },

  async getAdmins(tenantId) {
    return apiFetch('/data/tenants/' + tenantId + '/admins');
  },

  async addAdmin(tenantId, data) {
    return apiFetch('/data/tenants/' + tenantId + '/admins', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async removeAdmin(tenantId, userId) {
    return apiFetch('/data/tenants/' + tenantId + '/admins/' + userId, {
      method: 'DELETE'
    });
  },

  async resetAdminPassword(tenantId, userId, newPassword) {
    return apiFetch('/data/tenants/' + tenantId + '/admins/' + userId + '/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword })
    });
  }
};

// ═══════════════════════════════════════════
// FuelDB — DROP-IN REPLACEMENT
// Same interface as the IndexedDB FuelDB class
// ═══════════════════════════════════════════
class FuelDB {
  constructor(dbName) {
    this.db = true; // Flag that DB is "open"
    this.ready = Promise.resolve(); // Already ready
    this._dbName = dbName;
  }

  // Get all records from a store
  async getAll(storeName) {
    try {
      return await apiFetch('/data/' + storeName);
    } catch (e) {
      console.warn('[FuelDB] getAll error:', storeName, e.message);
      return [];
    }
  }

  // Get a single record by key
  async get(storeName, key) {
    try {
      return await apiFetch('/data/' + storeName + '/' + encodeURIComponent(key));
    } catch (e) {
      return undefined;
    }
  }

  // Put (upsert) a record
  async put(storeName, data) {
    const result = await apiFetch('/data/' + storeName, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return result.id;
  }

  // Add a new record (auto-increment ID)
  async add(storeName, data) {
    const result = await apiFetch('/data/' + storeName, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.id;
  }

  // Delete a record by key
  async delete(storeName, key) {
    await apiFetch('/data/' + storeName + '/' + encodeURIComponent(key), {
      method: 'DELETE'
    });
  }

  // Clear all records in a store
  async clear(storeName) {
    await apiFetch('/data/' + storeName, {
      method: 'DELETE'
    });
  }

  // Count records
  async count(storeName) {
    const all = await this.getAll(storeName);
    return all.length;
  }

  // Query by index
  async getByIndex(storeName, indexName, value) {
    try {
      return await apiFetch(
        '/data/' + storeName + '/by-index/' +
        encodeURIComponent(indexName) + '/' +
        encodeURIComponent(value)
      );
    } catch (e) {
      return [];
    }
  }

  // Bulk insert/update
  async bulkPut(storeName, items) {
    await apiFetch('/data/' + storeName + '/bulk', {
      method: 'PUT',
      body: JSON.stringify(items)
    });
  }

  // Settings helpers
  async getSetting(key, defaultVal = null) {
    try {
      const result = await apiFetch('/data/settings/key/' + encodeURIComponent(key));
      return result.value !== null ? result.value : defaultVal;
    } catch {
      return defaultVal;
    }
  }

  async setSetting(key, value) {
    await apiFetch('/data/settings/key/' + encodeURIComponent(key), {
      method: 'PUT',
      body: JSON.stringify({ value })
    });
  }
}

// ═══════════════════════════════════════════
// OVERRIDE GLOBALS
// ═══════════════════════════════════════════
// Replace localStorage-based tenant functions with API calls
// These match the mt_* functions in the original frontend

window._apiAuthToken = null;

// Override mt_getTenants to use API
const _origMtGetTenants = typeof mt_getTenants === 'function' ? mt_getTenants : null;
window.mt_getTenants_api = async function() {
  try {
    return await TenantAPI.list();
  } catch {
    // Fallback to localStorage if server unreachable
    return _origMtGetTenants ? _origMtGetTenants() : [];
  }
};

// Health check
async function checkServerHealth() {
  try {
    const result = await apiFetch('/health');
    return result.status === 'ok';
  } catch {
    return false;
  }
}

// Make available globally
window.AuthAPI = AuthAPI;
window.TenantAPI = TenantAPI;
window.FuelDB = FuelDB;
window.apiFetch = apiFetch;
window.setAuthToken = setAuthToken;
window.getAuthToken = getAuthToken;
window.setTenantId = setTenantId;
window.clearAuth = clearAuth;
window.checkServerHealth = checkServerHealth;

console.log('[FuelDB] API adapter loaded — REST mode');
