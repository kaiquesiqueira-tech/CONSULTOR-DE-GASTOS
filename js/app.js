/* =====================================================================
   CONSULTOR DE GASTOS - interface
   ===================================================================== */
(function () {
  'use strict';
  const C = window.CONFIG, R = window.Regras, D = window.Dados, L = window.LeitorXlsx, G = window.Graficos;
  const VERSAO = 1;
  const VAZIO = '∅';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  /* ---------------- Estado ---------------- */
  const estado = {
    base: null,
    itens: [],
    meses: [],
    mesParcial: '',
    dataMax: '',
    ajustes: lerLocal('cg_ajustes_v1', {}),
    filtros: { de: '', ate: '', fil: '', cc: '', cv: '', nat: '', ori: '', forn: '', busca: '' },
    modoValor: 'vt',
    aba: 'geral',
    precos: { tendencia: 'todas', incluirServicos: false, ordem: 'impacto', limite: C.limiteTendenciaPct, minCompras: C.minimoCompras, mostrar: 100 },
    abc: { ordem: 'gasto', classe: '', incluirServicos: true, mostrar: 100 },
    regras: { filtro: '' },
    itensAba: { status: 'gasto', pagina: 0 },
  };

  /* ---------------- Utilidades ---------------- */
  function lerLocal(chave, padrao) { try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravarLocal(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const fmtQtd = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
  function moeda(v) { return fmtMoeda.format(v || 0); }
  function moeda0(v) { return 'R$ ' + fmtInt.format(Math.round(v || 0)); }
  function preco(v) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 }); }
  const compacto = G.fmtCompacto;
  function pct(v, casas) { if (!isFinite(v)) return '—'; const s = (v * 100).toFixed(casas == null ? 1 : casas).replace('.', ','); return (v > 0 ? '+' : '') + s + '%'; }
  function pctSimples(v, casas) { return (v || 0).toFixed(casas == null ? 1 : casas).replace('.', ',') + '%'; }
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function nomeMes(ym) { if (!ym) return ''; const [a, m] = ym.split('-'); return MESES[+m - 1] + '/' + a.slice(2); }
  function dataBr(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  function rotJanela(a, b) { if (!b || a === b) return nomeMes(a); return a.slice(0, 4) === b.slice(0, 4) ? MESES[+a.slice(5, 7) - 1] + '–' + nomeMes(b) : nomeMes(a) + '–' + nomeMes(b); }

  function nomeCod(mapa, c, vazio) { if (!c) return vazio; const n = mapa && mapa[c]; return n ? c + ' – ' + n : c; }
  const nomeFil = (c) => nomeCod(C.nomesFiliais, c, '(sem filial)');
  const nomeCC = (c) => nomeCod(C.nomesCentrosCusto, c, '(sem centro de custo)');
  const nomeCV = (c) => nomeCod(C.nomesClassesValor, c, '(sem classe de valor)');
  const nomeForn = (c) => nomeCod(C.nomesFornecedores, c, '(sem fornecedor)');
  const val = (it) => (estado.modoValor === 'vc' ? it.vc : it.vt);
  const soma = (lista) => lista.reduce((s, it) => s + val(it), 0);
  const ehServico = (it) => { const c3 = it.cfopNum % 1000; return it.un === 'SV' || it.natureza === 'Serviços' || it.natureza === 'Fretes e transportes' || c3 === 933 || c3 === 932 || (c3 >= 351 && c3 <= 360) || /^SERV/i.test(it.desc); };
  const dataRef = () => { let m = ''; for (const it of estado.itens) if (it.gasto && it.ym && it.ym <= estado.filtros.ate && it.data > m) m = it.data; return m; };
  const optsPreco = () => ({ limitePct: estado.precos.limite, minimoCompras: estado.precos.minCompras, dataRef: dataRef() });

  let tToast;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tToast); tToast = setTimeout(() => { t.hidden = true; }, 2600); }

  function tendHtml(t) {
    if (t === 'sobe') return '<span class="tend sobe">▲ Subindo</span>';
    if (t === 'cai') return '<span class="tend cai">▼ Caindo</span>';
    if (t === 'estavel') return '<span class="tend estavel">● Estável</span>';
    return '<span class="tend sem">pouco histórico</span>';
  }
  function varHtml(v, t) {
    if (t === 'sem' || !isFinite(v)) return '<span class="fraco">—</span>';
    return '<span class="' + (v > 0.0005 ? 'var-sobe' : v < -0.0005 ? 'var-cai' : '') + '">' + pct(v) + '</span>';
  }
  function barraPct(p, max) { const w = Math.max(1, Math.round((p / (max || 100)) * 60)); return '<span class="pct-cel"><span class="barra-pct" style="width:' + w + 'px"></span>' + pctSimples(p) + '</span>'; }

  /* ---------------- Tema ---------------- */
  function aplicarTema(t) { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  aplicarTema(lerLocal('cg_tema', null));
  $('#btn-tema').addEventListener('click', () => {
    const atual = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const novo = atual === 'dark' ? 'light' : 'dark';
    aplicarTema(novo); gravarLocal('cg_tema', novo);
    if (estado.base) renderizar();
  });

  /* =====================================================================
     CARGA DAS PLANILHAS
     ===================================================================== */
  const arquivos = { sd1: null, sf4: null };

  function prepararZona(tipo) {
    const zona = $('#zona-' + tipo), input = $('#arq-' + tipo);
    input.addEventListener('change', () => { if (input.files[0]) escolherArquivo(tipo, input.files[0]); });
    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastando'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
    zona.addEventListener('drop', (e) => {
      e.preventDefault(); zona.classList.remove('arrastando');
      const fs = Array.from(e.dataTransfer.files || []);
      if (fs.length === 2) { // soltou os dois de uma vez: separa pelo nome
        fs.forEach((f) => escolherArquivo(/sf4|tes/i.test(f.name) ? 'sf4' : 'sd1', f));
      } else if (fs[0]) escolherArquivo(tipo, fs[0]);
    });
  }
  function escolherArquivo(tipo, f) {
    arquivos[tipo] = f;
    $('#nome-' + tipo).textContent = f.name + ' · ' + (f.size / 1048576).toFixed(1).replace('.', ',') + ' MB';
    $('#zona-' + tipo).classList.add('ok');
    $('#btn-analisar').disabled = !podeAnalisar();
    statusCarga('');
  }
  // Na atualização, dá para trocar só uma das planilhas: a outra vem da carga anterior.
  function podeAnalisar() { return !!((arquivos.sd1 || estado.base) && (arquivos.sf4 || estado.base) && (arquivos.sd1 || arquivos.sf4)); }
  function statusCarga(msg, erro) { const s = $('#carga-status'); s.textContent = msg; s.classList.toggle('erro', !!erro); }
  function barraCarga(tipo, p) { $('#barra-' + tipo).style.width = Math.round(p * 100) + '%'; }

  async function analisar() {
    const btn = $('#btn-analisar');
    btn.disabled = true;
    try {
      statusCarga('Lendo SF4 (TES)…');
      const sf4 = arquivos.sf4 ? await L.lerPlanilha(await arquivos.sf4.arrayBuffer(), R.SPEC_SF4, (p) => barraCarga('sf4', p)) : Object.assign({ faltando: [] }, estado.base.sf4);
      const essenciaisSf4 = ['tes', 'filial', 'geraDup'].filter((k) => sf4.faltando.includes(k));
      if (essenciaisSf4.length) throw new Error('No SF4 faltam as colunas: ' + essenciaisSf4.map((k) => R.SPEC_SF4.colunas[k][0]).join(', '));
      statusCarga('Lendo SD1 (itens das notas)… arquivos grandes levam alguns segundos.');
      const sd1 = arquivos.sd1 ? await L.lerPlanilha(await arquivos.sd1.arrayBuffer(), R.SPEC_SD1, (p) => { barraCarga('sd1', p); statusCarga('Lendo SD1 (itens das notas)… ' + Math.round(p * 100) + '%'); }) : Object.assign({ faltando: [] }, estado.base.sd1);
      const essenciaisSd1 = ['filial', 'produto', 'quantidade', 'vlrTotal', 'tes', 'cfop', 'data'].filter((k) => sd1.faltando.includes(k));
      if (essenciaisSd1.length) throw new Error('Na SD1 faltam as colunas: ' + essenciaisSd1.map((k) => R.SPEC_SD1.colunas[k][0]).join(', '));
      if (!sd1.linhas) throw new Error('A SD1 não tem linhas de dados.');
      const base = {
        versao: VERSAO,
        carregadoEm: new Date().toISOString(),
        arquivos: { sd1: arquivos.sd1 ? arquivos.sd1.name : estado.base.arquivos.sd1, sf4: arquivos.sf4 ? arquivos.sf4.name : estado.base.arquivos.sf4 },
        sd1: { linhas: sd1.linhas, dados: sd1.dados, faltando: sd1.faltando },
        sf4: { linhas: sf4.linhas, dados: sf4.dados, faltando: sf4.faltando },
      };
      statusCarga('Montando análise…');
      await new Promise((r) => setTimeout(r, 20));
      usarBase(base);
      const ok = await D.salvarBase(base);
      toast(ok ? 'Planilhas carregadas e guardadas neste navegador.' : 'Planilhas carregadas (não foi possível guardar para a próxima vez).');
    } catch (e) {
      console.error(e);
      statusCarga('Erro: ' + e.message, true);
    } finally {
      btn.disabled = !podeAnalisar();
    }
  }

  function mostrarCarga(podeVoltar) {
    $('#tela-app').hidden = true; $('#tela-carga').hidden = false;
    $('#btn-cancelar-carga').hidden = !podeVoltar;
    $('#btn-atualizar').hidden = true;
    ['sd1', 'sf4'].forEach((t) => {
      barraCarga(t, 0); arquivos[t] = null; $('#arq-' + t).value = '';
      $('#zona-' + t).classList.remove('ok');
      $('#nome-' + t).textContent = estado.base ? 'Atual: ' + estado.base.arquivos[t] + ' — clique ou arraste para trocar' : 'Clique ou arraste o arquivo aqui';
    });
    $('#btn-analisar').disabled = true;
    statusCarga(estado.base ? 'Pode trocar só uma das planilhas: a outra continua a da carga anterior.' : '');
  }
  function mostrarApp() {
    $('#tela-carga').hidden = true; $('#tela-app').hidden = false; $('#btn-atualizar').hidden = false;
  }

  /* =====================================================================
     MONTAGEM
     ===================================================================== */
  function usarBase(base) {
    estado.base = base;
    estado.itens = D.montarItens(base);
    for (const it of estado.itens) it.txt = semAcento(it.prod + ' ' + it.desc + ' ' + it.forn + ' ' + nomeForn(it.forn) + ' ' + it.doc + ' ' + it.ped);
    D.aplicarAjustes(estado.itens, estado.ajustes);

    const meses = new Set(); let dmax = '';
    for (const it of estado.itens) { if (it.ym) meses.add(it.ym); if (it.data > dmax) dmax = it.data; }
    estado.meses = Array.from(meses).sort();
    estado.dataMax = dmax;
    if (dmax) {
      const [a, m, d] = dmax.split('-').map(Number);
      const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
      estado.mesParcial = d < ultimoDia ? dmax.slice(0, 7) : '';
    }
    Object.keys(estado.filtros).forEach((k) => { estado.filtros[k] = ''; });
    estado.filtros.de = estado.meses[0] || '';
    estado.filtros.ate = estado.meses[estado.meses.length - 1] || '';

    $('#topo-info').textContent = 'Dados de ' + new Date(base.carregadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) +
      ' · ' + fmtInt.format(base.sd1.linhas) + ' itens de NF · ' + nomeMes(estado.meses[0]) + ' a ' + nomeMes(estado.meses[estado.meses.length - 1]);
    popularFiltros();
    mostrarApp();
    renderizar();
  }

  function opcoes(sel, lista, todas) {
    sel.innerHTML = (todas ? '<option value="">' + todas + '</option>' : '') + lista.map((o) => '<option value="' + esc(o.v) + '">' + esc(o.t) + '</option>').join('');
  }

  function popularFiltros() {
    const g = estado.itens.filter((it) => it.gasto);
    const unicos = (fn) => Array.from(new Set(g.map(fn))).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a < b ? -1 : a > b ? 1 : 0));
    const meses = estado.meses.map((m) => ({ v: m, t: nomeMes(m) + (m === estado.mesParcial ? ' (parcial)' : '') }));
    opcoes($('#f-de'), meses); opcoes($('#f-ate'), meses);
    opcoes($('#f-fil'), unicos((it) => it.fil).map((c) => ({ v: c || VAZIO, t: nomeFil(c) })), 'Todas');
    opcoes($('#f-cc'), unicos((it) => it.cc).map((c) => ({ v: c || VAZIO, t: nomeCC(c) })), 'Todos');
    opcoes($('#f-cv'), unicos((it) => it.cv).map((c) => ({ v: c || VAZIO, t: nomeCV(c) })), 'Todas');
    opcoes($('#f-nat'), unicos((it) => it.natureza).map((c) => ({ v: c, t: c })), 'Todas');
    opcoes($('#f-ori'), unicos((it) => it.origem).map((c) => ({ v: c, t: c })), 'Todas');
    sincronizarFiltros();
  }

  function sincronizarFiltros() {
    const f = estado.filtros;
    $('#f-de').value = f.de; $('#f-ate').value = f.ate;
    $('#f-fil').value = f.fil; $('#f-cc').value = f.cc; $('#f-cv').value = f.cv;
    $('#f-nat').value = f.nat; $('#f-ori').value = f.ori; $('#f-busca').value = f.busca;
    $('#f-valor').value = estado.modoValor;
    // chips
    const chips = [];
    const add = (k, rot) => chips.push('<span class="chip">' + esc(rot) + '<button data-limpa="' + k + '" aria-label="Remover filtro">✕</button></span>');
    if (f.de !== estado.meses[0] || f.ate !== estado.meses[estado.meses.length - 1]) add('periodo', 'Período: ' + nomeMes(f.de) + ' a ' + nomeMes(f.ate));
    if (f.fil) add('fil', 'Filial: ' + nomeFil(f.fil === VAZIO ? '' : f.fil));
    if (f.cc) add('cc', 'C. custo: ' + nomeCC(f.cc === VAZIO ? '' : f.cc));
    if (f.cv) add('cv', 'Classe: ' + nomeCV(f.cv === VAZIO ? '' : f.cv));
    if (f.nat) add('nat', 'Natureza: ' + f.nat);
    if (f.ori) add('ori', 'Origem: ' + f.ori);
    if (f.forn) add('forn', 'Fornecedor: ' + nomeForn(f.forn));
    if (f.busca) add('busca', 'Busca: "' + f.busca + '"');
    $('#chips').innerHTML = chips.join('');
  }

  function bate(valor, filtro) { return !filtro || (filtro === VAZIO ? valor === '' : valor === filtro); }

  function passaFiltros(it) {
    const f = estado.filtros;
    if (it.ym) { if (f.de && it.ym < f.de) return false; if (f.ate && it.ym > f.ate) return false; }
    if (!bate(it.fil, f.fil) || !bate(it.cc, f.cc) || !bate(it.cv, f.cv)) return false;
    if (f.nat && it.natureza !== f.nat) return false;
    if (f.ori && it.origem !== f.ori) return false;
    if (f.forn && it.forn !== f.forn) return false;
    if (f.busca) { const termos = semAcento(f.busca).split(/\s+/).filter(Boolean); for (const t of termos) if (it.txt.indexOf(t) === -1) return false; }
    return true;
  }
  const gastos = () => estado.itens.filter((it) => it.gasto && passaFiltros(it));

  function aplicarFiltro(k, v, msg) {
    estado.filtros[k] = v;
    if (k === 'de' && estado.filtros.ate < v) estado.filtros.ate = v;
    if (k === 'ate' && estado.filtros.de > v) estado.filtros.de = v;
    estado.precos.mostrar = 100; estado.abc.mostrar = 100; estado.itensAba.pagina = 0;
    sincronizarFiltros();
    renderizar();
    if (msg) toast(msg);
  }

  /* =====================================================================
     RENDERIZAÇÃO
     ===================================================================== */
  function renderizar() {
    const t0 = performance.now();
    ({ geral: renderGeral, locais: renderLocais, precos: renderPrecos, abc: renderAbc, regras: renderRegras, itens: renderItens })[estado.aba]();
    if (window.location.search.indexOf('debug') !== -1) console.log('render', estado.aba, Math.round(performance.now() - t0) + 'ms');
  }

  function mesesCompletos(lista) {
    const porMes = new Map();
    for (const it of lista) if (it.ym) porMes.set(it.ym, (porMes.get(it.ym) || 0) + val(it));
    const f = estado.filtros;
    const todos = estado.meses.filter((m) => m >= f.de && m <= f.ate);
    return todos.map((m) => ({ ym: m, valor: porMes.get(m) || 0, parcial: m === estado.mesParcial }));
  }

  /* ---------------- VISÃO GERAL ---------------- */
  function renderGeral() {
    const lista = gastos();
    const total = soma(lista);
    const entradas = estado.itens.filter((it) => passaFiltros(it));
    const totalEntradas = entradas.reduce((s, it) => s + val(it), 0);
    const meses = mesesCompletos(lista);
    const completos = meses.filter((m) => !m.parcial);
    const media = completos.length ? completos.reduce((s, m) => s + m.valor, 0) / completos.length : total / Math.max(1, meses.length);
    const notas = D.contarNotas(lista);
    const fornecedores = D.agrupar(lista, (it) => it.forn, val);
    const top10f = fornecedores.slice(0, 10).reduce((s, g) => s + g.valor, 0);
    const abc = D.curvaAbc(lista, val, C.curvaA, C.curvaB);
    const nA = abc.lista.filter((g) => g.classe === 'A').length;

    $('#kpis').innerHTML = [
      kpi('Total gasto no período', compacto(total), (total ? pctSimples(total / (totalEntradas || 1) * 100, 0) + ' do valor de todas as entradas · <a data-ir="regras">ver o que ficou de fora</a>' : 'Nenhum gasto com esses filtros'), 'hero', moeda(total)),
      kpi('Média por mês', compacto(media), completos.length + ' mes' + (completos.length === 1 ? '' : 'es') + ' completo' + (completos.length === 1 ? '' : 's'), '', moeda(media)),
      kpi('Notas fiscais', fmtInt.format(notas), 'média de ' + compacto(notas ? total / notas : 0) + ' por nota'),
      kpi('Fornecedores', fmtInt.format(fornecedores.length), 'os 10 maiores = ' + pctSimples(total ? top10f / total * 100 : 0, 0) + ' do gasto'),
      kpi('Produtos e serviços', fmtInt.format(abc.lista.length), nA + ' deles = ' + C.curvaA + '% do gasto (classe A)'),
    ].join('');

    renderInsights(lista, total, meses, abc, fornecedores, entradas);

    // gráfico mensal
    const iParcial = meses.findIndex((m) => m.parcial);
    G.colunas('mes', $('#g-mes'), meses.map((m) => nomeMes(m.ym)), meses.map((m) => m.valor), {
      parcial: iParcial,
      titulos: meses.map((m) => nomeMes(m.ym) + (m.parcial ? ' (parcial)' : '')),
      rodape: (i) => (meses[i].parcial ? 'Mês em andamento (dados até ' + dataBr(estado.dataMax) + ')' : 'Clique para filtrar este mês'),
      aoClicar: (i) => { estado.filtros.de = meses[i].ym; aplicarFiltro('ate', meses[i].ym, 'Filtrado: ' + nomeMes(meses[i].ym)); },
    });

    // natureza
    const nat = D.agrupar(lista, (it) => it.natureza, val);
    const hNat = Math.max(260, nat.length * 30 + 40);
    $('#box-nat').style.height = hNat + 'px';
    $('#box-mes').style.height = hNat + 'px';
    G.barras('nat', $('#g-nat'), nat.map((g) => g.chave), nat.map((g) => g.valor), {
      rodape: (i) => pctSimples(nat[i].valor / (total || 1) * 100) + ' do gasto · ' + fmtInt.format(nat[i].itens) + ' itens',
      aoClicar: (i) => aplicarFiltro('nat', nat[i].chave, 'Filtrado: ' + nat[i].chave),
    });

    // top produtos
    const tp = abc.lista.slice(0, 10);
    $('#t-top-prod').innerHTML = '<thead><tr><th>#</th><th>Produto</th><th>Descrição</th><th class="n">Gasto</th><th class="n">% do total</th></tr></thead><tbody>' +
      (tp.length ? tp.map((g, i) => '<tr class="clicavel" data-prod="' + esc(g.chave) + '"><td class="fraco">' + (i + 1) + '</td><td class="cod">' + esc(g.prod) + '</td><td class="desc">' + esc(g.desc) + '</td><td class="n">' + moeda0(g.gasto) + '</td><td class="n">' + barraPct(g.pct, tp[0].pct) + '</td></tr>').join('') : '<tr><td colspan="5" class="vazio">Sem dados</td></tr>') + '</tbody>';

    // top fornecedores
    const tf = fornecedores.slice(0, 10);
    $('#t-top-forn').innerHTML = '<thead><tr><th>#</th><th>Fornecedor (cód-loja)</th><th class="n">Gasto</th><th class="n">% do total</th><th class="n">Itens</th></tr></thead><tbody>' +
      (tf.length ? tf.map((g, i) => '<tr class="clicavel" data-forn="' + esc(g.chave) + '"><td class="fraco">' + (i + 1) + '</td><td>' + esc(nomeForn(g.chave)) + '</td><td class="n">' + moeda0(g.valor) + '</td><td class="n">' + barraPct(g.valor / (total || 1) * 100, tf[0].valor / (total || 1) * 100) + '</td><td class="n">' + fmtInt.format(g.itens) + '</td></tr>').join('') : '<tr><td colspan="5" class="vazio">Sem dados</td></tr>') + '</tbody>';
  }

  function kpi(rot, valor, det, classe, titulo) {
    return '<div class="kpi ' + (classe || '') + '"><div class="kpi-rot">' + rot + '</div><div class="kpi-val"' + (titulo ? ' title="' + esc(titulo) + '"' : '') + '>' + valor + '</div><div class="kpi-det">' + det + '</div></div>';
  }

  function renderInsights(lista, total, meses, abc, fornecedores, entradas) {
    const out = [];
    const add = (icone, classe, html) => out.push('<li><span class="ins-icone ' + classe + '">' + icone + '</span><span>' + html + '</span></li>');
    if (!lista.length) { $('#insights').innerHTML = '<li><span>Nenhum gasto encontrado com os filtros atuais.</span></li>'; return; }

    const completos = meses.filter((m) => !m.parcial && m.valor > 0);
    if (completos.length >= 2) {
      const ord = completos.slice().sort((a, b) => b.valor - a.valor);
      add('$', 'info', 'Mês de <strong>maior gasto: ' + nomeMes(ord[0].ym) + '</strong> (' + compacto(ord[0].valor) + '). Menor: ' + nomeMes(ord[ord.length - 1].ym) + ' (' + compacto(ord[ord.length - 1].valor) + ').');
    }
    if (completos.length >= 6) {
      const u3 = completos.slice(-3), a3 = completos.slice(-6, -3);
      const su = u3.reduce((s, m) => s + m.valor, 0), sa = a3.reduce((s, m) => s + m.valor, 0);
      const v = su / (sa || 1) - 1;
      add(v >= 0 ? '▲' : '▼', v >= 0 ? 'sobe' : 'cai', 'Últimos 3 meses completos (' + nomeMes(u3[0].ym) + ' a ' + nomeMes(u3[2].ym) + '): <strong>' + compacto(su) + ', ' + pct(v) + '</strong> em relação aos 3 meses anteriores.');

      // natureza que mais cresceu
      const u3s = new Set(u3.map((m) => m.ym)), a3s = new Set(a3.map((m) => m.ym));
      const porNat = new Map();
      for (const it of lista) {
        const p = u3s.has(it.ym) ? 'u' : a3s.has(it.ym) ? 'a' : null; if (!p) continue;
        let g = porNat.get(it.natureza); if (!g) { g = { u: 0, a: 0 }; porNat.set(it.natureza, g); }
        g[p] += val(it);
      }
      let melhor = null;
      porNat.forEach((g, n) => { const dif = g.u - g.a; if (g.a > 0 && (!melhor || dif > melhor.dif)) melhor = { n, dif, g }; });
      if (melhor && melhor.dif > 0) add('▲', 'sobe', 'Natureza que <strong>mais cresceu</strong> no mesmo comparativo: <strong>' + esc(melhor.n) + '</strong> (' + compacto(melhor.g.a) + ' → ' + compacto(melhor.g.u) + ', ' + pct(melhor.g.u / melhor.g.a - 1) + ').');
    }

    const nA = abc.lista.filter((g) => g.classe === 'A');
    if (nA.length) add('A', 'info', '<strong>' + fmtInt.format(nA.length) + ' produtos/serviços</strong> (de ' + fmtInt.format(abc.lista.length) + ') somam ' + C.curvaA + '% do gasto — é neles que negociar dá mais retorno. O maior é <strong>' + esc(nA[0].desc || nA[0].prod) + '</strong> (' + compacto(nA[0].gasto) + ').');

    const precos = D.analisarPrecos(lista.filter((it) => !ehServico(it)), optsPreco());
    const sobem = precos.filter((g) => g.tendencia === 'sobe').sort((a, b) => b.impacto - a.impacto);
    const caem = precos.filter((g) => g.tendencia === 'cai').sort((a, b) => a.impacto - b.impacto);
    if (sobem.length) {
      const s = sobem[0];
      const impTotal = sobem.reduce((x, g) => x + g.impacto, 0);
      add('▲', 'sobe', '<strong>' + fmtInt.format(sobem.length) + ' materiais com preço subindo</strong> (≥ ' + estado.precos.limite + '%), impacto ≈ <strong>' + compacto(impTotal) + '/ano</strong>. Maior: <strong>' + esc(s.desc || s.prod) + '</strong>, de ' + preco(s.precoIni) + ' para ' + preco(s.precoFim) + ' (' + pct(s.variacao) + '). <a data-ir="precos" data-tend="sobe">Ver lista</a>');
    }
    if (caem.length) {
      const c = caem[0];
      add('▼', 'cai', '<strong>' + fmtInt.format(caem.length) + ' materiais ficaram mais baratos</strong>. Destaque: <strong>' + esc(c.desc || c.prod) + '</strong>, de ' + preco(c.precoIni) + ' para ' + preco(c.precoFim) + ' (' + pct(c.variacao) + '). <a data-ir="precos" data-tend="cai">Ver lista</a>');
    }

    if (fornecedores.length) {
      const f = fornecedores[0];
      add('F', 'info', 'Maior fornecedor: <strong>' + esc(nomeForn(f.chave)) + '</strong> com ' + compacto(f.valor) + ' (' + pctSimples(f.valor / total * 100) + ' do gasto).');
    }

    const fora = entradas.filter((it) => !it.gasto);
    const vFora = fora.reduce((s, it) => s + val(it), 0);
    if (vFora > 0) add('!', '', '<strong>' + compacto(vFora) + '</strong> em entradas <strong>não</strong> foram contadas como gasto (remessas de terceiros, devoluções, notas sem financeiro...). <a data-ir="regras">Ver por quê</a>');
    const preNotas = fora.filter((it) => it.motivo === 'SEM_TES');
    if (preNotas.length) add('!', 'sobe', '<strong>' + fmtInt.format(preNotas.length) + ' itens de pré-nota sem TES</strong> (' + compacto(preNotas.reduce((s, it) => s + val(it), 0)) + ') ainda não foram classificados no Protheus e não entram no gasto.');

    $('#insights').innerHTML = out.join('');
  }

  /* ---------------- ONDE GASTOU ---------------- */
  function renderLocais() {
    const lista = gastos();
    const total = soma(lista);
    const bloco = (id, chaveFn, nomeFn, filtroK, limite, rotTab) => {
      const grupos = D.agrupar(lista, chaveFn, val);
      const vis = limite ? grupos.slice(0, limite) : grupos;
      $('#box-' + id).style.height = Math.max(120, vis.length * 28 + 40) + 'px';
      G.barras(id, $('#g-' + id), vis.map((g) => nomeFn(g.chave)), vis.map((g) => g.valor), {
        rodape: (i) => pctSimples(vis[i].valor / (total || 1) * 100) + ' do gasto · ' + fmtInt.format(vis[i].itens) + ' itens · clique para filtrar',
        aoClicar: (i) => aplicarFiltro(filtroK, vis[i].chave === '' ? VAZIO : vis[i].chave, 'Filtrado: ' + nomeFn(vis[i].chave)),
      });
      const max = grupos.length ? grupos[0].valor / (total || 1) * 100 : 100;
      $('#t-' + id).innerHTML = '<thead><tr><th>' + rotTab + '</th><th class="n">Gasto</th><th class="n">% do total</th><th class="n">Itens</th></tr></thead><tbody>' +
        grupos.map((g) => '<tr class="clicavel" data-filtro="' + filtroK + '" data-v="' + esc(g.chave === '' ? VAZIO : g.chave) + '"><td>' + esc(nomeFn(g.chave)) + '</td><td class="n">' + moeda0(g.valor) + '</td><td class="n">' + barraPct(g.valor / (total || 1) * 100, max) + '</td><td class="n">' + fmtInt.format(g.itens) + '</td></tr>').join('') +
        '</tbody><tfoot><tr><td>Total</td><td class="n">' + moeda0(total) + '</td><td class="n">100%</td><td class="n">' + fmtInt.format(lista.length) + '</td></tr></tfoot>';
    };
    bloco('fil', (it) => it.fil, nomeFil, 'fil', 0, 'Filial');
    bloco('ori', (it) => it.origem, (c) => c, 'ori', 0, 'Origem');
    bloco('cc', (it) => it.cc, nomeCC, 'cc', 15, 'Centro de custo');
    bloco('cv', (it) => it.cv, nomeCV, 'cv', 15, 'Classe de valor');

    // matriz filial x natureza
    const fils = D.agrupar(lista, (it) => it.fil, val);
    const nats = D.agrupar(lista, (it) => it.natureza, val);
    const cel = new Map(); let max = 0;
    for (const it of lista) { const k = it.fil + '|' + it.natureza; const v = (cel.get(k) || 0) + val(it); cel.set(k, v); }
    cel.forEach((v) => { if (v > max) max = v; });
    const heat = (v) => { if (!v) return ''; const r = v / max; return r > 0.5 ? 'heat-4' : r > 0.2 ? 'heat-3' : r > 0.05 ? 'heat-2' : 'heat-1'; };
    $('#t-matriz').innerHTML = '<thead><tr><th>Natureza</th>' + fils.map((f) => '<th class="n">' + esc(nomeFil(f.chave)) + '</th>').join('') + '<th class="n">Total</th></tr></thead><tbody>' +
      nats.map((n) => '<tr><td class="nw">' + esc(n.chave) + '</td>' + fils.map((f) => { const v = cel.get(f.chave + '|' + n.chave) || 0; return '<td class="n ' + heat(v) + '" title="' + esc(nomeFil(f.chave) + ' · ' + n.chave + ': ' + moeda(v)) + '">' + (v ? compacto(v) : '<span class="fraco">—</span>') + '</td>'; }).join('') + '<td class="n"><strong>' + compacto(n.valor) + '</strong></td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td>' + fils.map((f) => '<td class="n">' + compacto(f.valor) + '</td>').join('') + '<td class="n">' + compacto(total) + '</td></tr></tfoot>';
  }

  /* ---------------- PREÇOS ---------------- */
  function listaPrecos() {
    const p = estado.precos;
    const base = gastos().filter((it) => p.incluirServicos || !ehServico(it));
    return D.analisarPrecos(base, optsPreco());
  }

  function renderPrecos() {
    const p = estado.precos;
    $('#p-limite').value = p.limite; $('#p-min').value = p.minCompras; $('#p-serv').checked = p.incluirServicos; $('#p-ordem').value = p.ordem;
    $$('#p-tend button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === p.tendencia));
    const todos = listaPrecos();
    const cont = { sobe: 0, cai: 0, estavel: 0, sem: 0 };
    todos.forEach((g) => { cont[g.tendencia]++; });
    Object.keys(cont).forEach((k) => { $('#n-' + k).textContent = fmtInt.format(cont[k]); });

    let lista = p.tendencia === 'todas' ? todos : todos.filter((g) => g.tendencia === p.tendencia);
    const ord = {
      impacto: (a, b) => b.impacto - a.impacto || b.gasto - a.gasto,
      variacao: (a, b) => (b.tendencia === 'sem' ? -1 : 0) - (a.tendencia === 'sem' ? -1 : 0) || b.variacao - a.variacao,
      queda: (a, b) => (b.tendencia === 'sem' ? -1 : 0) - (a.tendencia === 'sem' ? -1 : 0) || a.variacao - b.variacao,
      gasto: (a, b) => b.gasto - a.gasto,
      preco: (a, b) => b.precoMax - a.precoMax,
    }[p.ordem];
    lista = lista.slice().sort(ord);
    const vis = lista.slice(0, p.mostrar);
    $('#t-precos').innerHTML = '<thead><tr><th>Produto</th><th>Descrição</th><th>UN</th><th class="n">Compras</th><th class="n">Preço inicial</th><th class="n">Preço atual</th><th class="n">Variação</th><th>Tendência</th><th>Histórico</th><th class="n" title="Diferença de preço × quantidade comprada nos últimos 12 meses">Impacto/ano</th><th class="n">Gasto total</th></tr></thead><tbody>' +
      (vis.length ? vis.map((g) => '<tr data-prod="' + esc(g.chave) + '"><td class="cod">' + esc(g.prod) + '</td><td class="desc">' + esc(g.desc) + '</td><td>' + esc(g.un) + '</td><td class="n">' + g.validas.length + (g.foraPadrao.size ? ' <span class="fraco" title="Compras com preço fora do padrão, ignoradas no cálculo">+' + g.foraPadrao.size + '⚠</span>' : '') + '</td>' +
        '<td class="n">' + preco(g.precoIni) + ' <span class="fraco">' + rotJanela(g.ymIni, g.ymIni2) + '</span></td>' +
        '<td class="n">' + preco(g.precoFim) + ' <span class="fraco">' + rotJanela(g.ymFim1, g.ymFim) + '</span></td>' +
        '<td class="n">' + varHtml(g.variacao, g.tendencia) + '</td><td>' + tendHtml(g.tendencia) + '</td>' +
        '<td>' + G.sparkline(g.serie.map((s) => s.preco), g.tendencia) + '</td>' +
        '<td class="n">' + (g.tendencia === 'sem' ? '<span class="fraco">—</span>' : '<span class="' + (g.impacto > 0 ? 'var-sobe' : g.impacto < 0 ? 'var-cai' : '') + '">' + (g.impacto > 0 ? '+' : '') + moeda0(g.impacto) + '</span>') + '</td>' +
        '<td class="n">' + moeda0(g.gasto) + '</td></tr>').join('') : '<tr><td colspan="11" class="vazio">Nenhum produto com esses filtros.</td></tr>') + '</tbody>';
    $('#p-mais').innerHTML = lista.length > vis.length ? '<button class="btn btn-sec" id="p-mais-btn">Mostrar mais (' + fmtInt.format(lista.length - vis.length) + ' restantes)</button>' : (lista.length ? '<span class="fraco">' + fmtInt.format(lista.length) + ' produtos</span>' : '');
  }

  /* ---------------- DETALHE DO PRODUTO ---------------- */
  function abrirProduto(chave) {
    const [prod, un] = chave.split('|');
    const itensProd = gastos().filter((it) => it.prod === prod && it.un === un);
    if (!itensProd.length) return;
    const desc = itensProd[0].desc;
    const natureza = D.agrupar(itensProd, (it) => it.natureza, val)[0].chave;
    const g = D.analisarPrecos(itensProd, optsPreco())[0];
    const totalGasto = soma(itensProd);
    $('#modal-titulo').textContent = desc || prod;
    $('#modal-sub').textContent = 'Produto ' + prod + ' · unidade ' + (un || '—') + ' · ' + natureza + ' · período ' + nomeMes(estado.filtros.de) + ' a ' + nomeMes(estado.filtros.ate);
    const corpo = $('#modal-corpo');
    if (!g) {
      corpo.innerHTML = '<div class="mini-kpis">' + miniKpi('Gasto no período', moeda(totalGasto)) + miniKpi('Itens de NF', fmtInt.format(itensProd.length)) + '</div><p class="fraco">Este item não tem quantidade/preço unitário (ex.: serviço lançado só com valor), então não dá para acompanhar preço.</p>' + tabelaCompras(itensProd);
    } else {
      // por fornecedor
      const pf = new Map();
      for (const c of g.validas) {
        let x = pf.get(c.forn); if (!x) { x = { forn: c.forn, n: 0, sq: 0, sv: 0, min: Infinity, ult: null }; pf.set(c.forn, x); }
        x.n++; x.sq += c.qtd; x.sv += c.vu * c.qtd; if (c.vu < x.min) x.min = c.vu; if (!x.ult || c.data >= x.ult.data) x.ult = c;
      }
      const forns = Array.from(pf.values()).map((x) => Object.assign(x, { medio: x.sv / x.sq })).sort((a, b) => a.medio - b.medio);
      corpo.innerHTML =
        '<div class="mini-kpis">' +
        miniKpi('Preço inicial (' + rotJanela(g.ymIni, g.ymIni2) + ')', preco(g.precoIni)) +
        miniKpi('Preço atual (' + rotJanela(g.ymFim1, g.ymFim) + ')', preco(g.precoFim)) +
        miniKpi('Variação', varHtml(g.variacao, g.tendencia === 'sem' && g.serie.length > 1 ? 'x' : g.tendencia) + '<div style="margin-top:4px">' + tendHtml(g.tendencia) + '</div>') +
        miniKpi('Menor preço', preco(g.precoMin)) +
        miniKpi('Maior preço', preco(g.precoMax)) +
        miniKpi('Preço médio', preco(g.precoMedio)) +
        miniKpi('Impacto/ano', g.tendencia === 'sem' ? '—' : (g.impacto > 0 ? '+' : '') + moeda0(g.impacto)) +
        miniKpi('Gasto no período', moeda0(totalGasto)) +
        '</div>' +
        '<div class="grafico" style="height:300px"><canvas id="g-prod"></canvas></div>' +
        (g.foraPadrao.size ? '<p class="card-sub">⚠ ' + g.foraPadrao.size + ' compra(s) com preço muito fora do padrão (mais de 5× acima ou abaixo da mediana de ' + preco(g.mediana) + ') não entram no cálculo nem no gráfico. Costuma ser erro de unidade/quantidade na NF ou código genérico. Estão marcadas na lista de compras.</p>' : '') +
        (forns.length > 1 ? '<div><h3 style="font-size:14px;margin-bottom:8px">Preço por fornecedor</h3><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Fornecedor</th><th class="n">Compras</th><th class="n">Qtd</th><th class="n">Preço médio</th><th class="n">Menor preço</th><th class="n">Última compra</th></tr></thead><tbody>' +
          forns.map((x, i) => '<tr><td>' + esc(nomeForn(x.forn)) + (i === 0 ? ' <span class="tend cai">mais barato</span>' : '') + '</td><td class="n">' + x.n + '</td><td class="n">' + fmtQtd.format(x.sq) + '</td><td class="n">' + preco(x.medio) + '</td><td class="n">' + preco(x.min) + '</td><td class="n">' + preco(x.ult.vu) + ' <span class="fraco">' + dataBr(x.ult.data) + '</span></td></tr>').join('') +
          '</tbody></table></div></div>' : '') +
        tabelaCompras(itensProd, g.foraPadrao);
    }
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
    if (g) G.historicoPreco('prod', $('#g-prod'), g.validas, g.serie, nomeMes, nomeForn);
  }
  function miniKpi(rot, v) { return '<div class="mini-kpi"><div class="kpi-rot">' + rot + '</div><div class="kpi-val">' + v + '</div></div>'; }
  function tabelaCompras(lista, fora) {
    const ord = lista.slice().sort((a, b) => (a.data < b.data ? 1 : -1));
    return '<div><h3 style="font-size:14px;margin-bottom:8px">Compras (' + fmtInt.format(ord.length) + ')</h3><div class="tabela-wrap alta"><table class="tabela"><thead><tr><th>Data</th><th>Filial</th><th>Fornecedor</th><th>NF / Série</th><th class="n">Qtd</th><th class="n">Preço unit.</th><th class="n">Valor</th><th>C. custo</th><th>TES</th></tr></thead><tbody>' +
      ord.map((it) => '<tr><td>' + dataBr(it.data) + '</td><td class="cod">' + esc(it.fil) + '</td><td>' + esc(nomeForn(it.forn)) + '</td><td class="cod">' + esc(it.doc) + (it.serie ? ' / ' + esc(it.serie) : '') + '</td><td class="n">' + fmtQtd.format(it.qtd) + '</td><td class="n">' + preco(it.vu) + (fora && fora.has(it) ? ' <span class="tend sobe" title="Preço fora do padrão: ignorado no cálculo">⚠ fora do padrão</span>' : '') + '</td><td class="n">' + moeda(val(it)) + '</td><td class="cod">' + esc(it.cc) + '</td><td class="cod" title="' + esc(it.tesTexto) + '">' + esc(it.tes) + '</td></tr>').join('') +
      '</tbody></table></div></div>';
  }
  function fecharModal() { $('#modal').hidden = true; document.body.style.overflow = ''; G.destruir('prod'); }

  /* ---------------- PRODUTOS PRINCIPAIS (ABC) ---------------- */
  function renderAbc() {
    const a = estado.abc;
    $('#abc-ordem').value = a.ordem; $('#abc-serv').checked = a.incluirServicos;
    $$('#abc-classe button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === a.classe));
    const base = gastos().filter((it) => a.incluirServicos || !ehServico(it));
    const r = D.curvaAbc(base, val, C.curvaA, C.curvaB);
    const tend = new Map(D.analisarPrecos(base, optsPreco()).map((g) => [g.chave, g]));
    const servico = new Set(base.filter(ehServico).map((it) => it.prod + '|' + it.un));
    const resumo = { A: { n: 0, v: 0 }, B: { n: 0, v: 0 }, C: { n: 0, v: 0 } };
    r.lista.forEach((g, i) => {
      g.rank = i + 1; resumo[g.classe].n++; resumo[g.classe].v += g.gasto;
      const t = tend.get(g.chave);
      if (t) { g.maxVu = t.precoMax; g.precoMedio = t.precoMedio; } // ignora compras fora do padrão
      g.servico = servico.has(g.chave);
    });
    const desc = { A: 'concentram a maior parte do gasto — negociar, cotar e acompanhar preço', B: 'gasto intermediário — revisar periodicamente', C: 'muitos itens, pouco valor — simplificar a compra' };
    $('#abc-kpis').innerHTML = ['A', 'B', 'C'].map((k) => kpi('<span class="classe-tag classe-' + k + '">' + k + '</span>Classe ' + k, fmtInt.format(resumo[k].n) + ' itens', pctSimples(r.total ? resumo[k].v / r.total * 100 : 0, 0) + ' do gasto (' + compacto(resumo[k].v) + ') · ' + desc[k])).join('');

    let lista = a.classe ? r.lista.filter((g) => g.classe === a.classe) : r.lista.slice();
    const ord = { gasto: (x, y) => y.gasto - x.gasto, preco: (x, y) => y.maxVu - x.maxVu, qtd: (x, y) => y.qtd - x.qtd, compras: (x, y) => y.compras - x.compras }[a.ordem];
    lista.sort(ord);
    const vis = lista.slice(0, a.mostrar);
    $('#t-abc').innerHTML = '<thead><tr><th class="n">#</th><th>Produto</th><th>Descrição</th><th>UN</th><th class="c">Classe</th><th class="n">Gasto</th><th class="n">% do total</th><th class="n">% acum.</th><th class="n">Qtd</th><th class="n">Preço médio</th><th class="n">Maior preço</th><th class="n">Compras</th><th>Preço</th></tr></thead><tbody>' +
      (vis.length ? vis.map((g) => { const t = tend.get(g.chave); return '<tr data-prod="' + esc(g.chave) + '"><td class="n fraco">' + g.rank + '</td><td class="cod">' + esc(g.prod) + '</td><td class="desc">' + esc(g.desc) + '</td><td>' + esc(g.un) + '</td><td class="c"><span class="classe-tag classe-' + g.classe + '">' + g.classe + '</span></td>' +
        '<td class="n">' + moeda0(g.gasto) + '</td><td class="n">' + pctSimples(g.pct, 2) + '</td><td class="n fraco">' + pctSimples(g.pctAcum) + '</td><td class="n">' + (g.qtd ? fmtQtd.format(g.qtd) : '—') + '</td>' +
        '<td class="n">' + (g.precoMedio ? preco(g.precoMedio) : '—') + '</td><td class="n">' + (g.maxVu ? preco(g.maxVu) : '—') + '</td><td class="n">' + fmtInt.format(g.compras) + '</td>' +
        '<td class="nw">' + (t && !g.servico ? tendHtml(t.tendencia) + (t.tendencia !== 'sem' ? ' <span class="fraco">' + pct(t.variacao, 0) + '</span>' : '') : '<span class="fraco" title="Serviço: preço varia conforme o escopo de cada nota">—</span>') + '</td></tr>'; }).join('') : '<tr><td colspan="13" class="vazio">Sem dados</td></tr>') + '</tbody>';
    $('#abc-mais').innerHTML = lista.length > vis.length ? '<button class="btn btn-sec" id="abc-mais-btn">Mostrar mais (' + fmtInt.format(lista.length - vis.length) + ' restantes)</button>' : '';
  }

  /* ---------------- FORA DO GASTO / REGRAS ---------------- */
  function renderRegras() {
    const lista = estado.itens.filter(passaFiltros);
    const total = soma(lista);
    const porMotivo = D.agrupar(lista, (it) => it.motivo, val);
    const ordem = ['GASTO', 'SEM_FINANCEIRO', 'TERCEIROS', 'DEVOLUCAO', 'TRANSFERENCIA', 'BONIFICACAO', 'SEM_TES', 'TES_NAO_ENCONTRADA', 'TES_SAIDA', 'AJUSTE_MANUAL'];
    porMotivo.sort((a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave));
    $('#t-motivos').innerHTML = '<thead><tr><th>Situação</th><th>O que significa</th><th class="n">Itens</th><th class="n">Valor</th><th class="n">% das entradas</th></tr></thead><tbody>' +
      porMotivo.map((g) => { const m = R.MOTIVOS[g.chave] || { rotulo: g.chave, explicacao: '' }; return '<tr class="clicavel" data-motivo="' + g.chave + '"><td><span class="motivo ' + (g.chave === 'GASTO' ? 'gasto' : '') + '">' + esc(m.rotulo) + '</span></td><td class="fraco">' + esc(m.explicacao) + '</td><td class="n">' + fmtInt.format(g.itens) + '</td><td class="n">' + moeda0(g.valor) + '</td><td class="n">' + pctSimples(total ? g.valor / total * 100 : 0) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td>Total de entradas</td><td></td><td class="n">' + fmtInt.format(lista.length) + '</td><td class="n">' + moeda0(total) + '</td><td class="n">100%</td></tr></tfoot>';

    // TES
    const porTes = new Map();
    for (const it of lista) {
      let g = porTes.get(it.chaveTes);
      if (!g) { g = { chave: it.chaveTes, fil: it.fil, tes: it.tes, texto: it.tesTexto, geraDup: it.tesGeraDup, poder: it.tesPoderTerc, auto: it.motivoAuto, gasto: it.gasto, ajustado: it.ajustado, cfops: new Set(), itens: 0, valor: 0 }; porTes.set(it.chaveTes, g); }
      g.cfops.add(it.cfop); g.itens++; g.valor += val(it);
    }
    let tes = Array.from(porTes.values()).sort((a, b) => b.valor - a.valor);
    const fr = estado.regras.filtro;
    if (fr === 'fora') tes = tes.filter((g) => !g.gasto);
    if (fr === 'gasto') tes = tes.filter((g) => g.gasto);
    if (fr === 'ajustadas') tes = tes.filter((g) => g.ajustado);
    $('#t-tes').innerHTML = '<thead><tr><th>Filial</th><th>TES</th><th>Texto padrão (SF4)</th><th>CFOP</th><th class="c">Gera Dupl.</th><th>Poder terc.</th><th>Regra automática</th><th class="n">Itens</th><th class="n">Valor</th><th class="c">Conta como gasto?</th></tr></thead><tbody>' +
      (tes.length ? tes.map((g) => { const m = R.MOTIVOS[g.auto] || { rotulo: g.auto }; return '<tr><td class="cod">' + esc(g.fil) + '</td><td class="cod">' + esc(g.tes || '(vazio)') + '</td><td>' + esc(g.texto || '—') + '</td><td class="cod">' + esc(Array.from(g.cfops).filter(Boolean).sort().join(', ')) + '</td>' +
        '<td class="c">' + (g.geraDup == null ? '—' : g.geraDup ? 'Sim' : 'Não') + '</td><td class="fraco nw">' + esc(g.poder || '—') + '</td><td><span class="motivo ' + (g.auto === 'GASTO' ? 'gasto' : '') + '">' + esc(m.rotulo) + '</span></td>' +
        '<td class="n">' + fmtInt.format(g.itens) + '</td><td class="n">' + moeda0(g.valor) + '</td>' +
        '<td class="c"><label class="switch"><input type="checkbox" data-tes="' + esc(g.chave) + '" data-auto="' + g.auto + '"' + (g.gasto ? ' checked' : '') + '>' + (g.ajustado ? '<span class="ajustado">ajustado</span>' : '') + '</label></td></tr>'; }).join('') : '<tr><td colspan="10" class="vazio">Nenhuma TES nesse filtro.</td></tr>') + '</tbody>';
  }

  function ajustarTes(chave, auto, contar) {
    const padraoGasto = auto === 'GASTO';
    if (contar === padraoGasto) delete estado.ajustes[chave];
    else estado.ajustes[chave] = contar ? 'gasto' : 'fora';
    gravarLocal('cg_ajustes_v1', estado.ajustes);
    D.aplicarAjustes(estado.itens, estado.ajustes);
    popularFiltros();
    const wrap = $('#t-tes').parentElement; const sc = wrap.scrollTop;
    renderizar();
    wrap.scrollTop = sc;
    toast('TES ' + chave.replace('|', ' / ') + (contar ? ' agora conta como gasto.' : ' não conta mais como gasto.'));
  }

  /* ---------------- ITENS ---------------- */
  function listaItens() {
    const s = estado.itensAba.status;
    return estado.itens.filter((it) => passaFiltros(it) && (s === 'todos' || (s === 'gasto' ? it.gasto : !it.gasto))).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  }
  function renderItens() {
    $$('#i-status button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === estado.itensAba.status));
    const lista = listaItens();
    const POR = 50;
    const pags = Math.max(1, Math.ceil(lista.length / POR));
    if (estado.itensAba.pagina >= pags) estado.itensAba.pagina = pags - 1;
    const pg = estado.itensAba.pagina;
    const vis = lista.slice(pg * POR, pg * POR + POR);
    $('#i-total').textContent = fmtInt.format(lista.length) + ' itens · ' + moeda(soma(lista));
    $('#t-itens').innerHTML = '<thead><tr><th>Data</th><th>Filial</th><th>NF / Série</th><th>Fornecedor</th><th>Produto</th><th>Descrição</th><th>UN</th><th class="n">Qtd</th><th class="n">Preço unit.</th><th class="n">Valor</th><th>TES</th><th>CFOP</th><th>C. custo</th><th>Classe valor</th><th>Natureza</th><th>Situação</th></tr></thead><tbody>' +
      (vis.length ? vis.map((it) => { const m = R.MOTIVOS[it.motivo] || { rotulo: it.motivo }; return '<tr class="clicavel" data-prod="' + esc(it.prod + '|' + it.un) + '"><td>' + dataBr(it.data) + '</td><td class="cod">' + esc(it.fil) + '</td><td class="cod">' + esc(it.doc) + (it.serie ? ' / ' + esc(it.serie) : '') + '</td><td class="nw">' + esc(nomeForn(it.forn)) + '</td><td class="cod">' + esc(it.prod) + '</td><td class="desc">' + esc(it.desc) + '</td><td>' + esc(it.un) + '</td><td class="n">' + fmtQtd.format(it.qtd) + '</td><td class="n">' + preco(it.vu) + '</td><td class="n">' + moeda(val(it)) + '</td><td class="cod" title="' + esc(it.tesTexto) + '">' + esc(it.tes) + '</td><td class="cod">' + esc(it.cfop) + '</td><td class="cod">' + esc(it.cc) + '</td><td class="cod">' + esc(it.cv) + '</td><td class="nw">' + esc(it.natureza) + '</td><td><span class="motivo ' + (it.gasto ? 'gasto' : '') + '">' + esc(m.rotulo) + '</span></td></tr>'; }).join('') : '<tr><td colspan="16" class="vazio">Nenhum item.</td></tr>') + '</tbody>';
    $('#i-pag').innerHTML = '<button class="btn btn-sec" data-pag="-1"' + (pg === 0 ? ' disabled' : '') + '>‹ Anterior</button><span>Página ' + (pg + 1) + ' de ' + pags + '</span><button class="btn btn-sec" data-pag="1"' + (pg >= pags - 1 ? ' disabled' : '') + '>Próxima ›</button>';
  }

  function exportarCsv() {
    const lista = listaItens();
    const n = (v) => String(Math.round(v * 10000) / 10000).replace('.', ',');
    const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const cab = ['Data', 'Filial', 'Documento', 'Serie', 'Fornecedor', 'Nome fornecedor', 'Produto', 'Descricao', 'UN', 'Quantidade', 'Vlr Unitario', 'Vlr Total', 'Valor c/ impostos e frete', 'TES', 'Texto TES', 'CFOP', 'Centro custo', 'Classe valor', 'Pedido', 'Natureza', 'Origem', 'Situacao'];
    const linhas = lista.map((it) => [dataBr(it.data), it.fil, it.doc, it.serie, it.forn, C.nomesFornecedores[it.forn] || '', it.prod, it.desc, it.un, n(it.qtd), n(it.vu), n(it.vt), n(it.vc), it.tes, it.tesTexto, it.cfop, it.cc, it.cv, it.ped, it.natureza, it.origem, (R.MOTIVOS[it.motivo] || {}).rotulo || it.motivo].map(q).join(';'));
    const blob = new Blob(['﻿' + cab.join(';') + '\r\n' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'consultor-gastos-itens-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* =====================================================================
     EVENTOS
     ===================================================================== */
  function irPara(aba) {
    estado.aba = aba;
    $$('.abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === aba));
    $$('.aba').forEach((s) => { s.hidden = s.id !== 'aba-' + aba; });
    renderizar();
    window.scrollTo({ top: 0 });
  }

  function ligarEventos() {
    prepararZona('sd1'); prepararZona('sf4');
    $('#btn-analisar').addEventListener('click', analisar);
    $('#btn-atualizar').addEventListener('click', () => mostrarCarga(true));
    $('#btn-cancelar-carga').addEventListener('click', () => { mostrarApp(); renderizar(); });
    $('#topo-empresa').textContent = C.empresa || '';

    $$('.abas button').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.aba)));

    const mapF = { 'f-de': 'de', 'f-ate': 'ate', 'f-fil': 'fil', 'f-cc': 'cc', 'f-cv': 'cv', 'f-nat': 'nat', 'f-ori': 'ori' };
    Object.keys(mapF).forEach((id) => $('#' + id).addEventListener('change', (e) => aplicarFiltro(mapF[id], e.target.value)));
    let tBusca;
    $('#f-busca').addEventListener('input', (e) => { clearTimeout(tBusca); tBusca = setTimeout(() => aplicarFiltro('busca', e.target.value.trim()), 300); });
    $('#f-valor').addEventListener('change', (e) => { estado.modoValor = e.target.value; renderizar(); });
    $('#btn-limpar').addEventListener('click', () => {
      Object.keys(estado.filtros).forEach((k) => { estado.filtros[k] = ''; });
      estado.filtros.de = estado.meses[0]; estado.filtros.ate = estado.meses[estado.meses.length - 1];
      aplicarFiltro('busca', '', 'Filtros limpos');
    });
    $('#chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-limpa]'); if (!b) return;
      const k = b.dataset.limpa;
      if (k === 'periodo') { estado.filtros.de = estado.meses[0]; aplicarFiltro('ate', estado.meses[estado.meses.length - 1]); } else aplicarFiltro(k, '');
    });

    // cliques dentro do app (delegação)
    $('#tela-app').addEventListener('click', (e) => {
      const ir = e.target.closest('[data-ir]');
      if (ir) { e.preventDefault(); if (ir.dataset.tend) estado.precos.tendencia = ir.dataset.tend; irPara(ir.dataset.ir); return; }
      const fo = e.target.closest('tr[data-forn]');
      if (fo) { aplicarFiltro('forn', fo.dataset.forn, 'Filtrado pelo fornecedor ' + nomeForn(fo.dataset.forn)); return; }
      const fl = e.target.closest('tr[data-filtro]');
      if (fl) { aplicarFiltro(fl.dataset.filtro, fl.dataset.v, 'Filtro aplicado'); return; }
      const mo = e.target.closest('tr[data-motivo]');
      if (mo) { estado.itensAba.status = mo.dataset.motivo === 'GASTO' ? 'gasto' : 'fora'; irPara('itens'); return; }
      if (e.target.closest('input[type=checkbox]')) return;
      const pr = e.target.closest('tr[data-prod]');
      if (pr) { abrirProduto(pr.dataset.prod); return; }
      if (e.target.id === 'p-mais-btn') { estado.precos.mostrar += 200; renderPrecos(); return; }
      if (e.target.id === 'abc-mais-btn') { estado.abc.mostrar += 200; renderAbc(); return; }
      const pg = e.target.closest('[data-pag]');
      if (pg) { estado.itensAba.pagina += +pg.dataset.pag; renderItens(); }
    });

    // preços
    $('#p-tend').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; estado.precos.tendencia = b.dataset.v; estado.precos.mostrar = 100; renderPrecos(); });
    $('#p-limite').addEventListener('change', (e) => { estado.precos.limite = Math.max(0, +e.target.value || 0); renderPrecos(); });
    $('#p-min').addEventListener('change', (e) => { estado.precos.minCompras = Math.max(1, +e.target.value || 1); renderPrecos(); });
    $('#p-serv').addEventListener('change', (e) => { estado.precos.incluirServicos = e.target.checked; renderPrecos(); });
    $('#p-ordem').addEventListener('change', (e) => { estado.precos.ordem = e.target.value; renderPrecos(); });

    // abc
    $('#abc-ordem').addEventListener('change', (e) => { estado.abc.ordem = e.target.value; renderAbc(); });
    $('#abc-classe').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; estado.abc.classe = b.dataset.v; estado.abc.mostrar = 100; renderAbc(); });
    $('#abc-serv').addEventListener('change', (e) => { estado.abc.incluirServicos = e.target.checked; renderAbc(); });

    // regras
    $('#r-filtro').addEventListener('change', (e) => { estado.regras.filtro = e.target.value; renderRegras(); });
    $('#t-tes').addEventListener('change', (e) => { const c = e.target.closest('input[data-tes]'); if (c) ajustarTes(c.dataset.tes, c.dataset.auto, c.checked); });
    $('#btn-restaurar').addEventListener('click', () => {
      if (!Object.keys(estado.ajustes).length) { toast('Nenhum ajuste para restaurar.'); return; }
      estado.ajustes = {}; gravarLocal('cg_ajustes_v1', {}); D.aplicarAjustes(estado.itens, {}); popularFiltros(); renderizar(); toast('Regras padrão restauradas.');
    });

    // itens
    $('#i-status').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; estado.itensAba.status = b.dataset.v; estado.itensAba.pagina = 0; renderItens(); });
    $('#btn-csv').addEventListener('click', exportarCsv);

    // modal
    $('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-fechar]')) fecharModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) fecharModal(); });
  }

  /* ---------------- Início ---------------- */
  async function iniciar() {
    ligarEventos();
    if (!window.Chart || !window.fflate) { mostrarCarga(false); statusCarga('Não encontrei as bibliotecas da pasta "vendor". Confira se a pasta foi copiada junto com o app.', true); return; }
    const base = await D.carregarBase();
    if (base && base.versao === VERSAO && base.sd1 && base.sd1.linhas) {
      try { usarBase(base); return; } catch (e) { console.error(e); }
    }
    mostrarCarga(false);
  }
  iniciar();
})();
