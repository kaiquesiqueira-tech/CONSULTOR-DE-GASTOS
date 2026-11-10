/* =====================================================================
   REGRAS DO CONSULTOR DE GASTOS
   ---------------------------------------------------------------------
   Aqui fica a "inteligência" de negócio:
   1) Quais colunas o app procura em cada planilha (SD1 e SF4)
   2) Como ligar SD1 x SF4  -> Filial + TES (D1_TES = F4_CODIGO)
   3) O que conta como GASTO e o que fica de fora (e por quê)
   4) Natureza do gasto e origem (dentro/fora do estado/exterior)
   Para ajustar uma regra, mude aqui. Ajustes por TES também podem ser
   feitos pela tela "Regras / Fora do gasto" do próprio app.
   ===================================================================== */
(function (root) {
  'use strict';

  /* ---------- 1) Colunas procuradas (cabeçalho do relatório do Protheus) ---------- */
  const SPEC_SD1 = {
    identificar: ['Filial', 'Produto', 'Quantidade'],
    colunas: {
      filial: ['Filial'],
      item: ['Item NF', 'Item'],
      produto: ['Produto'],
      descricao: ['Desc.', 'Descricao', 'Desc. Produto', 'Descricao Prod'],
      unidade: ['Unidade', 'Unid. Medida', 'UM'],
      quantidade: ['Quantidade'],
      vlrUnit: ['Vlr.Unitario', 'Vlr. Unitario', 'Prc Unitario', 'Preco Unitario'],
      vlrTotal: ['Vlr.Total', 'Vlr. Total', 'Valor Total'],
      armazem: ['Armazem'],
      tes: ['Tipo Entrada', 'TES', 'Tipo Entr.'],
      cfop: ['Cod. Fiscal', 'CFOP'],
      centroCusto: ['Centro Custo', 'C. Custo', 'C Custo', 'Centro de Custo'],
      classeValor: ['Classe Valor', 'Cl. Valor', 'Classe de Valor'],
      contaContabil: ['C Contabil', 'Conta Contabil', 'Cta Contabil'],
      pedido: ['No do Pedido', 'Pedido', 'Num. Pedido'],
      fornecedor: ['Forn/Cliente', 'Fornecedor', 'Cod. Fornec'],
      loja: ['Loja'],
      documento: ['Documento', 'Nota Fiscal', 'Num. Docto'],
      serie: ['Serie'],
      data: ['DT Digitacao', 'Dt. Digitacao', 'Data Digitacao', 'DT Emissao', 'Emissao'],
      vlrIpi: ['Vlr.IPI', 'Valor IPI'],
      icmsSt: ['ICMS Solid.', 'ICMS ST'],
      frete: ['Vlr. Frete', 'Vlr.Frete'],
      seguro: ['Vlr. Seguro', 'Vlr.Seguro'],
      despesa: ['Vlr. Despesa', 'Vlr.Despesa'],
      desconto: ['Desconto', 'Vlr. Desconto'],
    },
  };

  const SPEC_SF4 = {
    identificar: ['Cod. do Tipo', 'Tipo do TES'],
    colunas: {
      tes: ['Cod. do Tipo', 'Codigo', 'TES'],
      tipo: ['Tipo do TES'],
      filial: ['Filial'],
      cfop: ['Cod. Fiscal'],
      geraDup: ['Gera Dupl.', 'Gera Duplicata'],
      atuEstoque: ['Atu.Estoque', 'Atualiza Estoque'],
      texto: ['Txt Padrao', 'Texto Padrao'],
      poderTerc: ['Poder Terc.', 'Poder Terceiros'],
      transFilial: ['Trans filial', 'Transf. Filial'],
      matConsumo: ['Mat.Consumo', 'Material Consumo'],
      atualAtivo: ['Atual.Ativo', 'Atualiza Ativo'],
      finalidade: ['Finalidade'],
      bloqueado: ['Bloqueado'],
    },
  };

  /* ---------- 2) Chaves de ligação ---------- */
  /** Códigos do Protheus vêm como número no Excel (20102) -> volta com zeros (020102). */
  function codigo(v, tam) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return String(Math.round(v)).padStart(tam, '0');
    const s = String(v).trim();
    return /^\d+$/.test(s) ? s.padStart(tam, '0') : s;
  }
  function texto(v) { return v == null ? '' : String(v).trim(); }
  function simNao(v) {
    const s = texto(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s === 'sim' || s === 's' || s === '1' || s === 'true';
  }

  /* ---------- 3) O que é gasto ---------- */
  // Grupos de CFOP (últimos 3 dígitos do CFOP de entrada)
  const CFOP_DEVOLUCAO = new Set([201, 202, 203, 204, 205, 206, 207, 410, 411, 503, 504, 553, 660, 661, 662, 918, 919]);
  const CFOP_TRANSFERENCIA = new Set([151, 152, 153, 154, 155, 156, 208, 209, 408, 409, 552, 557, 658, 659]);
  const CFOP_TERCEIROS = new Set([901, 902, 903, 904, 905, 906, 907, 908, 909, 912, 913, 914, 915, 916, 920, 921, 924, 925, 934]);
  const CFOP_BONIFICACAO = new Set([910, 911]);

  const MOTIVOS = {
    GASTO: { rotulo: 'Gasto', explicacao: 'Compra/serviço que gera contas a pagar (TES com "Gera Dupl. = Sim").' },
    SEM_TES: { rotulo: 'Pré-nota sem TES', explicacao: 'Item ainda não classificado no Protheus (sem TES). Não dá para saber se é gasto.' },
    TES_NAO_ENCONTRADA: { rotulo: 'TES não encontrada no SF4', explicacao: 'O código de TES do item não existe no SF4 enviado para aquela filial.' },
    TES_SAIDA: { rotulo: 'TES de saída', explicacao: 'O código de TES é de saída, não de entrada.' },
    DEVOLUCAO: { rotulo: 'Devolução de venda / anulação', explicacao: 'Cliente devolvendo mercadoria ou anulação de frete. É dinheiro voltando, não gasto.' },
    TRANSFERENCIA: { rotulo: 'Transferência entre filiais', explicacao: 'Mercadoria vindo de outra filial do grupo. O gasto já foi contado na compra original.' },
    TERCEIROS: { rotulo: 'Remessa/retorno de terceiros', explicacao: 'Conserto, industrialização, comodato, demonstração, vasilhame... O material não foi comprado.' },
    BONIFICACAO: { rotulo: 'Bonificação / brinde / amostra', explicacao: 'Entrada sem custo para a empresa.' },
    SEM_FINANCEIRO: { rotulo: 'Não gera contas a pagar', explicacao: 'TES com "Gera Dupl. = Não": não gera título a pagar (crédito de imposto, remessa, garantia, escrituração...).' },
    AJUSTE_MANUAL: { rotulo: 'Retirado manualmente', explicacao: 'Você marcou esta TES para não contar como gasto na tela de Regras.' },
  };

  /**
   * Classifica um item da SD1.
   * @param {object} it  item da SD1 (já com fil, tes, cfopNum)
   * @param {object|undefined} tes  registro do SF4 para Filial+TES
   * @returns {string} código do motivo (GASTO ou um dos motivos de exclusão)
   */
  function motivo(it, tes) {
    if (!it.tes) return 'SEM_TES';
    if (!tes) return 'TES_NAO_ENCONTRADA';
    if (/^s/i.test(tes.tipo || '')) return 'TES_SAIDA';
    const c3 = it.cfopNum % 1000;
    if (CFOP_DEVOLUCAO.has(c3)) return 'DEVOLUCAO';
    if (CFOP_TRANSFERENCIA.has(c3) || tes.transFilial) return 'TRANSFERENCIA';
    if (CFOP_TERCEIROS.has(c3) || (tes.poderTerc && !/^nao/i.test(tes.poderTerc))) return 'TERCEIROS';
    if (CFOP_BONIFICACAO.has(c3)) return 'BONIFICACAO';
    if (!tes.geraDup) return 'SEM_FINANCEIRO';
    return 'GASTO';
  }

  /* ---------- 4) Natureza e origem ---------- */
  function natureza(it, tes) {
    const c3 = it.cfopNum % 1000;
    if (tes && tes.atualAtivo) return 'Ativo imobilizado';
    if ([101, 111, 116, 120, 122, 124, 125, 126, 128, 401].includes(c3)) return 'Matéria-prima e insumos';
    if ([102, 113, 117, 118, 121, 403, 501].includes(c3)) return 'Mercadorias p/ revenda';
    if (c3 >= 251 && c3 <= 257) return 'Energia elétrica';
    if (c3 >= 301 && c3 <= 306) return 'Comunicação';
    if ((c3 >= 351 && c3 <= 360) || c3 === 931 || c3 === 932) return 'Fretes e transportes';
    if ([406, 551, 555].includes(c3)) return 'Ativo imobilizado';
    if ([407, 556].includes(c3)) return 'Uso e consumo';
    if (c3 >= 650 && c3 <= 667) return 'Combustíveis e lubrificantes';
    if (c3 === 933) return 'Serviços';
    if (c3 === 922 || c3 === 923) return 'Compra p/ entrega futura';
    if (c3 === 949) return 'Outras despesas';
    return 'Outros';
  }

  function origem(cfopNum) {
    const d = Math.floor(cfopNum / 1000);
    if (d === 1) return 'Dentro do estado';
    if (d === 2) return 'Outros estados';
    if (d === 3) return 'Exterior (importação)';
    return 'Não informado';
  }

  /* ---------- Montagem do SF4 em mapa Filial|TES ---------- */
  function montarMapaTes(sf4) {
    const d = sf4.dados;
    const mapa = new Map();
    for (let i = 0; i < sf4.linhas; i++) {
      const cod = codigo(d.tes[i], 3);
      if (!cod) continue;
      const fil = codigo(d.filial[i], 6);
      const reg = {
        fil, tes: cod,
        tipo: texto(d.tipo[i]),
        cfop: texto(d.cfop[i]),
        geraDup: simNao(d.geraDup[i]),
        atuEstoque: simNao(d.atuEstoque[i]),
        texto: texto(d.texto[i]),
        poderTerc: texto(d.poderTerc[i]),
        transFilial: simNao(d.transFilial[i]),
        matConsumo: simNao(d.matConsumo[i]),
        atualAtivo: simNao(d.atualAtivo[i]),
        finalidade: texto(d.finalidade[i]),
        bloqueado: simNao(d.bloqueado[i]),
      };
      mapa.set(fil + '|' + cod, reg);
      // TES compartilhada (filial em branco no SF4) vale para todas as filiais
      if (!fil) mapa.set('*|' + cod, reg);
    }
    return mapa;
  }

  function acharTes(mapa, fil, tes) {
    return mapa.get(fil + '|' + tes) || mapa.get('*|' + tes);
  }

  const api = { SPEC_SD1, SPEC_SF4, MOTIVOS, codigo, texto, simNao, motivo, natureza, origem, montarMapaTes, acharTes };
  root.Regras = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
