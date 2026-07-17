/**
 * BaseWidget — abstract class all dashboard widgets extend.
 * Handles: loading states, error display, chart lifecycle,
 * data view toggle, and auto-refresh.
 */
import { api } from './api-client.js';

export class BaseWidget {
  /**
   * @param {string} widgetId   - unique DOM id prefix
   * @param {object} config     - { plantId, tenantId, dateFrom, dateTo, ... }
   * @param {object} chartRef   - { id: 'c-123' } canvas element id for Chart.js
   */
  constructor(widgetId, config = {}) {
    this.widgetId     = widgetId;
    this.config       = config;
    this.chart        = null;
    this.data         = null;
    this.isDataView   = false;
    this._refreshTimer = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────

  /** Override: return data from API */
  async fetchData() {
    throw new Error(`${this.constructor.name}.fetchData() not implemented`);
  }

  /** Override: build Chart.js instance from data */
  initChart(data) {
    throw new Error(`${this.constructor.name}.initChart() not implemented`);
  }

  /** Override: return HTML string for data table view */
  renderDataTable(data) {
    return '<p style="color:var(--text-muted);padding:16px">No data table available</p>';
  }

  // ── Rendering ─────────────────────────────────────────────

  async load() {
    this._showLoading();
    try {
      this.data = await this.fetchData();
      this._showContent();
      if (!this.isDataView) {
        this._destroyChart();
        requestAnimationFrame(() => this.initChart(this.data));
      } else {
        this._renderDataView();
      }
    } catch (err) {
      this._showError(err.message);
    }
  }

  async refresh() {
    await this.load();
  }

  toggleDataView() {
    this.isDataView = !this.isDataView;
    if (!this.data) return;
    if (this.isDataView) {
      this._destroyChart();
      this._renderDataView();
    } else {
      const dt = document.getElementById(`dt-${this.widgetId}`);
      const cv = document.getElementById(`c-${this.widgetId}`);
      if (dt) dt.style.display = 'none';
      if (cv) cv.style.display = 'block';
      requestAnimationFrame(() => this.initChart(this.data));
    }
  }

  destroy() {
    this._destroyChart();
    if (this._refreshTimer) clearInterval(this._refreshTimer);
  }

  startAutoRefresh(intervalMs = 300_000) {
    this.stopAutoRefresh();
    this._refreshTimer = setInterval(() => this.refresh(), intervalMs);
  }

  stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  // ── Private helpers ───────────────────────────────────────

  _destroyChart() {
    if (this.chart) {
      try { this.chart.destroy(); } catch (_) {}
      this.chart = null;
    }
  }

  _showLoading() {
    const el = document.getElementById(`loading-${this.widgetId}`);
    if (el) el.style.display = 'flex';
    const body = document.getElementById(`body-${this.widgetId}`);
    if (body) body.style.visibility = 'hidden';
  }

  _showContent() {
    const el = document.getElementById(`loading-${this.widgetId}`);
    if (el) el.style.display = 'none';
    const body = document.getElementById(`body-${this.widgetId}`);
    if (body) body.style.visibility = 'visible';
  }

  _showError(msg) {
    const el = document.getElementById(`loading-${this.widgetId}`);
    if (el) {
      el.style.display = 'flex';
      el.innerHTML = `<span style="color:var(--red);font-size:12px">⚠ ${msg}</span>`;
    }
  }

  _renderDataView() {
    const dt = document.getElementById(`dt-${this.widgetId}`);
    const cv = document.getElementById(`c-${this.widgetId}`);
    if (dt) {
      dt.innerHTML = this.renderDataTable(this.data);
      dt.style.display = 'block';
    }
    if (cv) cv.style.display = 'none';
  }

  // ── Shared chart defaults ──────────────────────────────────

  static chartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#6B8EAE', padding: 12, boxWidth: 9, boxHeight: 9, font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: '#0C1C2E',
          borderColor: '#1E3D65',
          borderWidth: 1,
          titleColor: '#6B8EAE',
          bodyColor: '#E8EDF5',
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          border: { display: false },
          grid: { color: '#152840' },
          ticks: { color: '#6B8EAE', font: { size: 11 } },
        },
        y: {
          border: { display: false },
          grid: { color: '#152840' },
          ticks: { color: '#6B8EAE', font: { size: 11 } },
        },
      },
    };
  }

  // ── Table helpers ─────────────────────────────────────────

  static tableHTML(headers, rows) {
    const ths = headers.map(h => `<th>${h}</th>`).join('');
    const trs = rows.map(row =>
      `<tr>${row.map((c, ci) => {
        const v = String(c ?? '—');
        const cls = v.startsWith('+') ? ' class="td-pos"' : v.startsWith('-') ? ' class="td-neg"' : '';
        return `<td${cls}>${v}</td>`;
      }).join('')}</tr>`
    ).join('');
    return `
      <div class="data-tbl-wrap">
        <table class="data-tbl">
          <thead><tr>${ths}</tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>`;
  }
}

export default BaseWidget;
