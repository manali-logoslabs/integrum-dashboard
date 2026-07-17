import { BaseWidget } from '../base-widget.js';
import { api } from '../api-client.js';

export default class BankingUtilWidget extends BaseWidget {
  async fetchData() {
    const { plantId, dateFrom, dateTo } = this.config;
    return api.getBankingMonthlySummary({ plant_id: plantId, month_from: dateFrom, month_to: dateTo });
  }

  initChart(data) {
    const canvas = document.getElementById(`c-${this.widgetId}`);
    if (!canvas) return;
    const C = BaseWidget.chartDefaults();
    const labels = data.map(r => r.month?.slice(0, 7));
    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar', label: 'Generation (kWh)',
            data: data.map(r => parseFloat(r.total_generation_kwh)),
            backgroundColor: 'rgba(0,196,140,.7)', borderRadius: 4, borderSkipped: false,
          },
          {
            type: 'bar', label: 'Matched (kWh)',
            data: data.map(r => parseFloat(r.total_matched_kwh)),
            backgroundColor: 'rgba(255,140,0,.7)', borderRadius: 4, borderSkipped: false,
          },
          {
            type: 'line', label: 'Match Rate %',
            data: data.map(r => r.match_rate_pct),
            borderColor: '#3B9EFF', backgroundColor: 'transparent',
            borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#3B9EFF',
            tension: 0.3, yAxisID: 'y2',
          },
        ],
      },
      options: {
        ...C,
        scales: {
          ...C.scales,
          y2: {
            border: { display: false },
            grid: { display: false },
            position: 'right',
            ticks: { color: '#6B8EAE', font: { size: 11 }, callback: v => `${v}%` },
            max: 100,
          },
        },
      },
    });
  }

  renderDataTable(data) {
    return BaseWidget.tableHTML(
      ['Month', 'Generation (kWh)', 'Matched (kWh)', 'Surplus (kWh)', 'Unmet (kWh)', 'Match %'],
      data.map(r => [
        r.month?.slice(0, 7),
        (+r.total_generation_kwh).toLocaleString('en-IN'),
        (+r.total_matched_kwh).toLocaleString('en-IN'),
        (+r.total_surplus_kwh).toLocaleString('en-IN'),
        (+r.unmet_demand_kwh).toLocaleString('en-IN'),
        r.match_rate_pct + '%',
      ])
    );
  }
}
