/* =====================================================================
   GRÁFICOS (Chart.js) - estilos padronizados, claro e escuro
   ===================================================================== */
(function (root) {
  'use strict';
  const inst = {};

  function tok(nome) { return getComputedStyle(document.body).getPropertyValue(nome).trim(); }

  function destruir(id) { if (inst[id]) { inst[id].destroy(); delete inst[id]; } }

  function fmtCompacto(v) {
    const a = Math.abs(v);
    const f = (x) => x.toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(x) < 1000 ? 1 : 0 });
    if (a >= 1e9) return 'R$ ' + f(v / 1e9) + ' bi';
    if (a >= 1e6) return 'R$ ' + f(v / 1e6) + ' mi';
    if (a >= 1e3) return 'R$ ' + f(v / 1e3) + ' mil';
    return 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }
  function fmtMoeda(v, casas) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas == null ? 2 : casas, maximumFractionDigits: casas == null ? 2 : casas });
  }

  function tooltipBase() {
    return {
      backgroundColor: tok('--surface'),
      borderColor: tok('--border-forte'),
      borderWidth: 1,
      titleColor: tok('--ink'),
      bodyColor: tok('--ink-2'),
      footerColor: tok('--muted'),
      titleFont: { weight: '600', size: 13 },
      bodyFont: { size: 12 },
      footerFont: { size: 11, weight: '400' },
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
      caretSize: 0,
    };
  }

  function eixos(horizontal, fmtValor) {
    const grade = { color: tok('--grid'), lineWidth: 1, drawTicks: false };
    const semGrade = { display: false };
    const borda = { color: tok('--axis') };
    const ticksValor = { color: tok('--muted'), font: { size: 11 }, padding: 6, maxTicksLimit: 6, callback: (v) => fmtValor(v) };
    const ticksCat = { color: tok('--ink-2'), font: { size: 11 }, padding: 6, autoSkip: !horizontal };
    if (horizontal) {
      return { x: { grid: grade, border: { display: false }, ticks: ticksValor, beginAtZero: true }, y: { grid: semGrade, border: borda, ticks: ticksCat } };
    }
    return { x: { grid: semGrade, border: borda, ticks: Object.assign({}, ticksCat, { maxRotation: 0 }) }, y: { grid: grade, border: { display: false }, ticks: ticksValor, beginAtZero: true } };
  }

  function cursorClicavel(clicavel) {
    return clicavel ? (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; } : undefined;
  }

  /**
   * Colunas verticais (uma série). opts: { parcial: índice do mês incompleto, aoClicar(i), rodape(i) }
   */
  function colunas(id, canvas, rotulos, valores, opts) {
    opts = opts || {};
    destruir(id);
    const cor = tok('--series-1'), corParcial = tok('--series-1-claro');
    inst[id] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rotulos,
        datasets: [{
          data: valores,
          backgroundColor: valores.map((v, i) => (i === opts.parcial ? corParcial : cor)),
          hoverBackgroundColor: valores.map((v, i) => (i === opts.parcial ? corParcial : tok('--series-1-forte'))),
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'start',
          maxBarThickness: 24,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
        layout: { padding: { top: 6 } },
        scales: eixos(false, fmtCompacto),
        plugins: {
          legend: { display: false },
          tooltip: Object.assign(tooltipBase(), {
            callbacks: {
              title: (it) => (opts.titulos ? opts.titulos[it[0].dataIndex] : it[0].label),
              label: (it) => fmtMoeda(it.raw),
              footer: (it) => (opts.rodape ? opts.rodape(it[0].dataIndex) : ''),
            },
          }),
        },
        onClick: opts.aoClicar ? (e, els) => { if (els.length) opts.aoClicar(els[0].index); } : undefined,
        onHover: cursorClicavel(!!opts.aoClicar),
      },
    });
    return inst[id];
  }

  /** Barras horizontais (ranking). opts: { aoClicar(i), rodape(i), titulos[] } */
  function barras(id, canvas, rotulos, valores, opts) {
    opts = opts || {};
    destruir(id);
    const cor = tok('--series-1');
    const curtos = rotulos.map((r) => (r.length > 30 ? r.slice(0, 29) + '…' : r));
    inst[id] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: curtos,
        datasets: [{
          data: valores,
          backgroundColor: cor,
          hoverBackgroundColor: tok('--series-1-forte'),
          borderRadius: { topRight: 4, bottomRight: 4 },
          borderSkipped: 'start',
          maxBarThickness: 18,
          categoryPercentage: 0.85,
          barPercentage: 0.9,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
        scales: eixos(true, fmtCompacto),
        plugins: {
          legend: { display: false },
          tooltip: Object.assign(tooltipBase(), {
            callbacks: {
              title: (it) => (opts.titulos ? opts.titulos[it[0].dataIndex] : rotulos[it[0].dataIndex]),
              label: (it) => fmtMoeda(it.raw),
              footer: (it) => (opts.rodape ? opts.rodape(it[0].dataIndex) : ''),
            },
          }),
        },
        onClick: opts.aoClicar ? (e, els) => { if (els.length) opts.aoClicar(els[0].index); } : undefined,
        onHover: cursorClicavel(!!opts.aoClicar),
      },
    });
    return inst[id];
  }

  /** Histórico de preço: cada compra (pontos) + média do mês (linha). */
  function historicoPreco(id, canvas, compras, serie, nomeMes, nomeForn) {
    destruir(id);
    const cor1 = tok('--series-1'), cor2 = tok('--series-2'), sup = tok('--surface');
    const t = (iso) => Date.parse(iso + 'T12:00:00Z');
    const pontos = compras.map((c) => ({ x: t(c.data), y: c.vu, c }));
    const linha = serie.map((s) => ({ x: t(s.ym + '-15'), y: s.preco, ym: s.ym }));
    const xs = pontos.map((p) => p.x).concat(linha.map((p) => p.x));
    const xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    const folga = Math.max(86400000 * 10, (xmax - xmin) * 0.03);
    const mesesTick = (v) => { if (v < xmin - 86400000 * 3 || v > xmax + 86400000 * 3) return ''; const d = new Date(v); return nomeMes(d.toISOString().slice(0, 7)); };
    inst[id] = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Média do mês', type: 'line', data: linha, borderColor: cor1, backgroundColor: cor1, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: sup, pointBorderWidth: 2, tension: 0, order: 1 },
          { label: 'Cada compra', data: pontos, backgroundColor: cor2, borderColor: sup, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, order: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { type: 'linear', min: xmin - folga, max: xmax + folga, grid: { display: false }, border: { color: tok('--axis') }, ticks: { color: tok('--muted'), font: { size: 11 }, maxTicksLimit: 8, callback: mesesTick } },
          y: { grid: { color: tok('--grid'), drawTicks: false }, border: { display: false }, ticks: { color: tok('--muted'), font: { size: 11 }, padding: 6, maxTicksLimit: 6, callback: (v) => fmtMoeda(v) } },
        },
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { color: tok('--ink-2'), boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 12 } } },
          tooltip: Object.assign(tooltipBase(), {
            callbacks: {
              title: (it) => {
                const r = it[0].raw;
                if (r.c) return new Date(r.x).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                return 'Média de ' + nomeMes(r.ym);
              },
              label: (it) => {
                const r = it.raw;
                if (r.c) return [fmtMoeda(r.y, r.y < 10 ? 4 : 2) + ' por ' + (r.c.un || 'un'), 'Qtd: ' + r.c.qtd.toLocaleString('pt-BR') + ' · NF ' + r.c.doc, 'Fornecedor: ' + nomeForn(r.c.forn)];
                return fmtMoeda(r.y, r.y < 10 ? 4 : 2);
              },
            },
          }),
        },
      },
    });
    return inst[id];
  }

  /** Mini-gráfico (sparkline) em SVG, para usar dentro de tabelas. */
  function sparkline(valores, classe) {
    const w = 84, h = 24, p = 3;
    if (!valores || valores.length < 2) return '<span class="spark-vazio">—</span>';
    const min = Math.min.apply(null, valores), max = Math.max.apply(null, valores);
    const amp = max - min || 1;
    const pts = valores.map((v, i) => [p + (i * (w - 2 * p)) / (valores.length - 1), h - p - ((v - min) / amp) * (h - 2 * p)]);
    const d = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    const ult = pts[pts.length - 1];
    return '<svg class="spark ' + (classe || '') + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d + '" /><circle cx="' + ult[0].toFixed(1) + '" cy="' + ult[1].toFixed(1) + '" r="2.5" /></svg>';
  }

  root.Graficos = { colunas, barras, historicoPreco, sparkline, destruir, fmtCompacto, fmtMoeda };
})(window);
