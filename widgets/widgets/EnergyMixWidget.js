import { BaseWidget } from '../base-widget.js';
import { api } from '../api-client.js';

export default class EnergyMixWidget extends BaseWidget {
  async fetchData() {
    const { plantId, dateFrom, dateTo } = this.config;
    return api.compareGenerationSources({ plant_id: plantId, date_from: dateFrom, date_to: dateTo });
  }

  initChart(data) {
    const canvas = document.getElementById(`c-${this.widgetId}`);
    if (!canvas) return;
    const colors = { SOLAR: '#FFB800', WIND: '#3B9EFF', GRID: '#FF4B6E' };
    this.chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.source),
        datasets: [{
          data: data.map(d => d.share_pct),
          backgroundColor: data.map(d => colors[d.source] || '#8B5CF6'),
          borderColor: '#0C1C2E',
          borderWidth: 3,
          hoverOffset: 6,
        }],
      },
      options: {
        ...BaseWidget.chartDefaults(),
        cutout: '60%',
        scales: {},
        plugins: {
          legend: BaseWidget.chartDefaults().plugins.legend,
          tooltip: {
            ...BaseWidget.chartDefaults().plugins.tooltip,
            callbacks: { label: c => `${c.label}: ${c.parsed.toFixed(1)}%` },
          },
        },
      },
    });
  }

  renderDataTable(data) {
    return BaseWidget.tableHTML(
      ['Source', 'Share %', 'Total (kWh)', 'Losses (kWh)', 'Devices'],
      data.map(r => [
        r.source,
        r.share_pct + '%',
        (+r.total_kwh).toLocaleString('en-IN'),
        (+r.losses_kwh).toLocaleString('en-IN'),
        r.device_count,
      ])
    );
  }
}
