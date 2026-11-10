/* =====================================================================
   Leitor de planilhas .xlsx (exportadas do Protheus) direto no navegador
   ---------------------------------------------------------------------
   - Lê o .xlsx em "streaming": descompacta a planilha aos pedaços e só
     guarda as colunas que o app usa. Assim, arquivos grandes (SD1 com
     50 MB / 250 colunas) abrem sem travar o navegador.
   - Não depende de servidor: funciona abrindo o index.html direto ou
     pelo Live Server do VSCode.
   ===================================================================== */
(function (root) {
  'use strict';

  const fflate = root.fflate || (typeof require === 'function' ? require('../vendor/fflate.min.js') : null);
  const tdUtf8 = new TextDecoder('utf-8');

  /** Normaliza nomes de colunas: sem acento, minúsculo, só letras e números. */
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function decodeXml(s) {
    if (s.indexOf('&') === -1 && s.indexOf('_x') === -1) return s;
    return s
      .replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, e) => {
        if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
        return ENT[e];
      })
      .replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  }

  function colIndex(letras) {
    let n = 0;
    for (let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
    return n - 1;
  }

  /* ---------------- ZIP (diretório central) ---------------- */
  function lerZip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('O arquivo não parece ser um .xlsx válido.');
    let total = dv.getUint16(eocd + 10, true);
    let cdOff = dv.getUint32(eocd + 16, true);
    // ZIP64
    if (cdOff === 0xffffffff || total === 0xffff) {
      const loc = eocd - 20;
      if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50) {
        const z64 = Number(dv.getBigUint64(loc + 8, true));
        total = Number(dv.getBigUint64(z64 + 32, true));
        cdOff = Number(dv.getBigUint64(z64 + 48, true));
      }
    }
    const entradas = {};
    let p = cdOff;
    for (let k = 0; k < total; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true);
      let csize = dv.getUint32(p + 20, true);
      let usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true);
      const elen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      let lho = dv.getUint32(p + 42, true);
      const nome = tdUtf8.decode(u8.subarray(p + 46, p + 46 + nlen));
      if (csize === 0xffffffff || usize === 0xffffffff || lho === 0xffffffff) {
        let e = p + 46 + nlen; const fim = e + elen;
        while (e < fim) {
          const id = dv.getUint16(e, true), sz = dv.getUint16(e + 2, true);
          if (id === 1) {
            let q = e + 4;
            if (usize === 0xffffffff) { usize = Number(dv.getBigUint64(q, true)); q += 8; }
            if (csize === 0xffffffff) { csize = Number(dv.getBigUint64(q, true)); q += 8; }
            if (lho === 0xffffffff) { lho = Number(dv.getBigUint64(q, true)); }
          }
          e += 4 + sz;
        }
      }
      entradas[nome.replace(/^\//, '')] = { metodo, csize, usize, lho };
      p += 46 + nlen + elen + clen;
    }
    return { entradas, dv };
  }

  function bytesDaEntrada(u8, dv, e) {
    const nlen = dv.getUint16(e.lho + 26, true);
    const elen = dv.getUint16(e.lho + 28, true);
    const ini = e.lho + 30 + nlen + elen;
    return u8.subarray(ini, ini + e.csize);
  }

  function lerEntradaInteira(u8, dv, e) {
    const dados = bytesDaEntrada(u8, dv, e);
    if (e.metodo === 0) return tdUtf8.decode(dados);
    return tdUtf8.decode(fflate.inflateSync(dados));
  }

  /** Descompacta aos pedaços e entrega texto ao callback. Cede a vez ao navegador entre pedaços. */
  async function lerEntradaStream(u8, dv, e, aoTexto, aoProgresso) {
    const dados = bytesDaEntrada(u8, dv, e);
    const td = new TextDecoder('utf-8');
    const PASSO = 512 * 1024;
    if (e.metodo === 0) {
      for (let i = 0; i < dados.length; i += PASSO) {
        const fim = Math.min(dados.length, i + PASSO);
        aoTexto(td.decode(dados.subarray(i, fim), { stream: fim < dados.length }));
        if (aoProgresso) aoProgresso(fim / dados.length);
        await pausa();
      }
      return;
    }
    const inf = new fflate.Inflate((chunk, final) => {
      aoTexto(td.decode(chunk, { stream: !final }));
    });
    for (let i = 0; i < dados.length; i += PASSO) {
      const fim = Math.min(dados.length, i + PASSO);
      inf.push(dados.subarray(i, fim), fim >= dados.length);
      if (aoProgresso) aoProgresso(fim / dados.length);
      await pausa();
    }
  }

  function pausa() { return new Promise((r) => setTimeout(r, 0)); }

  /* ---------------- Workbook: localizar a 1ª planilha ---------------- */
  function caminhoPrimeiraPlanilha(u8, zip) {
    const { entradas, dv } = zip;
    try {
      const wb = lerEntradaInteira(u8, dv, entradas['xl/workbook.xml']);
      const rels = lerEntradaInteira(u8, dv, entradas['xl/_rels/workbook.xml.rels']);
      const m = wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/) || wb.match(/<sheet\b[^>]*\bid="([^"]+)"/);
      if (m) {
        const re = new RegExp('<Relationship\\b[^>]*Id="' + m[1] + '"[^>]*>');
        const rel = rels.match(re);
        if (rel) {
          const alvo = rel[0].match(/Target="([^"]+)"/)[1].replace(/^\/?xl\//, '').replace(/^\//, '');
          const cam = 'xl/' + alvo;
          if (entradas[cam]) return cam;
        }
      }
    } catch (err) { /* cai no padrão abaixo */ }
    const nomes = Object.keys(entradas).filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort();
    if (!nomes.length) throw new Error('Nenhuma planilha encontrada dentro do arquivo.');
    return nomes[0];
  }

  function lerSharedStrings(u8, zip) {
    const e = zip.entradas['xl/sharedStrings.xml'];
    if (!e) return [];
    const xml = lerEntradaInteira(u8, zip.dv, e);
    const out = [];
    let p = 0;
    while (true) {
      const a = xml.indexOf('<si', p);
      if (a === -1) break;
      const b = xml.indexOf('</si>', a);
      let corpo = xml.substring(xml.indexOf('>', a) + 1, b);
      if (corpo.indexOf('<rPh') !== -1) corpo = corpo.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
      let txt = '';
      let q = 0;
      while (true) {
        const t = corpo.indexOf('<t', q);
        if (t === -1) break;
        const c = corpo.charCodeAt(t + 2);
        if (c !== 62 && c !== 32) { q = t + 2; continue; } // não é <t> nem <t ...>
        const gt = corpo.indexOf('>', t);
        if (corpo.charCodeAt(gt - 1) === 47) { q = gt + 1; continue; } // <t/>
        const f = corpo.indexOf('</t>', gt);
        txt += corpo.substring(gt + 1, f);
        q = f + 4;
      }
      out.push(decodeXml(txt));
      p = b + 5;
    }
    return out;
  }

  /* ---------------- Leitura principal ---------------- */
  /**
   * @param {ArrayBuffer|Uint8Array} buffer  conteúdo do .xlsx
   * @param {object} spec  { identificar: [nomes de colunas que provam que é o arquivo certo],
   *                         colunas: { chave: [apelidos do cabeçalho] } }
   * @param {function} aoProgresso  recebe 0..1
   * @returns {Promise<{dados: Object<string, Array>, linhas: number, cabecalho: string[], faltando: string[]}>}
   */
  async function lerPlanilha(buffer, spec, aoProgresso) {
    if (!fflate) throw new Error('Biblioteca fflate não carregada.');
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (u8[0] !== 0x50 || u8[1] !== 0x4b) throw new Error('O arquivo não é .xlsx (talvez seja .xls antigo ou .csv). Salve como .xlsx e tente de novo.');
    const zip = lerZip(u8);
    const sst = lerSharedStrings(u8, zip);
    const cam = caminhoPrimeiraPlanilha(u8, zip);

    const chaves = Object.keys(spec.colunas);
    const identificar = (spec.identificar || []).map(norm);
    const dados = {}; chaves.forEach((k) => { dados[k] = []; });
    let mapa = null;          // índice da coluna -> chave
    let cabecalho = null;
    let linhasLidas = 0;
    let linhasAntesCab = 0;
    let buf = '';

    function valorCelula(tipo, interno) {
      if (tipo === 'inlineStr') {
        let txt = ''; const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g; let m;
        while ((m = re.exec(interno))) txt += m[1];
        return decodeXml(txt);
      }
      const a = interno.indexOf('<v>');
      if (a === -1) return null;
      const v = interno.substring(a + 3, interno.indexOf('</v>', a));
      if (tipo === 's') return sst[+v];
      if (tipo === 'str') return decodeXml(v);
      if (tipo === 'b') return v === '1';
      if (tipo === 'e') return null;
      if (tipo === 'd') return v;
      const n = +v;
      return Number.isNaN(n) ? v : n;
    }

    function processarLinha(s) {
      // s = conteúdo entre <row ...> e </row>
      const tudo = mapa === null; // antes do cabeçalho lê todas as colunas
      const vals = tudo ? [] : null;
      const reg = tudo ? null : new Array(chaves.length);
      let tem = false;
      let ultimaCol = -1;
      let p = 0;
      while (true) {
        const a = s.indexOf('<c', p);
        if (a === -1) break;
        const ch = s.charCodeAt(a + 2);
        if (ch !== 32 && ch !== 62 && ch !== 47) { p = a + 2; continue; }
        const gt = s.indexOf('>', a);
        const auto = s.charCodeAt(gt - 1) === 47;
        const attrs = s.substring(a + 2, auto ? gt - 1 : gt);
        let col;
        const ri = attrs.indexOf('r="');
        if (ri !== -1 && (ri === 0 || attrs.charCodeAt(ri - 1) === 32)) {
          let j = ri + 3, letras = '';
          while (j < attrs.length) { const c = attrs.charCodeAt(j); if (c >= 65 && c <= 90) { letras += attrs[j]; j++; } else break; }
          col = colIndex(letras);
        } else col = ultimaCol + 1;
        ultimaCol = col;
        if (auto) { p = gt + 1; continue; }
        const fim = s.indexOf('</c>', gt);
        const destino = tudo ? col : mapa[col];
        if (destino !== undefined && destino !== -1) {
          const ti = attrs.indexOf('t="');
          const tipo = ti === -1 ? 'n' : attrs.substring(ti + 3, attrs.indexOf('"', ti + 3));
          const v = valorCelula(tipo, s.substring(gt + 1, fim));
          if (v !== null && v !== '') {
            if (tudo) vals[col] = v; else { reg[destino] = v; tem = true; }
          }
        }
        p = fim + 4;
      }
      if (tudo) {
        linhasAntesCab++;
        const nomes = vals.map((v) => norm(v));
        const achou = identificar.every((id) => nomes.indexOf(id) !== -1);
        if (achou) {
          cabecalho = Array.from(vals, (v) => (v == null ? '' : String(v).trim()));
          mapa = new Array(cabecalho.length).fill(-1);
          chaves.forEach((k, ki) => {
            const apelidos = spec.colunas[k].map(norm);
            for (const ap of apelidos) {
              const idx = nomes.findIndex((n, i) => n === ap && mapa[i] === -1);
              if (idx !== -1) { mapa[idx] = ki; break; }
            }
          });
        } else if (linhasAntesCab > 30) {
          throw new Error('Não encontrei o cabeçalho esperado (' + spec.identificar.join(', ') + '). Confira se é o arquivo certo.');
        }
        return;
      }
      if (!tem) return;
      for (let i = 0; i < chaves.length; i++) dados[chaves[i]].push(reg[i] === undefined ? null : reg[i]);
      linhasLidas++;
    }

    function consumir(texto) {
      buf += texto;
      const ult = buf.lastIndexOf('</row>');
      let limite = ult === -1 ? -1 : ult + 6;
      // linhas vazias auto-fechadas <row .../> também contam
      if (limite === -1) {
        if (buf.length > 4 * 1024 * 1024 && buf.indexOf('<row') === -1) buf = buf.slice(-1024);
        return;
      }
      const bloco = buf.substring(0, limite);
      buf = buf.substring(limite);
      let p = 0;
      while (true) {
        const a = bloco.indexOf('<row', p);
        if (a === -1) break;
        const gt = bloco.indexOf('>', a);
        if (bloco.charCodeAt(gt - 1) === 47) { p = gt + 1; continue; }
        const f = bloco.indexOf('</row>', gt);
        processarLinha(bloco.substring(gt + 1, f));
        p = f + 6;
      }
    }

    await lerEntradaStream(u8, zip.dv, zip.entradas[cam], consumir, aoProgresso);
    if (!mapa) throw new Error('Não encontrei o cabeçalho esperado (' + (spec.identificar || []).join(', ') + '). Confira se é o arquivo certo.');

    const faltando = chaves.filter((k, ki) => mapa.indexOf(ki) === -1);
    return { dados, linhas: linhasLidas, cabecalho, faltando };
  }

  /** Converte valor de data do Excel/Protheus para 'AAAA-MM-DD' (ou null). */
  function paraDataISO(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      if (v > 19000000 && v < 21000000) { // 20251002
        const s = String(Math.round(v)); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
      }
      const d = new Date(Math.round((v - 25569) * 86400000));
      if (isNaN(d)) return null;
      return d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { let a = m[3]; if (a.length === 2) a = '20' + a; return a + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    return null;
  }

  const api = { lerPlanilha, paraDataISO, norm };
  root.LeitorXlsx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
