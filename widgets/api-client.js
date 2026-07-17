/**
 * Integrum Energy — API Client
 * Centralised fetch wrapper for all backend REST calls.
 * Usage: import { api } from './api-client.js'
 */

const BASE_URL = window.INTEGRUM_API_URL || 'http://localhost:8000/api';

class ApiClient {
  #token = null;

  setToken(token) { this.#token = token; }
  clearToken()    { this.#token = null; }

  async #request(method, path, body = null, params = {}) {
    const url = new URL(BASE_URL + path);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const headers = { 'Content-Type': 'application/json' };
    if (this.#token) headers['Authorization'] = `Bearer ${this.#token}`;

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new ApiError(res.status, err.detail || 'Request failed');
    }
    return res.json();
  }

  get(path, params)       { return this.#request('GET',    path, null, params); }
  post(path, body)        { return this.#request('POST',   path, body); }
  put(path, body)         { return this.#request('PUT',    path, body); }
  delete(path)            { return this.#request('DELETE', path); }

  // ── Auth ──────────────────────────────────────────────────
  async login(username, password) {
    const data = await this.post('/auth/login', { username, password });
    this.setToken(data.access_token);
    return data;
  }
  me() { return this.get('/auth/me'); }

  // ── Plants ────────────────────────────────────────────────
  listPlants(params = {})       { return this.get('/plants', params); }
  getPlant(plantId)             { return this.get(`/plants/${plantId}`); }
  getDevices(plantId, params)   { return this.get(`/plants/${plantId}/devices`, params); }

  // ── Generation ────────────────────────────────────────────
  getGenerationReadings(params) { return this.get('/generation', params); }
  getDailyGeneration(params)    { return this.get('/generation/daily', params); }
  getMonthlyGeneration(params)  { return this.get('/generation/monthly', params); }
  compareGenerationSources(params) { return this.get('/generation/compare', params); }

  // ── Settlement ────────────────────────────────────────────
  getSlotSummary(params)        { return this.get('/settlement/slot-summary', params); }
  getBankingSettlement(params)  { return this.get('/settlement/banking', params); }
  getBankingMonthlySummary(params) { return this.get('/settlement/banking/monthly-summary', params); }
  getDailyTodSummary(params)    { return this.get('/settlement/daily-tod', params); }

  // ── Savings ───────────────────────────────────────────────
  getSavings(params)            { return this.get('/savings', params); }
  getSavingsAggregate(params)   { return this.get('/savings/aggregate', params); }
  getEffectiveRate(params)      { return this.get('/savings/effective-rate', params); }
  getDiscomBills(params)        { return this.get('/savings/discom-bills', params); }
  getGridCost(params)           { return this.get('/savings/grid-cost', params); }
  getReCost(params)             { return this.get('/savings/re-cost', params); }

  // ── Performance ───────────────────────────────────────────
  getPerformanceMetrics(params) { return this.get('/performance', params); }
  getDeviceMetrics(params)      { return this.get('/performance/devices', params); }
  getPlfSummary(params)         { return this.get('/performance/plf-summary', params); }

  // ── Health ────────────────────────────────────────────────
  health() { return this.get('/health'); }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name   = 'ApiError';
  }
}

export const api = new ApiClient();
export default api;
