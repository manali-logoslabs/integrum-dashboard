/**
 * GenConsWidget — Generation vs Consumption
 * Fetches daily generation (solar + wind) and consumption,
 * renders a dual-line Chart.js chart wired to the real API.
 */
import { BaseWidget } from '../base-widget.js';
import { api } from '../api-client.js';

export default class GenConsWidget extends BaseWidget {
  async fetchData() {
    const { plantId, tenantId, dateFrom, dateTo } = this.config;
    const [gen, banking] = await Promise.all([
      api.getDailyGeneration({ plant_id: plantId, date_from: dateFrom, date_to: dateTo }),
      api.getBankingMonthlySummary({ plant_id: plantId, month_from: dateFrom, month_to: dateTo }),
    ]);

    // Aggregate all sources (solar + wind) per day
    const byDate = {};
    for (const r of gen) {
      const d = r.reading_date;
      byDate[d] = byDate[d] || { gen: 0, cons: 0 };
      byDate[d].gen += parseFloat(r.total_kwh || 0);
    }
    for (const r of banking) {
      const d = r.month?.slice(0, 7); // YYYY-MM
      if (byDate[d]) byDate[d].cons += parseFloat(r.total_matched_kwh || 0);
    }

    const dates  = Object.keys(byDate).sort();
    return {
      labels:  dates,
      genData: dates.map(d => byDate[d].gen),
      conData: dates.map(d => byDate[d].cons),
    };
  }

  initChart(data) {
    const canvas = document.getElementById(`c-${this.widgetId}`);
    if (!canvas) return;
    const C = BaseWidget.chartDefaults();
    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Generation (kWh)',
            data: data.genData,
            borderColor: '#00C48C',
            backgroundColor: 'rgba(0,196,140,.12)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
          },
          {
            label: 'Consumption (kWh)',
            data: data.conData,
            borderColor: '#3B9EFF',
            backgroundColor: 'rgba(59,158,255,.08)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
            borderDash: [5, 3],
          },
        ],
      },
      options: C,
    });
  }

  renderDataTable(data) {
    const rows = data.labels.map((d, i) => [
      d,
      data.genData[i].toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' kWh',
      data.conData[i].toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' kWh',
      ((data.genData[i] - data.conData[i]) >= 0 ? '+' : '') +
        (data.genData[i] - data.conData[i]).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' kWh',
    ]);
    return BaseWidget.tableHTML(
      ['Date', 'Generation (kWh)', 'Consumption (kWh)', 'Surplus / Deficit'],
      rows
    );
  }
}
