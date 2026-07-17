import { BaseWidget } from '../base-widget.js';
import { api } from '../api-client.js';

export default class SolarTrendWidget extends BaseWidget {
  async fetchData() {
    const { plantId, tenantId, dateFrom, dateTo } = this.config;
    const data = await api.getMonthlyGeneration({
      plant_id: plantId,
      source_type: 'SOLAR',
      date_from: dateFrom,
      date_to: dateTo,
    });
    return data;
  }

  initChart(data) {
    const canvas = document.getElementById(`c-${this.widgetId}`);
    if (!canvas) return;
    const C = BaseWidget.chartDefaults();
    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map(r => r.month?.slice(0, 7)),
        datasets: [
          {
            label: 'Solar Output (kWh)',
            data: data.map(r => parseFloat(r.total_generation_kwh)),
            borderColor: '#FFB800',
            backgroundColor: 'rgba(255,184,0,.13)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
          },
          {
            label: 'Gross (before losses)',
            data: data.map(r => parseFloat(r.gross_generation_kwh)),
            borderColor: 'rgba(255,184,0,.35)',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            pointRadius: 0,
            borderDash: [5, 4],
          },
        ],
      },
      options: C,
    });
  }

  renderDataTable(data) {
    return BaseWidget.tableHTML(
      ['Month', 'Generation (kWh)', 'Gross (kWh)', 'Losses (kWh)', 'Days'],
      data.map(r => [
        r.month?.slice(0, 7),
        (+r.total_generation_kwh).toLocaleString('en-IN'),
        (+r.gross_generation_kwh).toLocaleString('en-IN'),
        (+r.total_losses_kwh).toLocaleString('en-IN'),
        r.days_with_data,
      ])
    );
  }
}
