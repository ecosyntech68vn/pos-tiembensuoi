// ============================================================================
// dashboard.js — Aggregator for overview cards + chart data.
// Pure read-only; consumes Models. Returned shape is consumed by index.html
// Alpine binding.
// ============================================================================
(function (global) {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function pctChange(now, prev) {
    if (!prev) return now > 0 ? 100 : 0;
    return Math.round(((now - prev) / prev) * 100);
  }

  const Dashboard = {
    /** Snapshot of all dashboard data. Refresh on view enter / after import. */
    snapshot(branchId) {
      const today = Models.dailyRevenue(branchId, new Date());
      const yesterday = Models.yesterdayStats(branchId);
      const last7 = Models.revenueLastNDays(branchId, 7);
      const last30 = Models.revenueLastNDays(branchId, 30);
      const profit30 = Models.grossProfitLastNDays(branchId, 30);
      const ingCost30 = Models.ingredientCostLastNDays(branchId, 30);
      const lowStock = Models.lowStockWithRunRate(branchId, 30);
      const start7 = Utils.startOfDay(new Date(Date.now() - 6 * 86400000));
      const end7 = Utils.endOfDay(new Date());
      const topItems = Models.bestSellers(branchId, start7, end7, 5);
      const trend30 = Models.dailyRevenueSeries(branchId, 30);
      const anomalies = Models.detectAnomalies(branchId);

      return {
        today: {
          revenue: today.revenue,
          orders: today.orders,
          delta_pct: pctChange(today.revenue, yesterday.revenue),
          yesterday_revenue: yesterday.revenue,
        },
        last7: { revenue: last7.revenue, orders: last7.orders, avg_per_day: Math.round(last7.revenue / 7) },
        last30: { revenue: last30.revenue, orders: last30.orders },
        cost30: ingCost30,
        profit30,
        lowStock,
        topItems,
        trend30,
        anomalies,
      };
    },

    /** SVG line chart (frugal, no library). Returns inline SVG string. */
    renderLineChart(series, opts) {
      opts = opts || {};
      const w = opts.width || 600;
      const h = opts.height || 160;
      const pad = { top: 10, right: 10, bottom: 28, left: 50 };
      const innerW = w - pad.left - pad.right;
      const innerH = h - pad.top - pad.bottom;

      const values = series.map((s) => s.revenue);
      const maxV = Math.max(1, ...values);
      const stepX = innerW / Math.max(1, series.length - 1);

      const points = series.map((s, i) => {
        const x = pad.left + i * stepX;
        const y = pad.top + innerH - (s.revenue / maxV) * innerH;
        return `${x},${y}`;
      }).join(' ');

      // X-axis labels (show every 5th)
      const xLabels = series.map((s, i) => {
        if (i % 5 !== 0 && i !== series.length - 1) return '';
        const x = pad.left + i * stepX;
        return `<text x="${x}" y="${h - 8}" text-anchor="middle" font-size="9" fill="#6b7280">${escapeHtml(s.date_label)}</text>`;
      }).join('');

      const yMax = maxV.toLocaleString('vi-VN');
      const yMid = Math.round(maxV / 2).toLocaleString('vi-VN');

      return `
        <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
          <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + innerH}" stroke="#e5e7eb"/>
          <line x1="${pad.left}" y1="${pad.top + innerH}" x2="${pad.left + innerW}" y2="${pad.top + innerH}" stroke="#e5e7eb"/>
          <text x="${pad.left - 4}" y="${pad.top + 4}" text-anchor="end" font-size="9" fill="#6b7280">${yMax}</text>
          <text x="${pad.left - 4}" y="${pad.top + innerH/2 + 4}" text-anchor="end" font-size="9" fill="#6b7280">${yMid}</text>
          <text x="${pad.left - 4}" y="${pad.top + innerH + 4}" text-anchor="end" font-size="9" fill="#6b7280">0</text>
          <polyline points="${points}" fill="none" stroke="#16a34a" stroke-width="2" stroke-linejoin="round"/>
          ${series.map((s, i) => {
            const x = pad.left + i * stepX;
            const y = pad.top + innerH - (s.revenue / maxV) * innerH;
            return `<circle cx="${x}" cy="${y}" r="2" fill="#16a34a"/>`;
          }).join('')}
          ${xLabels}
        </svg>
      `;
    },

    /** SVG bar chart for top items by qty. */
    renderTopItemsBar(items, opts) {
      opts = opts || {};
      const w = opts.width || 600;
      const barH = 26, gap = 6;
      const labelW = 180;
      const valueW = 60;
      const innerW = w - labelW - valueW - 20;
      const h = items.length * (barH + gap) + 10;
      const maxQty = Math.max(1, ...items.map((i) => i.qty));
      const bars = items.map((it, i) => {
        const y = i * (barH + gap) + 5;
        const widthPx = Math.max(2, (it.qty / maxQty) * innerW);
        const name = escapeHtml(it.product_name || '').slice(0, 24);
        return `
          <text x="0" y="${y + barH * 0.7}" font-size="11" fill="#111827">${name}</text>
          <rect x="${labelW}" y="${y}" width="${widthPx}" height="${barH}" fill="#16a34a" rx="3"/>
          <text x="${labelW + widthPx + 4}" y="${y + barH * 0.7}" font-size="11" fill="#374151">${it.qty}</text>
        `;
      }).join('');
      return `
        <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
          ${bars}
        </svg>
      `;
    },
  };

  global.Dashboard = Dashboard;
})(window);
