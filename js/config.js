/* =====================================================================
   CONFIGURAÇÕES DO CONSULTOR DE GASTOS  (pode editar à vontade)
   ---------------------------------------------------------------------
   As planilhas do Protheus trazem só códigos. Preencha os nomes abaixo
   para o app mostrar "020102 - Fábrica X" em vez de só "020102".
   Deixe '' (vazio) quando não souber - o app mostra só o código.
   ===================================================================== */
window.CONFIG = {
  empresa: 'Bautek Minerais Industriais',

  // Filiais (código com 6 dígitos, como no Protheus)
  nomesFiliais: {
    '020101': '',
    '020102': '',
    '020202': '',
    '020302': '',
    '020901': '',
    '100102': '',
    '100106': '',
  },

  // Centros de custo (ex.: '302002': 'Manutenção Mecânica')
  nomesCentrosCusto: {
    '999999': 'Genérico / não informado',
  },

  // Classes de valor (ex.: '101001': 'Projeto X')
  nomesClassesValor: {},

  // Fornecedores: código + loja, igual aparece no app (ex.: '10634316-01': 'Escritório Advocacia Y')
  nomesFornecedores: {},

  // Preços: variação mínima (%) para considerar que o preço SUBIU ou CAIU
  limiteTendenciaPct: 5,

  // Preços: mínimo de compras do produto no período para analisar tendência
  minimoCompras: 3,

  // Curva ABC: % acumulado que fecha a classe A e a classe B
  curvaA: 80,
  curvaB: 95,
};
