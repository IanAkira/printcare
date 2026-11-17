/*
 * PrintCare — interface do MVP (HTML + CSS + JavaScript puro)
 * Dados salvos no navegador (localStorage). Telas por rota (#/...).
 */
(function () {
  'use strict';
  const E = window.PrintCareEngine;
  const SEED = window.PrintCareSeed;
  const CHAVE = 'printcare:estado:v1';

  // Data de referência: hoje, ou ?hoje=AAAA-MM-DD (útil para capturas de tela e testes)
  const paramHoje = new URLSearchParams(location.search).get('hoje');
  const HOJE = /^\d{4}-\d{2}-\d{2}$/.test(paramHoje || '') ? paramHoje : E.hojeISO();

  // ---------- Estado ----------
  let state = carregar();

  function carregar() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { s = null; }
    if (!s || !Array.isArray(s.impressoras)) s = SEED.gerarDemo(HOJE);
    if (s.demo && s.dataReferencia && s.dataReferencia !== HOJE) {
      E.deslocarDatas(s, E.diffDays(HOJE, s.dataReferencia)); // mantém a demonstração "no presente"
    }
    salvarEstado(s);
    return s;
  }
  function salvarEstado(s) {
    try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch (e) { /* modo privado: segue só em memória */ }
  }
  function salvar() { salvarEstado(state); }

  // ---------- Utilidades ----------
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR'));
  const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const data = iso => (iso ? iso.split('-').reverse().join('/') : '—');
  const $ = sel => document.querySelector(sel);
  const imp = id => state.impressoras.find(i => i.id === id);
  const local = id => state.locais.find(l => l.id === id) || { predio: '—', setor: '—' };
  const ROTULO_NIVEL = { ok: 'Normal', atencao: 'Atenção', critico: 'Crítico', vencido: 'Vencido', info: 'Informativo' };
  const tag = (nivel, texto) => `<span class="tag ${esc(nivel)}">${esc(texto || ROTULO_NIVEL[nivel] || nivel)}</span>`;
  const barra = (pct, nivel) => `<div class="barra-linha"><div class="barra ${esc(nivel)}"><span style="width:${Math.min(100, Math.max(0, pct))}%"></span></div><b class="small">${Math.round(pct)}%</b></div>`;

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function alertas() { return E.gerarAlertas(state, HOJE); }
  function alertasAtivos() { return alertas().filter(a => !a.reconhecido); }
  function alertasDe(id) { return alertasAtivos().filter(a => a.impressoraId === id); }

  function situacao(i) {
    const ult = E.ultimaLeitura(state, i.id);
    if (ult && ult.status === 'parada' && ult.data === HOJE) return { nivel: 'critico', texto: 'Parada' };
    const as = alertasDe(i.id);
    if (as.some(a => a.tipo === 'comunicacao')) return { nivel: 'atencao', texto: 'Sem comunicação' };
    const s = E.situacaoImpressora(as);
    return { nivel: s, texto: s === 'ok' ? 'Operacional' : s === 'atencao' ? 'Atenção' : 'Crítico' };
  }

  // Gráfico de barras em SVG (sem bibliotecas)
  function barras(itens, { altura = 170, cor = '#0891B2', destaque = '#C0266D', sufixo = '' } = {}) {
    const larg = 560, margemEsq = 8, margemBase = 34, topo = 18;
    const max = Math.max(1, ...itens.map(i => i.valor));
    const passo = (larg - margemEsq * 2) / itens.length;
    const lb = Math.min(46, passo * 0.62);
    const util = altura - margemBase - topo;
    let svg = `<svg class="chart" viewBox="0 0 ${larg} ${altura}" width="100%" role="img" aria-label="Gráfico de barras">`;
    svg += `<line x1="0" y1="${altura - margemBase}" x2="${larg}" y2="${altura - margemBase}" stroke="#E2E8F0"/>`;
    itens.forEach((it, k) => {
      const h = Math.round((it.valor / max) * util);
      const x = margemEsq + k * passo + (passo - lb) / 2;
      const y = altura - margemBase - h;
      svg += `<rect x="${x}" y="${y}" width="${lb}" height="${Math.max(h, 1)}" rx="4" fill="${it.destaque ? destaque : cor}"><title>${esc(it.rotulo)}: ${esc(num(it.valor))}${sufixo}</title></rect>`;
      svg += `<text x="${x + lb / 2}" y="${y - 5}" text-anchor="middle" font-size="11" fill="#334155" font-weight="600">${esc(num(it.valor))}</text>`;
      svg += `<text x="${x + lb / 2}" y="${altura - margemBase + 15}" text-anchor="middle" font-size="10.5" fill="#5B6577">${esc(it.rotulo)}</text>`;
      if (it.sub) svg += `<text x="${x + lb / 2}" y="${altura - margemBase + 28}" text-anchor="middle" font-size="9.5" fill="#8A94A6">${esc(it.sub)}</text>`;
    });
    return svg + '</svg>';
  }

  function serieSemanalTotal(id, semanas = 8) {
    return E.serieSemanalErros(state, id, null, HOJE, semanas);
  }

  function rotulosSemanas(n) {
    return Array.from({ length: n }, (_, k) => (k === n - 1 ? 'Últ. 7d' : `S-${n - 1 - k}`));
  }

  // ---------- Layout ----------
  function definirCabecalho(titulo, sub) {
    $('#titulo').textContent = titulo;
    $('#subtitulo').textContent = sub || '';
    document.title = `${titulo} · PrintCare`;
  }

  const MENU_DE = { equipamento: 'equipamentos', 'equipamentos/novo': 'equipamentos', ordem: 'ordens', 'ordens/nova': 'ordens' };
  function atualizarMenu(rota) {
    const ativo = MENU_DE[rota] ?? rota;
    document.querySelectorAll('#menu a').forEach(a => a.classList.toggle('ativo', a.dataset.rota === ativo));
    const n = alertasAtivos().filter(a => a.gravidade !== 'info' && !a.os).length;
    $('#badge-alertas').textContent = n ? String(n) : '';
    $('#org').innerHTML = `<strong>${esc(state.organizacao.nome)}</strong>${esc(state.organizacao.cidade)} · Plano ${esc(state.organizacao.plano)}${state.demo ? '<br><span class="small">Dados de demonstração (fictícios)</span>' : ''}`;
    $('#data-hoje').textContent = `Referência: ${data(HOJE)}`;
  }

  // ---------- Telas ----------
  const telas = {};

  // Tela 1 — Visão geral
  telas[''] = () => {
    definirCabecalho('Visão geral', 'Situação do parque de impressoras e manutenções próximas');
    const imps = state.impressoras.filter(i => i.ativa !== false);
    const as = alertasAtivos();
    const criticos = as.filter(a => a.gravidade === 'critico').length;
    const comAlerta = new Set(as.filter(a => a.gravidade !== 'info').map(a => a.impressoraId)).size;
    const snmp = imps.filter(i => i.origem === 'snmp').length;
    const disp = imps.reduce((s, i) => s + E.disponibilidade(state, i.id, HOJE, 30), 0) / imps.length;

    // Páginas nos últimos 30 dias por prédio
    const porPredio = {};
    let paginas30 = 0;
    for (const i of imps) {
      const ls = E.leiturasDe(state, i.id).filter(l => l.data >= E.addDays(HOJE, -30));
      const p = ls.length >= 2 ? ls[ls.length - 1].contador - ls[0].contador : 0;
      const pr = local(i.localId).predio;
      porPredio[pr] = (porPredio[pr] || 0) + p;
      paginas30 += p;
    }

    // Próximas manutenções (até 60 dias)
    const proximas = [];
    for (const c of state.componentes) {
      const d = E.desgasteComponente(state, c, HOJE);
      if (d.diasRestantes !== null && d.diasRestantes <= 180 && d.nivel !== 'ok') {
        proximas.push({ data: d.dataPrevista, i: imp(c.impressoraId), item: `${E.TIPOS_COMPONENTE[c.tipo]} (${Math.round(d.pct)}%)`, nivel: d.nivel });
      }
    }
    for (const i of imps) {
      if (!i.ultimaPreventiva) continue;
      const venc = E.addDays(i.ultimaPreventiva, i.intervaloPreventivaDias);
      if (E.diffDays(venc, HOJE) <= 30) proximas.push({ data: venc, i, item: 'Preventiva semestral', nivel: venc < HOJE ? 'critico' : 'atencao' });
    }
    proximas.sort((a, b) => (a.data < b.data ? -1 : 1));
    const proximas30 = proximas.filter(p => E.diffDays(p.data, HOJE) <= 30).length;

    const prioritarios = as.filter(a => a.gravidade !== 'info').slice(0, 5);

    return `
      <div class="grid kpis">
        <div class="card kpi"><div class="rotulo">Impressoras monitoradas</div><div class="valor">${imps.length}</div><div class="det">${snmp} automáticas (SNMP) · ${imps.length - snmp} manuais</div></div>
        <div class="card kpi ok"><div class="rotulo">Sem alertas</div><div class="valor">${imps.length - comAlerta}</div><div class="det">${comAlerta} com algum alerta ativo</div></div>
        <div class="card kpi critico"><div class="rotulo">Alertas críticos</div><div class="valor">${criticos}</div><div class="det">${as.length} alertas no total</div></div>
        <div class="card kpi atencao"><div class="rotulo">Manutenções em 30 dias</div><div class="valor">${proximas30}</div><div class="det">inclui atrasadas</div></div>
        <div class="card kpi"><div class="rotulo">Disponibilidade (30 dias)</div><div class="valor">${disp.toFixed(1).replace('.', ',')}%</div><div class="det">média do parque</div></div>
        <div class="card kpi"><div class="rotulo">Páginas (30 dias)</div><div class="valor">${num(paginas30)}</div><div class="det">todas as impressoras</div></div>
      </div>
      <div class="grid dois" style="margin-top:16px">
        <div class="card">
          <h2>Alertas prioritários <a class="link small" href="#/alertas">ver todos</a></h2>
          <div class="lista-compacta">${prioritarios.map(cartaoAlerta).join('') || '<div class="vazio">Nenhum alerta ativo.</div>'}</div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="card">
            <h2>Páginas impressas por prédio <span class="muted">últimos 30 dias</span></h2>
            ${barras(Object.keys(porPredio).sort().map(k => ({ rotulo: k, valor: porPredio[k] })))}
          </div>
          <div class="card">
            <h2>Próximas manutenções</h2>
            <table><thead><tr><th>Data prevista</th><th>Impressora</th><th>Item</th></tr></thead><tbody>
              ${proximas.slice(0, 6).map(p => `<tr><td>${tag(p.nivel, data(p.data))}</td><td><a class="link" href="#/equipamento/${p.i.id}">${esc(p.i.codigo)}</a></td><td>${esc(p.item)}</td></tr>`).join('')}
            </tbody></table>
          </div>
        </div>
      </div>`;
  };

  function cartaoAlerta(a) {
    const i = imp(a.impressoraId);
    const acoes = [];
    if (a.os) acoes.push(`<a class="btn fraco" href="#/ordem/${a.os.id}">OS ${esc(a.os.id)} aberta</a>`);
    else acoes.push(`<a class="btn" href="#/ordens/nova?alerta=${encodeURIComponent(a.id)}">Abrir OS</a>`);
    if (a.tipo === 'anomalia') acoes.push(`<a class="btn sec" href="#/assistente?imp=${i.id}&sintoma=${a.tipoErro}">Assistente</a>`);
    if (!a.reconhecido && a.gravidade === 'info') acoes.push(`<button class="btn fraco" data-reconhecer="${esc(a.id)}">Dispensar</button>`);
    return `<div class="alerta ${esc(a.gravidade)}">
      <div>
        <h3>${tag(a.gravidade)} ${esc(a.titulo)}</h3>
        <p class="small"><a class="link" href="#/equipamento/${i.id}">${esc(i.codigo)}</a> · ${esc(i.marca)} ${esc(i.modelo)} · ${esc(local(i.localId).predio)}, ${esc(local(i.localId).setor)}</p>
        <p>${esc(a.descricao)}</p>
        <p class="rec"><b>Recomendação:</b> ${esc(a.recomendacao)}</p>
        <p class="small muted">Evidência: ${esc(a.evidencia)}</p>
      </div>
      <div class="acoes" style="align-self:start">${acoes.join('')}</div>
    </div>`;
  }

  // Tela 2 — Equipamentos
  telas['equipamentos'] = (params) => {
    definirCabecalho('Equipamentos', 'Cadastro e estado operacional das impressoras');
    const predios = [...new Set(state.locais.map(l => l.predio))].sort();
    const filtroPredio = params.get('predio') || '';
    const busca = (params.get('q') || '').toLowerCase();
    const lista = state.impressoras.filter(i => i.ativa !== false)
      .filter(i => !filtroPredio || local(i.localId).predio === filtroPredio)
      .filter(i => !busca || `${i.codigo} ${i.marca} ${i.modelo} ${local(i.localId).setor} ${i.ip}`.toLowerCase().includes(busca));
    const linhas = lista.map(i => {
      const ult = E.ultimaLeitura(state, i.id);
      const s = situacao(i);
      return `<tr>
        <td><a class="link" href="#/equipamento/${i.id}">${esc(i.codigo)}</a></td>
        <td>${esc(i.marca)} ${esc(i.modelo)}<div class="small muted">${i.tipo === 'jato' ? 'Jato de tinta' : 'Laser'}</div></td>
        <td>${esc(local(i.localId).predio)}<div class="small muted">${esc(local(i.localId).setor)}</div></td>
        <td>${esc(i.ip)}</td>
        <td>${i.origem === 'snmp' ? tag('cyan', 'SNMP') : tag('neutro', 'Manual')}</td>
        <td>${tag(s.nivel, s.texto)}</td>
        <td class="num">${num(ult && ult.contador)}</td>
        <td>${ult && ult.toner != null ? barra(ult.toner, ult.toner <= 10 ? 'critico' : ult.toner <= 20 ? 'atencao' : 'cyan') : '—'}</td>
        <td>${data(i.ultimaPreventiva)}</td>
      </tr>`;
    }).join('');
    return `
      <form class="filtros" id="form-filtro">
        <input name="q" placeholder="Buscar por código, modelo, setor ou IP" value="${esc(params.get('q') || '')}">
        <select name="predio"><option value="">Todos os prédios</option>${predios.map(p => `<option ${p === filtroPredio ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <button class="btn sec">Filtrar</button>
        <span class="muted small">${lista.length} impressora(s)</span>
        <span style="flex:1"></span>
        <a class="btn" href="#/equipamentos/novo">+ Nova impressora</a>
      </form>
      <div class="card" style="padding:0">
        <table>
          <thead><tr><th>Código</th><th>Marca e modelo</th><th>Localização</th><th>Endereço IP</th><th>Coleta</th><th>Estado</th><th class="num">Contador</th><th>Toner/tinta</th><th>Últ. preventiva</th></tr></thead>
          <tbody>${linhas || '<tr><td colspan="9" class="vazio">Nenhuma impressora encontrada.</td></tr>'}</tbody>
        </table>
      </div>`;
  };

  telas['equipamentos/novo'] = () => {
    definirCabecalho('Nova impressora', 'Cadastro de equipamento e componentes monitorados');
    const modelos = Object.keys(SEED.MODELOS);
    return `
      <form class="card" id="form-impressora" style="max-width:900px">
        <div class="campos tres">
          <label>Código interno<input name="codigo" required placeholder="Ex.: BIB-04" maxlength="12"></label>
          <label class="span2">Modelo (catálogo)<select name="modelo">${modelos.map(m => `<option>${esc(m)}</option>`).join('')}</select></label>
          <label>Prédio e setor<select name="localId">${state.locais.map(l => `<option value="${l.id}">${esc(l.predio)} — ${esc(l.setor)}</option>`).join('')}</select></label>
          <label>Forma de coleta<select name="origem"><option value="snmp">Automática (SNMP)</option><option value="manual">Manual (registro pelo técnico)</option></select></label>
          <label>Endereço IP<input name="ip" placeholder="10.10.0.0" pattern="^(\\d{1,3}\\.){3}\\d{1,3}$|^—?$"></label>
          <label>Contador atual (páginas)<input name="contador" type="number" min="0" required></label>
          <label>Toner/tinta atual (%)<input name="toner" type="number" min="0" max="100" value="100"></label>
          <label>Intervalo da preventiva (dias)<input name="intervalo" type="number" min="30" value="180"></label>
        </div>
        <p class="small muted">Os componentes monitorados e seus ciclos de referência vêm do catálogo do modelo e podem ser ajustados conforme o manual do fabricante.</p>
        <div id="erros-form" class="erro-form"></div>
        <div class="acoes" style="margin-top:12px"><button class="btn">Salvar impressora</button><a class="btn fraco" href="#/equipamentos">Cancelar</a></div>
      </form>`;
  };

  // Detalhe do equipamento
  telas['equipamento'] = (params, id) => {
    const i = imp(id);
    if (!i) return '<div class="vazio">Impressora não encontrada.</div>';
    definirCabecalho(`${i.codigo} · ${i.marca} ${i.modelo}`, `${local(i.localId).predio}, ${local(i.localId).setor}`);
    const ult = E.ultimaLeitura(state, i.id);
    const s = situacao(i);
    const comps = state.componentes.filter(c => c.impressoraId === i.id).map(c => E.desgasteComponente(state, c, HOJE));
    const serie = serieSemanalTotal(i.id);
    const rot = rotulosSemanas(serie.length);
    const anomalias = alertasDe(i.id).filter(a => a.tipo === 'anomalia');
    const ordens = state.ordens.filter(o => o.impressoraId === i.id).sort((a, b) => (a.abertaEm < b.abertaEm ? 1 : -1));
    const taxa = E.taxaDiaria(state, i.id, HOJE);
    const sup = E.previsaoSuprimento(state, i.id, HOJE);
    return `
      <div class="card">
        <div class="info-grid">
          <div><span>Estado</span><b>${tag(s.nivel, s.texto)}</b></div>
          <div><span>Contador</span><b>${num(ult && ult.contador)} páginas</b></div>
          <div><span>Ritmo (30 dias)</span><b>${taxa ? num(Math.round(taxa)) + ' pág./dia' : '—'}</b></div>
          <div><span>${i.tipo === 'jato' ? 'Tinta' : 'Toner'}</span><b>${ult ? ult.toner + '%' : '—'}${sup && sup.diasRestantes != null ? ` <span class="muted small">(~${sup.diasRestantes} dias)</span>` : ''}</b></div>
          <div><span>Endereço IP</span><b>${esc(i.ip)}</b></div>
          <div><span>Coleta</span><b>${i.origem === 'snmp' ? 'Automática (SNMP)' : 'Manual'}</b></div>
          <div><span>Última leitura</span><b>${data(ult && ult.data)}</b></div>
          <div><span>Última preventiva</span><b>${data(i.ultimaPreventiva)}</b></div>
        </div>
        <div class="acoes" style="margin-top:14px">
          <a class="btn" href="#/ordens/nova?imp=${i.id}">Abrir ordem de serviço</a>
          <a class="btn sec" href="#/assistente?imp=${i.id}">Assistente de diagnóstico</a>
        </div>
      </div>
      <div class="grid dois-iguais" style="margin-top:16px">
        <div class="card">
          <h2>Saúde dos componentes</h2>
          <table><thead><tr><th>Componente</th><th>Uso do ciclo</th><th>Previsão</th></tr></thead><tbody>
          ${comps.map(d => `<tr><td>${esc(E.TIPOS_COMPONENTE[d.componente.tipo])}<div class="small muted">${num(d.uso)} / ${num(d.componente.vidaPaginas)} pág.</div></td><td style="min-width:150px">${barra(d.pct, d.nivel)}</td><td>${d.dataPrevista ? data(d.dataPrevista) : '—'}</td></tr>`).join('')}
          </tbody></table>
        </div>
        <div class="card">
          <h2>Erros registrados por semana <span class="muted">${anomalias.length ? 'comportamento anormal detectado' : 'sem anomalias'}</span></h2>
          ${barras(serie.map((v, k) => ({ rotulo: rot[k], valor: v, destaque: k === serie.length - 1 && anomalias.length > 0 })), { altura: 180 })}
        </div>
      </div>
      <div class="grid dois-iguais" style="margin-top:16px">
        <div class="card">
          <h2>Registrar leitura manual</h2>
          <form id="form-leitura" data-imp="${i.id}">
            <div class="campos">
              <label>Contador de páginas<input name="contador" type="number" min="0" required value="${ult ? ult.contador : ''}"></label>
              <label>${i.tipo === 'jato' ? 'Tinta' : 'Toner'} (%)<input name="toner" type="number" min="0" max="100" value="${ult ? ult.toner : ''}"></label>
            </div>
            <div class="erro-form" id="erros-leitura"></div>
            <div class="acoes" style="margin-top:10px"><button class="btn sec">Salvar leitura</button></div>
          </form>
          <h2 style="margin-top:18px">Registrar erro</h2>
          <form id="form-erro" data-imp="${i.id}">
            <div class="campos">
              <label>Tipo<select name="tipo">${Object.entries(E.TIPOS_ERRO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
              <label>Observação<input name="descricao" maxlength="120" placeholder="Opcional"></label>
            </div>
            <div class="acoes" style="margin-top:10px"><button class="btn sec">Registrar erro</button></div>
          </form>
        </div>
        <div class="card">
          <h2>Alertas e ordens de serviço</h2>
          ${alertasDe(i.id).map(cartaoAlerta).join('') || '<p class="muted">Nenhum alerta ativo.</p>'}
          <div class="secao-titulo">Histórico de manutenção</div>
          <table><thead><tr><th>OS</th><th>Tipo</th><th>Descrição</th><th>Status</th></tr></thead><tbody>
            ${ordens.map(o => `<tr><td><a class="link" href="#/ordem/${o.id}">${esc(o.id)}</a><div class="small muted">${data(o.abertaEm)}</div></td><td>${esc(o.tipo)}</td><td>${esc(o.descricao)}</td><td>${o.status === 'concluida' ? tag('ok', 'Concluída') : tag('atencao', 'Aberta')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sem registros.</td></tr>'}
          </tbody></table>
        </div>
      </div>`;
  };

  // Tela 3 — Saúde dos componentes
  telas['componentes'] = (params) => {
    definirCabecalho('Saúde dos componentes', 'Uso do ciclo de referência e previsão de substituição');
    const filtro = params.get('nivel') || '';
    const peso = { vencido: 0, critico: 1, atencao: 2, ok: 3 };
    const lista = state.componentes.map(c => E.desgasteComponente(state, c, HOJE))
      .filter(d => imp(d.componente.impressoraId).ativa !== false)
      .filter(d => !filtro || d.nivel === filtro)
      .sort((a, b) => peso[a.nivel] - peso[b.nivel] || b.pct - a.pct);
    const contagem = n => state.componentes.map(c => E.desgasteComponente(state, c, HOJE)).filter(d => d.nivel === n).length;
    return `
      <div class="grid tres">
        <div class="card kpi critico"><div class="rotulo">Críticos ou vencidos (≥ 90%)</div><div class="valor">${contagem('critico') + contagem('vencido')}</div><div class="det">agendar substituição</div></div>
        <div class="card kpi atencao"><div class="rotulo">Em atenção (80–89%)</div><div class="valor">${contagem('atencao')}</div><div class="det">programar inspeção</div></div>
        <div class="card kpi ok"><div class="rotulo">Normais (&lt; 80%)</div><div class="valor">${contagem('ok')}</div><div class="det">dentro do ciclo</div></div>
      </div>
      <form class="filtros" id="form-filtro" style="margin-top:16px">
        <select name="nivel"><option value="">Todos os níveis</option>${['critico', 'atencao', 'ok'].map(n => `<option value="${n}" ${n === filtro ? 'selected' : ''}>${ROTULO_NIVEL[n]}</option>`).join('')}</select>
        <button class="btn sec">Filtrar</button>
        <span class="muted small">Ciclos de referência configurados por modelo, conforme o manual do fabricante.</span>
      </form>
      <div class="card" style="padding:0">
        <table>
          <thead><tr><th>Impressora</th><th>Componente</th><th class="num">Uso registrado</th><th class="num">Referência</th><th style="width:200px">Uso do ciclo</th><th class="num">Ritmo</th><th>Limite previsto</th><th>Nível</th></tr></thead>
          <tbody>${lista.map(d => {
            const i = imp(d.componente.impressoraId);
            return `<tr><td><a class="link" href="#/equipamento/${i.id}">${esc(i.codigo)}</a><div class="small muted">${esc(i.marca)} ${esc(i.modelo)}</div></td>
              <td>${esc(E.TIPOS_COMPONENTE[d.componente.tipo])}</td><td class="num">${num(d.uso)}</td><td class="num">${num(d.componente.vidaPaginas)}</td>
              <td>${barra(d.pct, d.nivel)}</td><td class="num">${d.taxaDiaria != null ? num(d.taxaDiaria) + '/dia' : '—'}</td>
              <td>${d.dataPrevista ? data(d.dataPrevista) : '—'}</td><td>${tag(d.nivel)}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  };

  // Tela 4 — Alertas
  telas['alertas'] = () => {
    definirCabecalho('Alertas', 'Classificados por gravidade, com descrição e recomendação de verificação');
    const as = alertasAtivos();
    const grupo = (g, titulo) => {
      const l = as.filter(a => a.gravidade === g);
      return l.length ? `<div class="secao-titulo">${titulo} (${l.length})</div>${l.map(cartaoAlerta).join('')}` : '';
    };
    return `
      <div class="aviso">Os alertas são recalculados a cada leitura: desgaste de componentes, nível de suprimento, aumento anormal de erros (gráfico de controle estatístico), preventivas atrasadas e falhas de comunicação.</div>
      ${grupo('critico', 'Críticos')}${grupo('atencao', 'Atenção')}${grupo('info', 'Informativos')}
      ${as.length ? '' : '<div class="vazio">Nenhum alerta ativo. 🎉</div>'}`;
  };

  // Ordens de serviço
  telas['ordens'] = (params) => {
    definirCabecalho('Ordens de serviço', 'Manutenções abertas e concluídas');
    const aba = params.get('aba') || 'abertas';
    const lista = state.ordens.filter(o => (aba === 'abertas' ? o.status !== 'concluida' : o.status === 'concluida'))
      .sort((a, b) => (a.abertaEm < b.abertaEm ? 1 : -1));
    return `
      <div class="filtros">
        <a class="btn ${aba === 'abertas' ? '' : 'fraco'}" href="#/ordens?aba=abertas">Abertas (${state.ordens.filter(o => o.status !== 'concluida').length})</a>
        <a class="btn ${aba === 'concluidas' ? '' : 'fraco'}" href="#/ordens?aba=concluidas">Concluídas (${state.ordens.filter(o => o.status === 'concluida').length})</a>
        <span style="flex:1"></span>
        <a class="btn" href="#/ordens/nova">+ Nova ordem de serviço</a>
      </div>
      <div class="card" style="padding:0">
        <table>
          <thead><tr><th>OS</th><th>Impressora</th><th>Tipo</th><th>Descrição</th><th>Abertura</th><th>Conclusão</th><th>Defeito encontrado</th><th class="num">Custo</th></tr></thead>
          <tbody>${lista.map(o => {
            const i = imp(o.impressoraId);
            return `<tr><td><a class="link" href="#/ordem/${o.id}">${esc(o.id)}</a></td><td>${esc(i.codigo)}</td><td>${tag(o.tipo === 'preventiva' ? 'cyan' : 'neutro', o.tipo)}</td>
              <td>${esc(o.descricao)}</td><td>${data(o.abertaEm)}</td><td>${data(o.fechadaEm)}</td><td>${esc(o.defeitoEncontrado || '—')}</td><td class="num">${o.status === 'concluida' ? moeda(o.custo) : '—'}</td></tr>`;
          }).join('') || '<tr><td colspan="8" class="vazio">Nenhuma ordem nesta lista.</td></tr>'}</tbody>
        </table>
      </div>`;
  };

  telas['ordens/nova'] = (params) => {
    definirCabecalho('Nova ordem de serviço', 'Registro da manutenção recomendada');
    const alerta = params.get('alerta') ? alertas().find(a => a.id === params.get('alerta')) : null;
    const impId = alerta ? alerta.impressoraId : params.get('imp');
    const tipo = alerta && ['componente', 'preventiva', 'toner'].includes(alerta.tipo) ? 'preventiva' : 'corretiva';
    const desc = alerta ? `${alerta.titulo}. ${alerta.recomendacao}` : (params.get('desc') || '');
    return `
      <form class="card" id="form-os" style="max-width:860px" data-alerta="${esc(alerta ? alerta.id : '')}">
        ${alerta ? `<div class="aviso" style="margin-bottom:14px">Gerada a partir do alerta: <b>${esc(alerta.titulo)}</b> — ${esc(alerta.descricao)}</div>` : ''}
        <div class="campos">
          <label>Impressora<select name="impressoraId">${state.impressoras.map(i => `<option value="${i.id}" ${i.id === impId ? 'selected' : ''}>${esc(i.codigo)} — ${esc(i.marca)} ${esc(i.modelo)}</option>`).join('')}</select></label>
          <label>Tipo<select name="tipo"><option value="preventiva" ${tipo === 'preventiva' ? 'selected' : ''}>Preventiva</option><option value="corretiva" ${tipo === 'corretiva' ? 'selected' : ''}>Corretiva</option></select></label>
          <label class="span2">Descrição do serviço<textarea name="descricao" required maxlength="300">${esc(desc)}</textarea></label>
          <label>Responsável<input name="tecnico" value="Marcos (TI)" maxlength="60"></label>
        </div>
        <div class="acoes" style="margin-top:14px"><button class="btn">Abrir ordem de serviço</button><a class="btn fraco" href="#/ordens">Cancelar</a></div>
      </form>`;
  };

  telas['ordem'] = (params, id) => {
    const o = state.ordens.find(x => x.id === id);
    if (!o) return '<div class="vazio">Ordem não encontrada.</div>';
    const i = imp(o.impressoraId);
    definirCabecalho(`Ordem de serviço ${o.id}`, `${i.codigo} · ${i.marca} ${i.modelo}`);
    const comps = state.componentes.filter(c => c.impressoraId === i.id);
    const info = `<div class="info-grid">
        <div><span>Status</span><b>${o.status === 'concluida' ? tag('ok', 'Concluída') : tag('atencao', 'Aberta')}</b></div>
        <div><span>Tipo</span><b>${esc(o.tipo)}</b></div><div><span>Abertura</span><b>${data(o.abertaEm)}</b></div><div><span>Responsável</span><b>${esc(o.tecnico)}</b></div>
      </div><p><b>Descrição:</b> ${esc(o.descricao)}</p>`;
    if (o.status === 'concluida') {
      return `<div class="card" style="max-width:860px">${info}
        <p><b>Defeito encontrado / serviço realizado:</b> ${esc(o.defeitoEncontrado || '—')}</p>
        <p><b>Componente substituído:</b> ${esc(o.componenteSubstituidoNome || 'nenhum')}</p>
        <p><b>Custo:</b> ${moeda(o.custo)} · <b>Concluída em:</b> ${data(o.fechadaEm)}</p></div>`;
    }
    return `<form class="card" id="form-concluir" data-os="${o.id}" style="max-width:860px">${info}
      <div class="secao-titulo">Registro do serviço</div>
      <div class="campos">
        <label class="span2">Defeito encontrado / serviço realizado<textarea name="defeitoEncontrado" required maxlength="300"></textarea></label>
        <label>Componente substituído<select name="componenteSubstituidoId"><option value="">Nenhum</option>${comps.map(c => `<option value="${c.id}">${esc(E.TIPOS_COMPONENTE[c.tipo])}</option>`).join('')}</select></label>
        <label>Custo (R$)<input name="custo" type="number" min="0" step="0.01" value="0"></label>
      </div>
      <p class="small muted">Ao registrar a troca de um componente, a contagem do ciclo dele é reiniciada a partir do contador atual.</p>
      <div class="acoes" style="margin-top:12px"><button class="btn">Concluir ordem de serviço</button><a class="btn fraco" href="#/ordens">Voltar</a></div>
    </form>`;
  };

  // Assistente de diagnóstico
  telas['assistente'] = (params) => {
    definirCabecalho('Assistente de diagnóstico', 'Hipóteses e roteiro de verificação a partir dos dados do equipamento');
    const impId = params.get('imp') || '';
    const sintoma = params.get('sintoma') || '';
    const r = impId && sintoma ? E.diagnosticar(state, impId, sintoma, HOJE) : null;
    let resultado = '<div class="card vazio">Escolha a impressora e o sintoma para ver as hipóteses.</div>';
    if (r) {
      const rot = rotulosSemanas(r.serie.length);
      resultado = `
        <div class="grid dois-iguais">
          <div class="card">
            <h2>Hipóteses mais prováveis <span class="muted">${esc(r.impressora.codigo)}</span></h2>
            ${r.hipoteses.map((h, k) => `<div class="hipotese">
              <h3><span>${k + 1}. ${esc(h.causa)}</span><span class="tag ${k === 0 ? 'cyan' : 'neutro'}">relevância ${h.relevancia}%</span></h3>
              ${h.evidencias.map(e => `<div class="evid">● ${esc(e)}</div>`).join('')}
              <ol class="small">${h.verificar.map(v => `<li>${esc(v)}</li>`).join('')}</ol>
            </div>`).join('')}
          </div>
          <div class="grid" style="align-content:start">
            <div class="card">
              <h2>Ocorrências deste sintoma por semana</h2>
              ${barras(r.serie.map((v, k) => ({ rotulo: rot[k], valor: v, destaque: k === r.serie.length - 1 && r.anomalia.anomalo })), { altura: 170 })}
              <p class="small">${r.anomalia.anomalo
                ? `<b>Comportamento anormal:</b> ${r.anomalia.atual} ocorrências nos últimos 7 dias contra média de ${String(r.anomalia.media).replace('.', ',')} (limite estatístico ${String(r.anomalia.limite).replace('.', ',')}).`
                : 'Sem aumento estatisticamente anormal deste sintoma.'}</p>
            </div>
            <div class="aviso">${esc(r.aviso)}</div>
            <div class="acoes"><a class="btn" href="#/ordens/nova?imp=${impId}&desc=${encodeURIComponent('Investigar: ' + r.sintoma + '. Hipótese principal: ' + r.hipoteses[0].causa + '.')}">Abrir OS com a hipótese principal</a></div>
          </div>
        </div>`;
    }
    return `
      <form class="card filtros" id="form-assistente" style="margin-bottom:16px">
        <label>Impressora<select name="imp">${state.impressoras.map(i => `<option value="${i.id}" ${i.id === impId ? 'selected' : ''}>${esc(i.codigo)} — ${esc(i.marca)} ${esc(i.modelo)}</option>`).join('')}</select></label>
        <label>Sintoma observado<select name="sintoma">${Object.entries(E.SINTOMAS).map(([k, v]) => `<option value="${k}" ${k === sintoma ? 'selected' : ''}>${esc(v.rotulo)}</option>`).join('')}</select></label>
        <button class="btn" style="align-self:flex-end">Analisar</button>
      </form>
      ${resultado}`;
  };

  // Tela 5 — Histórico e relatórios
  telas['relatorios'] = () => {
    definirCabecalho('Histórico e relatórios', 'Últimos 90 dias');
    const inicio = E.addDays(HOJE, -90);
    const erros = state.erros.filter(e => e.data >= inicio);
    const CURTO = { alimentacao: 'Alimentação', atolamento: 'Atolamento', fusor: 'Fusor', qualidade: 'Qualidade', comunicacao: 'Comunicação', suprimento: 'Suprimento' };
    const porTipo = Object.keys(E.TIPOS_ERRO).map(t => ({ rotulo: CURTO[t] || t, valor: erros.filter(e => e.tipo === t).length }));
    const porImp = {};
    for (const e of erros) porImp[e.impressoraId] = (porImp[e.impressoraId] || 0) + 1;
    const top = Object.entries(porImp).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const concl = state.ordens.filter(o => o.status === 'concluida' && o.fechadaEm >= inicio);
    const custo = concl.reduce((s, o) => s + (o.custo || 0), 0);
    const prev = concl.filter(o => o.tipo === 'preventiva').length;
    const custoPredio = {};
    for (const o of concl) { const p = local(imp(o.impressoraId).localId).predio; custoPredio[p] = (custoPredio[p] || 0) + (o.custo || 0); }
    const disp = state.impressoras.map(i => ({ i, d: E.disponibilidade(state, i.id, HOJE, 90) })).sort((a, b) => a.d - b.d).slice(0, 6);
    return `
      <div class="grid kpis">
        <div class="card kpi"><div class="rotulo">Falhas registradas</div><div class="valor">${erros.length}</div><div class="det">90 dias</div></div>
        <div class="card kpi"><div class="rotulo">Manutenções realizadas</div><div class="valor">${concl.length}</div><div class="det">${prev} preventivas · ${concl.length - prev} corretivas</div></div>
        <div class="card kpi"><div class="rotulo">Componentes substituídos</div><div class="valor">${concl.filter(o => o.componenteSubstituidoNome).length}</div><div class="det">registrados em OS</div></div>
        <div class="card kpi"><div class="rotulo">Custos registrados</div><div class="valor" style="font-size:24px">${moeda(custo)}</div><div class="det">peças e serviços</div></div>
        <div class="card kpi"><div class="rotulo">Preventivas / total</div><div class="valor">${concl.length ? Math.round((prev / concl.length) * 100) : 0}%</div><div class="det">meta: aumentar</div></div>
        <div class="card kpi"><div class="rotulo">OS abertas</div><div class="valor">${state.ordens.filter(o => o.status !== 'concluida').length}</div><div class="det">em andamento</div></div>
      </div>
      <div class="grid dois-iguais" style="margin-top:16px">
        <div class="card"><h2>Falhas por tipo</h2>${barras(porTipo)}</div>
        <div class="card"><h2>Impressoras com mais falhas</h2>${barras(top.map(([id, v], k) => ({ rotulo: imp(id).codigo, valor: v, destaque: k === 0 })))}</div>
      </div>
      <div class="grid dois-iguais" style="margin-top:16px">
        <div class="card"><h2>Menor disponibilidade (90 dias)</h2>
          <table><thead><tr><th>Impressora</th><th>Disponibilidade</th></tr></thead><tbody>
          ${disp.map(x => `<tr><td>${esc(x.i.codigo)} <span class="muted small">${esc(local(x.i.localId).setor)}</span></td><td>${barra(x.d, x.d < 98 ? 'atencao' : 'ok')}</td></tr>`).join('')}
          </tbody></table></div>
        <div class="card"><h2>Custos por prédio <span class="acoes"><button class="btn fraco" data-csv="ordens">Exportar OS (CSV)</button><button class="btn fraco" data-csv="leituras">Exportar leituras (CSV)</button></span></h2>
          <table><thead><tr><th>Prédio</th><th class="num">Custo</th></tr></thead><tbody>
          ${Object.entries(custoPredio).sort().map(([p, v]) => `<tr><td>${esc(p)}</td><td class="num">${moeda(v)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">Sem custos no período.</td></tr>'}
          </tbody></table></div>
      </div>`;
  };

  telas['sobre'] = () => {
    definirCabecalho('Sobre o PrintCare', 'MVP desenvolvido para a A3 — Unisul');
    return `
      <div class="grid dois-iguais">
        <div class="card">
          <h2>Bem-vindo ao PrintCare</h2>
          <p>Este protótipo foi desenvolvido por alunos da Unisul como parte do Trabalho A3 (Projeto Integrador — Desafio de Inovação, Sustentabilidade e Competitividade Empresarial, Equipe 1).</p>
          <p>O PrintCare transforma a manutenção de impressoras de reativa em preventiva:</p>
          <ol>
            <li>Cadastra impressoras e acompanha contadores e suprimentos (SNMP ou registro manual).</li>
            <li>Calcula o uso do ciclo de cada componente e prevê a data de substituição.</li>
            <li>Detecta aumento anormal de erros com um gráfico de controle estatístico.</li>
            <li>Gera alertas com recomendação e permite abrir ordens de serviço.</li>
            <li>Registra o serviço realizado e reinicia o ciclo do componente trocado.</li>
            <li>Oferece um assistente que sugere hipóteses e roteiros de verificação.</li>
          </ol>
          <p class="small muted">Os dados exibidos são fictícios (Universidade Horizonte — Caso 1, EcoCampus). Ciclos de vida de componentes são valores de referência ilustrativos.</p>
        </div>
        <div class="card">
          <h2>Dados do protótipo</h2>
          <p>Os dados ficam salvos neste navegador. Você pode restaurar a demonstração a qualquer momento ou importar leituras geradas pelo coletor SNMP (<code>snmp_poc/coletor_snmp.py</code>).</p>
          <div class="acoes">
            <button class="btn perigo" id="btn-restaurar">Restaurar dados de demonstração</button>
            <label class="btn sec" style="flex-direction:row">Importar leituras (JSON)<input type="file" id="arquivo-leituras" accept=".json,application/json" hidden></label>
          </div>
          <div class="secao-titulo">Tecnologias</div>
          <p>HTML, CSS e JavaScript (sem bibliotecas externas) · armazenamento local no navegador · testes automatizados com Node.js (node:test) · coletor SNMP em Python · modelo de banco PostgreSQL para a versão completa.</p>
        </div>
      </div>`;
  };

  // ---------- Roteamento ----------
  function render() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [caminho, query] = hash.split('?');
    const params = new URLSearchParams(query || '');
    const partes = caminho.split('/').filter(Boolean);
    let chave = partes.join('/');
    let id = null;
    if (!telas[chave] && partes.length === 2) { chave = partes[0]; id = partes[1]; }
    const tela = telas[chave] || telas[''];
    $('#conteudo').innerHTML = tela(params, id);
    atualizarMenu(telas[chave] ? chave : '');
    window.scrollTo(0, 0);
  }

  // ---------- Eventos ----------
  document.addEventListener('submit', ev => {
    const f = ev.target;
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());

    if (f.id === 'form-filtro') {
      const base = location.hash.split('?')[0];
      const q = new URLSearchParams(Object.entries(d).filter(([, v]) => v));
      location.hash = `${base}${q.toString() ? '?' + q : ''}`;
      return;
    }
    if (f.id === 'form-assistente') { location.hash = `#/assistente?imp=${d.imp}&sintoma=${d.sintoma}`; return; }

    if (f.id === 'form-impressora') {
      const erros = [];
      const codigo = d.codigo.trim().toUpperCase();
      if (!codigo) erros.push('Informe o código.');
      if (state.impressoras.some(i => i.codigo === codigo)) erros.push('Já existe uma impressora com esse código.');
      const contador = Number(d.contador);
      if (!Number.isFinite(contador) || contador < 0) erros.push('Contador inválido.');
      const toner = Number(d.toner);
      if (!Number.isFinite(toner) || toner < 0 || toner > 100) erros.push('Toner/tinta deve estar entre 0 e 100.');
      if (erros.length) { $('#erros-form').textContent = erros.join(' '); return; }
      const m = SEED.MODELOS[d.modelo];
      const id = 'P' + Date.now().toString(36);
      state.impressoras.push({ id, codigo, marca: m.marca, modelo: d.modelo.replace(m.marca + ' ', ''), tipo: m.tipo, localId: d.localId,
        ip: d.ip || '—', origem: d.origem, ativa: true, instaladaEm: HOJE, intervaloPreventivaDias: Number(d.intervalo) || 180, ultimaPreventiva: HOJE });
      Object.entries(m.comps).forEach(([tipo, vida], k) => state.componentes.push({ id: `${id}-C${k}`, impressoraId: id, tipo, nome: E.TIPOS_COMPONENTE[tipo], vidaPaginas: vida, contadorNaInstalacao: contador, instaladoEm: HOJE }));
      state.leituras.push({ impressoraId: id, data: HOJE, contador, toner, status: 'operacional', origem: d.origem });
      salvar(); toast('Impressora cadastrada.'); location.hash = `#/equipamento/${id}`;
      return;
    }

    if (f.id === 'form-leitura') {
      const impId = f.dataset.imp;
      const leitura = { contador: Number(d.contador), toner: d.toner === '' ? null : Number(d.toner) };
      const erros = E.validarLeitura(state, impId, leitura);
      if (erros.length) { $('#erros-leitura').textContent = erros.join(' '); return; }
      state.leituras = state.leituras.filter(l => !(l.impressoraId === impId && l.data === HOJE));
      state.leituras.push({ impressoraId: impId, data: HOJE, contador: leitura.contador, toner: leitura.toner, status: 'operacional', origem: 'manual' });
      salvar(); toast('Leitura registrada. Alertas recalculados.'); render();
      return;
    }

    if (f.id === 'form-erro') {
      state.erros.push({ id: 'E' + Date.now().toString(36), impressoraId: f.dataset.imp, data: HOJE, tipo: d.tipo, descricao: d.descricao || E.TIPOS_ERRO[d.tipo] });
      salvar(); toast('Erro registrado.'); render();
      return;
    }

    if (f.id === 'form-os') {
      const seq = state.ordens.reduce((m, o) => Math.max(m, Number(o.id.split('-')[1]) || 0), 0) + 1;
      const os = { id: `OS-${String(seq).padStart(4, '0')}`, impressoraId: d.impressoraId, tipo: d.tipo, status: 'aberta', abertaEm: HOJE, fechadaEm: null,
        descricao: d.descricao.trim(), tecnico: d.tecnico.trim(), alertaId: f.dataset.alerta || null, defeitoEncontrado: '', custo: 0 };
      state.ordens.push(os);
      salvar(); toast(`Ordem ${os.id} aberta.`); location.hash = `#/ordem/${os.id}`;
      return;
    }

    if (f.id === 'form-concluir') {
      E.concluirOrdem(state, f.dataset.os, { defeitoEncontrado: d.defeitoEncontrado.trim(), custo: d.custo, componenteSubstituidoId: d.componenteSubstituidoId || null }, HOJE);
      salvar(); toast('Ordem concluída e histórico atualizado.'); render();
    }
  });

  document.addEventListener('click', ev => {
    const t = ev.target.closest('button, [data-reconhecer], [data-csv]');
    if (!t) return;
    if (t.dataset.reconhecer) {
      state.alertasReconhecidos[t.dataset.reconhecer] = HOJE; salvar(); toast('Alerta dispensado.'); render();
    } else if (t.dataset.csv) {
      exportarCSV(t.dataset.csv);
    } else if (t.id === 'btn-restaurar') {
      if (confirm('Restaurar os dados de demonstração? As alterações feitas neste navegador serão perdidas.')) {
        state = SEED.gerarDemo(HOJE); salvar(); toast('Demonstração restaurada.'); location.hash = '#/';
        render();
      }
    } else if (t.id === 'btn-coletar') {
      coletarSimulado();
    }
  });

  document.addEventListener('change', ev => {
    if (ev.target.id !== 'arquivo-leituras' || !ev.target.files[0]) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const lista = JSON.parse(leitor.result);
        let ok = 0, ignoradas = 0;
        for (const l of Array.isArray(lista) ? lista : []) {
          const i = state.impressoras.find(p => p.ip === l.ip);
          const leitura = { contador: Number(l.contador), toner: l.toner == null ? null : Number(l.toner) };
          if (!i || E.validarLeitura(state, i.id, leitura).length) { ignoradas++; continue; }
          const dia = /^\d{4}-\d{2}-\d{2}$/.test(l.data || '') ? l.data : HOJE;
          state.leituras = state.leituras.filter(x => !(x.impressoraId === i.id && x.data === dia));
          state.leituras.push({ impressoraId: i.id, data: dia, ...leitura, status: l.status || 'operacional', origem: 'snmp' });
          ok++;
        }
        salvar(); toast(`${ok} leitura(s) importada(s), ${ignoradas} ignorada(s).`); render();
      } catch (e) { toast('Arquivo inválido.'); }
    };
    leitor.readAsText(ev.target.files[0]);
  });

  /** Simulação da coleta SNMP: registra a leitura de hoje das impressoras de rede. */
  function coletarSimulado() {
    let n = 0;
    for (const i of state.impressoras.filter(p => p.origem === 'snmp' && p.ativa !== false)) {
      if (i.cenario === 'semComunicacao') continue; // continua sem responder
      const ult = E.ultimaLeitura(state, i.id);
      if (!ult || ult.data === HOJE) continue;
      const taxa = E.taxaDiaria(state, i.id, HOJE) || 50;
      const dias = Math.max(1, E.diffDays(HOJE, ult.data));
      const paginas = Math.round(taxa * dias * (0.9 + Math.random() * 0.2));
      const sup = E.previsaoSuprimento(state, i.id, HOJE);
      const toner = Math.max(0, Math.round((ult.toner ?? 100) - (sup ? sup.consumoDia * dias : 0)));
      state.leituras.push({ impressoraId: i.id, data: HOJE, contador: ult.contador + paginas, toner, status: 'operacional', origem: 'snmp' });
      n++;
    }
    salvar();
    toast(n ? `Coleta simulada: ${n} impressora(s) atualizada(s).` : 'As leituras de hoje já foram coletadas.');
    render();
  }

  function exportarCSV(tipo) {
    let linhas;
    if (tipo === 'ordens') {
      linhas = [['os', 'impressora', 'tipo', 'status', 'abertura', 'conclusao', 'descricao', 'defeito_encontrado', 'custo']]
        .concat(state.ordens.map(o => [o.id, imp(o.impressoraId).codigo, o.tipo, o.status, o.abertaEm, o.fechadaEm || '', o.descricao, o.defeitoEncontrado || '', o.custo || 0]));
    } else {
      linhas = [['impressora', 'data', 'contador', 'toner', 'status', 'origem']]
        .concat(state.leituras.map(l => [imp(l.impressoraId).codigo, l.data, l.contador, l.toner ?? '', l.status, l.origem]));
    }
    const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `printcare-${tipo}-${HOJE}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.addEventListener('hashchange', render);
  render();
})();
