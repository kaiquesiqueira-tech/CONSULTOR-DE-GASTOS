/* =====================================================================
   DADOS: monta os itens (SD1 + SF4), guarda no navegador e calcula
   os agrupamentos usados nas telas.
   ===================================================================== */
(function (root) {
  'use strict';
  const R = root.Regras;
  const L = root.LeitorXlsx;

  function num(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    let s = String(v).trim();
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    const n = +s;
    return Number.isNaN(n) ? 0 : n;
  }

  /* ---------------- Monta a lista de itens ---------------- */
  function montarItens(base) {
    const mapaTes = R.montarMapaTes(base.sf4);
    const d = base.sd1.dados;
    const n = base.sd1.linhas;

    // descrição mais frequente de cada produto (algumas linhas vêm sem descrição)
    const contDesc = new Map();
    for (let i = 0; i < n; i++) {
      const p = R.codigo(d.produto[i], 0); const ds = R.texto(d.descricao[i]);
      if (!p || !ds) continue;
      let m = contDesc.get(p); if (!m) { m = new Map(); contDesc.set(p, m); }
      m.set(ds, (m.get(ds) || 0) + 1);
    }
    const descProd = new Map();
    contDesc.forEach((m, p) => { let best = '', bc = -1; m.forEach((c, ds) => { if (c > bc) { bc = c; best = ds; } }); descProd.set(p, best); });

    const itens = new Array(n);
    for (let i = 0; i < n; i++) {
      const fil = R.codigo(d.filial[i], 6);
      const tes = R.codigo(d.tes[i], 3);
      const cfop = R.texto(d.cfop[i]);
      const cfopNum = parseInt(cfop, 10) || 0;
      const reg = R.acharTes(mapaTes, fil, tes);
      const prod = R.codigo(d.produto[i], 0);
      const forn = R.codigo(d.fornecedor[i], 0);
      const loja = R.codigo(d.loja[i], 2);
      const dataIso = L.paraDataISO(d.data[i]);
      const vt = num(d.vlrTotal[i]);
      const ipi = num(d.vlrIpi[i]), st = num(d.icmsSt[i]), fr = num(d.frete[i]), sg = num(d.seguro[i]), dp = num(d.despesa[i]), dc = num(d.desconto[i]);
      const it = {
        i,
        fil, tes, cfop, cfopNum,
        prod,
        desc: R.texto(d.descricao[i]) || descProd.get(prod) || '',
        un: R.texto(d.unidade[i]),
        qtd: num(d.quantidade[i]),
        vu: num(d.vlrUnit[i]),
        vt,
        vc: vt - dc + ipi + st + fr + sg + dp, // valor completo
        cc: R.codigo(d.centroCusto[i], 0),
        cv: R.codigo(d.classeValor[i], 0),
        conta: R.codigo(d.contaContabil[i], 0),
        ped: R.codigo(d.pedido[i], 0),
        forn: forn ? forn + (loja ? '-' + loja : '') : '',
        doc: R.codigo(d.documento[i], 0),
        serie: R.texto(d.serie[i]),
        arm: R.codigo(d.armazem[i], 2),
        data: dataIso || '',
        ym: dataIso ? dataIso.slice(0, 7) : '',
        chaveTes: fil + '|' + tes,
        tesTexto: reg ? reg.texto : '',
        tesGeraDup: reg ? reg.geraDup : null,
        tesPoderTerc: reg ? reg.poderTerc : '',
      };
      it.motivoAuto = R.motivo(it, reg);
      it.natureza = R.natureza(it, reg);
      it.origem = R.origem(cfopNum);
      itens[i] = it;
    }
    return itens;
  }

  /** Aplica a regra automática + ajustes manuais por TES. */
  function aplicarAjustes(itens, ajustes) {
    for (const it of itens) {
      const aj = ajustes[it.chaveTes];
      if (aj === 'gasto') { it.gasto = true; it.motivo = 'GASTO'; it.ajustado = it.motivoAuto !== 'GASTO'; }
      else if (aj === 'fora') { it.gasto = false; it.motivo = it.motivoAuto === 'GASTO' ? 'AJUSTE_MANUAL' : it.motivoAuto; it.ajustado = it.motivoAuto === 'GASTO'; }
      else { it.gasto = it.motivoAuto === 'GASTO'; it.motivo = it.motivoAuto; it.ajustado = false; }
    }
  }

  /* ---------------- Agrupamentos ---------------- */
  function agrupar(lista, chaveFn, valorFn) {
    const m = new Map();
    for (const it of lista) {
      const k = chaveFn(it);
      let g = m.get(k);
      if (!g) { g = { chave: k, valor: 0, itens: 0 }; m.set(k, g); }
      g.valor += valorFn(it); g.itens++;
    }
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor);
  }

  function contarNotas(lista) {
    const s = new Set();
    for (const it of lista) s.add(it.fil + '|' + it.forn + '|' + it.doc + '|' + it.serie);
    return s.size;
  }

  /* ---------------- Preços ---------------- */
  /**
   * Analisa o preço unitário de cada produto (código + unidade) ao longo do tempo.
   * - Compras com preço muito fora do padrão (5x acima ou abaixo da mediana do produto)
   *   são marcadas e NÃO entram na conta (geralmente erro de unidade/quantidade na NF
   *   ou código genérico usado para itens diferentes).
   * - Preço inicial = média ponderada dos 3 primeiros meses com compra;
   *   preço atual  = média ponderada dos 3 últimos meses com compra.
   *   (Com menos de 6 meses de compra, compara o 1º mês com o último.)
   */
  function analisarPrecos(lista, opcoes) {
    const lim = (opcoes.limitePct || 5) / 100;
    const minCompras = opcoes.minimoCompras || 3;
    const fator = opcoes.fatorForaPadrao || 5;
    let dataMax = opcoes.dataRef || '';
    if (!dataMax) for (const it of lista) if (it.data > dataMax) dataMax = it.data;
    const corte12 = dataMax ? addMeses(dataMax, -12) : '';

    const grupos = new Map();
    for (const it of lista) {
      if (!(it.qtd > 0) || !(it.vu > 0) || !it.data) continue;
      const k = it.prod + '|' + it.un;
      let g = grupos.get(k);
      if (!g) { g = { chave: k, prod: it.prod, desc: it.desc, un: it.un, natureza: it.natureza, compras: [], gasto: 0, qtd: 0 }; grupos.set(k, g); }
      g.compras.push(it);
      g.gasto += it.vt; g.qtd += it.qtd;
    }
    const out = [];
    grupos.forEach((g) => {
      g.compras.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
      const precos = g.compras.map((c) => c.vu).sort((a, b) => a - b);
      const meio = precos.length >> 1;
      const mediana = precos.length % 2 ? precos[meio] : (precos[meio - 1] + precos[meio]) / 2;
      g.mediana = mediana;
      g.foraPadrao = new Set();
      const meses = new Map();
      let min = Infinity, max = -Infinity, sv = 0, sq = 0, qtd12 = 0;
      for (const c of g.compras) {
        if (c.vu > mediana * fator || c.vu < mediana / fator) { g.foraPadrao.add(c); continue; }
        let m = meses.get(c.ym); if (!m) { m = { ym: c.ym, sv: 0, sq: 0 }; meses.set(c.ym, m); }
        m.sv += c.vu * c.qtd; m.sq += c.qtd;
        if (c.vu < min) min = c.vu; if (c.vu > max) max = c.vu;
        sv += c.vu * c.qtd; sq += c.qtd;
        if (c.data > corte12) qtd12 += c.qtd;
      }
      const mesesOrd = Array.from(meses.values()).sort((a, b) => (a.ym < b.ym ? -1 : 1));
      if (!mesesOrd.length) return;
      const serie = mesesOrd.map((m) => ({ ym: m.ym, preco: m.sv / m.sq }));
      const jan = serie.length >= 6 ? 3 : 1;
      const media = (ms) => ms.reduce((s, m) => s + m.sv, 0) / ms.reduce((s, m) => s + m.sq, 0);
      const ini = mesesOrd.slice(0, jan), fim = mesesOrd.slice(-jan);
      g.serie = serie;
      g.validas = g.compras.filter((c) => !g.foraPadrao.has(c));
      g.nCompras = g.compras.length;
      g.janela = jan;
      g.precoIni = media(ini); g.ymIni = ini[0].ym; g.ymIni2 = ini[ini.length - 1].ym;
      g.precoFim = media(fim); g.ymFim = fim[fim.length - 1].ym; g.ymFim1 = fim[0].ym;
      g.precoMedio = sv / sq; g.precoMin = min; g.precoMax = max;
      g.ultimaCompra = g.validas[g.validas.length - 1];
      g.variacao = serie.length > 1 ? g.precoFim / g.precoIni - 1 : 0;
      if (g.validas.length < minCompras || serie.length < 2) g.tendencia = 'sem';
      else if (g.variacao >= lim) g.tendencia = 'sobe';
      else if (g.variacao <= -lim) g.tendencia = 'cai';
      else g.tendencia = 'estavel';
      g.qtd12 = qtd12;
      g.impacto = g.tendencia === 'sem' ? 0 : (g.precoFim - g.precoIni) * qtd12;
      out.push(g);
    });
    return out;
  }

  function addMeses(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10);
  }

  /* ---------------- Curva ABC ---------------- */
  function curvaAbc(lista, valorFn, corteA, corteB) {
    const m = new Map();
    let total = 0;
    for (const it of lista) {
      const k = it.prod + '|' + it.un;
      let g = m.get(k);
      if (!g) { g = { chave: k, prod: it.prod, desc: it.desc, un: it.un, natureza: it.natureza, gasto: 0, qtd: 0, compras: 0, maxVu: 0, sv: 0, sq: 0 }; m.set(k, g); }
      const v = valorFn(it);
      g.gasto += v; total += v; g.compras++;
      if (it.qtd > 0 && it.vu > 0) { g.qtd += it.qtd; g.sv += it.vu * it.qtd; g.sq += it.qtd; if (it.vu > g.maxVu) g.maxVu = it.vu; }
    }
    const arr = Array.from(m.values()).sort((a, b) => b.gasto - a.gasto);
    let acum = 0;
    for (const g of arr) {
      const antes = total ? acum / total * 100 : 0;
      acum += g.gasto;
      g.pct = total ? g.gasto / total * 100 : 0;
      g.pctAcum = total ? acum / total * 100 : 0;
      // a classe é decidida pelo acumulado ANTES do item (o item que cruza 80% ainda é A)
      g.classe = antes < corteA ? 'A' : antes < corteB ? 'B' : 'C';
      g.precoMedio = g.sq ? g.sv / g.sq : 0;
    }
    return { lista: arr, total };
  }

  /* ---------------- Armazenamento local (IndexedDB) ---------------- */
  const DB = 'consultor-gastos', STORE = 'base';
  function abrirDb() {
    return new Promise((ok, erro) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { erro(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => erro(req.error);
    });
  }
  async function salvarBase(base) {
    try {
      const db = await abrirDb();
      await new Promise((ok, erro) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(base, 'atual'); tx.oncomplete = ok; tx.onerror = () => erro(tx.error); });
      db.close();
      return true;
    } catch (e) { console.warn('Não consegui guardar os dados no navegador:', e); return false; }
  }
  async function carregarBase() {
    try {
      const db = await abrirDb();
      const v = await new Promise((ok, erro) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get('atual'); r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); });
      db.close();
      return v || null;
    } catch (e) { console.warn('Não consegui ler os dados guardados:', e); return null; }
  }
  async function apagarBase() {
    try {
      const db = await abrirDb();
      await new Promise((ok) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete('atual'); tx.oncomplete = ok; tx.onerror = ok; });
      db.close();
    } catch (e) { /* nada */ }
  }

  const api = { montarItens, aplicarAjustes, agrupar, contarNotas, analisarPrecos, curvaAbc, salvarBase, carregarBase, apagarBase, addMeses, num };
  root.Dados = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
