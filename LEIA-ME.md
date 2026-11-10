# Consultor de Gastos

App web para analisar os gastos da empresa a partir de duas planilhas exportadas do Protheus:

| Planilha | O que é | Como exportar |
|---|---|---|
| **SD1** | Itens das NF de Entrada | Consulta Genérica → Itens das NF de Entrada → exportar para Excel (.xlsx) |
| **SF4** | Tipos de Entrada e Saída (TES) | Cadastro de TES → exportar para Excel (.xlsx) |

O app liga as duas pela **Filial + TES** (campo "Tipo Entrada" da SD1 = "Cod. do Tipo" da SF4) e separa o que é gasto do que é só movimentação.

## Como abrir no VSCode

1. Abra a pasta `consultor-gastos` no VSCode (Arquivo → Abrir pasta).
2. Instale a extensão **Live Server** (o VSCode vai sugerir sozinho, porque ela está nas recomendações da pasta).
3. Clique com o botão direito em `index.html` → **Open with Live Server**.
4. Na primeira vez, arraste a SD1 e a SF4 para a tela e clique em **Analisar gastos**.

Também funciona dando dois cliques no `index.html` (abre direto no navegador), sem instalar nada.

Os dados ficam guardados **só no seu navegador**. Na próxima vez que abrir, a análise já aparece. Para atualizar, clique em **Atualizar planilhas** (pode trocar só a SD1 e manter a SF4 anterior).

## O que conta como gasto

Nem toda nota de entrada é gasto. O app conta como **gasto** o item cuja TES tem **Gera Dupl. = Sim** (gera contas a pagar) e que **não** é:

- devolução de venda ou anulação (CFOP x201, x202, x410, x411, x553, x918...)
- transferência entre filiais (CFOP x151, x152, x408, x409, x552, x557, x659... ou TES com "Trans filial = Sim")
- remessa/retorno de terceiros: conserto, industrialização, comodato, demonstração, vasilhame (CFOP x901 a x925 ou TES com "Poder Terc." controlando)
- bonificação, brinde ou amostra (CFOP x910, x911)

Itens de **pré-nota sem TES** ficam de fora até serem classificados no Protheus.

Se alguma TES estiver classificada errado, ajuste na aba **Fora do gasto / Regras** (marcar/desmarcar "Conta como gasto"). Para mudar a regra em si, edite `js/regras.js`.

## Telas

- **Visão geral** – total gasto, média mensal, leitura automática do consultor, gasto por mês e por natureza, maiores produtos e fornecedores.
- **Onde gastou** – por filial, centro de custo, classe de valor e origem do fornecedor (dentro do estado / outros estados / exterior, pelo 1º dígito do CFOP), e a matriz filial × natureza.
- **Preços** – para cada produto: preço médio dos 3 primeiros meses × 3 últimos meses com compra, variação %, tendência (subindo / caindo / estável), histórico e **impacto/ano** (diferença de preço × quantidade comprada nos últimos 12 meses). Compras com preço 5× fora do normal são ignoradas (costumam ser erro de unidade na NF). Clique numa linha para ver o gráfico e o preço por fornecedor.
- **Produtos principais** – curva ABC (classe A ≈ 80% do gasto). Também dá para ordenar por preço unitário (mais caros), quantidade ou nº de compras.
- **Fora do gasto / Regras** – tudo o que entrou e não foi contado, com o motivo, e a lista de TES usadas.
- **Itens** – lista completa com exportação para CSV (abre no Excel).

## Nomes de filiais, centros de custo e fornecedores

As planilhas trazem só códigos. Para mostrar nomes, preencha `js/config.js`:

```js
nomesFiliais: { '020102': 'Fábrica Matriz', ... },
nomesCentrosCusto: { '302002': 'Manutenção', ... },
nomesFornecedores: { '1133510-02': 'Transportadora X', ... },
```

No mesmo arquivo dá para mudar a variação mínima para considerar que o preço subiu (padrão 5%), o mínimo de compras (padrão 3) e os cortes da curva ABC.

## Estrutura

```
consultor-gastos/
├── index.html            telas
├── css/estilo.css        visual (tema claro e escuro)
├── js/config.js          nomes e parâmetros (edite à vontade)
├── js/regras.js          regras de negócio: colunas, SD1 x SF4, o que é gasto, natureza
├── js/leitor-xlsx.js     leitor de .xlsx grande direto no navegador
├── js/dados.js           cálculos (preços, curva ABC, agrupamentos) e armazenamento local
├── js/graficos.js        gráficos
├── js/app.js             interface
└── vendor/               bibliotecas (Chart.js e fflate) – funcionam sem internet
```
