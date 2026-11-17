/*
 * PrintCare — dados de demonstração (fictícios)
 * -------------------------------------------------------------
 * Organização-piloto: Universidade Horizonte (Caso 1 — EcoCampus).
 * Gera 90 dias de histórico de forma determinística (mesma semente
 * = mesmos dados), com cenários que exercitam cada tipo de alerta.
 * Os ciclos de vida dos componentes são REFERÊNCIAS ILUSTRATIVAS:
 * na implantação real são cadastrados conforme o manual de cada modelo.
 */
(function (global) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : global.PrintCareEngine;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Catálogo de modelos com componentes e ciclos de referência (ilustrativos)
  const MODELOS = {
    'HP LaserJet Enterprise M507dn': { marca: 'HP', tipo: 'laser', rendimento: 11000, comps: { fusor: 150000, rolos: 150000, transferencia: 150000 } },
    'HP LaserJet Pro M404dn': { marca: 'HP', tipo: 'laser', rendimento: 3000, comps: { fusor: 100000, rolos: 100000 } },
    'Brother HL-L6402DW': { marca: 'Brother', tipo: 'laser', rendimento: 20000, comps: { cilindro: 100000, fusor: 200000, rolos: 100000 } },
    'Kyocera ECOSYS P3145dn': { marca: 'Kyocera', tipo: 'laser', rendimento: 14500, comps: { cilindro: 300000, fusor: 300000, rolos: 300000 } },
    'Lexmark MS621dn': { marca: 'Lexmark', tipo: 'laser', rendimento: 6000, comps: { cilindro: 60000, fusor: 200000, rolos: 200000 } },
    'Epson EcoTank L6270': { marca: 'Epson', tipo: 'jato', rendimento: 7500, comps: { caixa_manutencao: 50000, rolos: 50000 } }
  };

  const LOCAIS = [
    { id: 'L1', predio: 'Bloco A', setor: 'Reitoria' },
    { id: 'L2', predio: 'Bloco A', setor: 'Financeiro' },
    { id: 'L3', predio: 'Bloco A', setor: 'Recursos Humanos' },
    { id: 'L4', predio: 'Bloco A', setor: 'Compras' },
    { id: 'L5', predio: 'Bloco A', setor: 'Protocolo' },
    { id: 'L6', predio: 'Bloco B', setor: 'Biblioteca — Atendimento' },
    { id: 'L7', predio: 'Bloco B', setor: 'Biblioteca — Impressão de alunos' },
    { id: 'L8', predio: 'Bloco B', setor: 'Biblioteca — Periódicos' },
    { id: 'L9', predio: 'Bloco C', setor: 'Laboratório de Informática 1' },
    { id: 'L10', predio: 'Bloco C', setor: 'Laboratório de Informática 2' },
    { id: 'L11', predio: 'Bloco C', setor: 'Coordenação de TI' },
    { id: 'L12', predio: 'Bloco D', setor: 'Coordenação de Direito' },
    { id: 'L13', predio: 'Bloco D', setor: 'Secretaria Acadêmica' },
    { id: 'L14', predio: 'Bloco D', setor: 'Sala dos Professores' },
    { id: 'L15', predio: 'Bloco D', setor: 'Coordenação de Pedagogia' },
    { id: 'L16', predio: 'Bloco E', setor: 'Clínica-escola — Recepção' },
    { id: 'L17', predio: 'Bloco E', setor: 'Clínica-escola — Prontuários' },
    { id: 'L18', predio: 'Bloco E', setor: 'Núcleo de Prática Jurídica' }
  ];

  // codigo, modelo, local, ip, origem, páginas/dia útil, contador inicial, cenário
  const FROTA = [
    ['ADM-01', 'HP LaserJet Enterprise M507dn', 'L1', '10.10.1.21', 'snmp', 260, 152000],
    ['ADM-02', 'HP LaserJet Pro M404dn', 'L2', '10.10.1.22', 'snmp', 180, 98000],
    ['ADM-03', 'Brother HL-L6402DW', 'L3', '10.10.1.23', 'snmp', 150, 181000, 'cilindro87'],
    ['ADM-04', 'Lexmark MS621dn', 'L4', '10.10.1.24', 'snmp', 90, 47000, 'osAberta'],
    ['ADM-05', 'Lexmark MS621dn', 'L5', '—', 'manual', 60, 33000],
    ['BIB-01', 'HP LaserJet Pro M404dn', 'L6', '10.10.2.11', 'snmp', 120, 61000],
    ['BIB-02', 'Kyocera ECOSYS P3145dn', 'L7', '10.10.2.12', 'snmp', 420, 286000, 'anomaliaAlimentacao'],
    ['BIB-03', 'Epson EcoTank L6270', 'L8', '—', 'manual', 40, 12500],
    ['LAB-01', 'Kyocera ECOSYS P3145dn', 'L9', '10.10.3.11', 'snmp', 300, 512000, 'fusor96'],
    ['LAB-02', 'HP LaserJet Pro M404dn', 'L10', '10.10.3.12', 'snmp', 140, 72000],
    ['LAB-03', 'Brother HL-L6402DW', 'L11', '10.10.3.13', 'snmp', 70, 39000, 'semComunicacao'],
    ['SAL-01', 'Lexmark MS621dn', 'L12', '10.10.4.11', 'snmp', 160, 88000, 'toner8'],
    ['SAL-02', 'HP LaserJet Enterprise M507dn', 'L13', '10.10.4.12', 'snmp', 350, 233000],
    ['SAL-03', 'Brother HL-L6402DW', 'L14', '10.10.4.13', 'snmp', 200, 121000, 'preventivaAtrasada'],
    ['SAL-04', 'Epson EcoTank L6270', 'L15', '—', 'manual', 35, 9800, 'leituraAntiga'],
    ['CLI-01', 'HP LaserJet Pro M404dn', 'L16', '10.10.5.11', 'snmp', 110, 54000],
    ['CLI-02', 'Brother HL-L6402DW', 'L17', '10.10.5.12', 'snmp', 190, 143000, 'toner18'],
    ['CLI-03', 'Kyocera ECOSYS P3145dn', 'L18', '10.10.5.13', 'snmp', 130, 97000]
  ];

  const DIAS = 90;

  function gerarDemo(hoje, semente = 2026) {
    hoje = hoje || E.hojeISO();
    const rnd = mulberry32(semente);
    const r = (a, b) => a + rnd() * (b - a);
    const ri = (a, b) => Math.floor(r(a, b + 1));
    const diaSemana = iso => E.parseISO(iso).getUTCDay(); // 0 dom, 6 sáb

    const state = {
      versao: 1,
      demo: true,
      dataReferencia: hoje,
      organizacao: { nome: 'Universidade Horizonte', plano: 'Profissional (piloto)', cidade: 'Florianópolis/SC' },
      locais: LOCAIS.map(l => ({ ...l })),
      impressoras: [], componentes: [], leituras: [], erros: [], ordens: [],
      alertasReconhecidos: {}
    };

    let seqErro = 1;
    let seqComp = 1;

    FROTA.forEach(([codigo, modelo, localId, ip, origem, ppd, contadorInicial, cenario], idx) => {
      const m = MODELOS[modelo];
      const id = `P${String(idx + 1).padStart(2, '0')}`;
      const imp = {
        id, codigo, marca: m.marca, modelo: modelo.replace(m.marca + ' ', ''), tipo: m.tipo,
        localId, ip, origem, ativa: true,
        instaladaEm: E.addDays(hoje, -ri(500, 1400)),
        intervaloPreventivaDias: 180,
        ultimaPreventiva: E.addDays(hoje, -ri(20, 150)),
        cenario: cenario || null
      };
      if (cenario === 'preventivaAtrasada') imp.ultimaPreventiva = E.addDays(hoje, -214);
      state.impressoras.push(imp);

      // ---- páginas por dia (dias úteis cheios, fim de semana ~10%) ----
      const paginasDia = [];
      for (let d = DIAS; d >= 0; d--) {
        const data = E.addDays(hoje, -d);
        const ds = diaSemana(data);
        const fator = ds === 0 || ds === 6 ? 0.1 : r(0.8, 1.2);
        paginasDia.push({ data, paginas: Math.round(ppd * fator) });
      }
      const totalPeriodo = paginasDia.reduce((s, p) => s + p.paginas, 0);

      // ---- suprimento: calculado de trás para frente a partir do nível final ----
      let tonerFinal = ri(35, 90);
      if (cenario === 'toner8') tonerFinal = 8;
      if (cenario === 'toner18') tonerFinal = 18;
      const tonerEm = paginasDepois => {
        let t = tonerFinal + (paginasDepois / m.rendimento) * 100;
        while (t > 100) t -= 100; // cartucho anterior (troca)
        return Math.max(0, Math.round(t));
      };

      // ---- leituras ----
      let contador = contadorInicial;
      let paginasRestantes = totalPeriodo;
      const ultimoDiaSnmp = cenario === 'semComunicacao' ? 4 : 0; // sem leitura nos últimos 4 dias
      const ultimoDiaManual = cenario === 'leituraAntiga' ? 20 : ri(1, 6);
      paginasDia.forEach((p, i) => {
        const diasAtras = DIAS - i;
        contador += p.paginas;
        paginasRestantes -= p.paginas;
        let registrar;
        if (origem === 'snmp') registrar = diasAtras >= ultimoDiaSnmp;
        else registrar = diasAtras >= ultimoDiaManual && (diasAtras - ultimoDiaManual) % 7 === 0;
        if (!registrar) return;
        let status = 'operacional';
        if (cenario === 'anomaliaAlimentacao' && diasAtras === 3) status = 'parada';
        if (cenario === 'fusor96' && diasAtras === 12) status = 'parada';
        state.leituras.push({ impressoraId: id, data: p.data, contador, toner: tonerEm(paginasRestantes), status, origem });
      });
      const contadorFinal = contador;

      // ---- componentes ----
      for (const [tipo, vida] of Object.entries(m.comps)) {
        let pct = r(0.08, 0.68);
        if (cenario === 'cilindro87' && tipo === 'cilindro') pct = 0.87;
        if (cenario === 'fusor96' && tipo === 'fusor') pct = 0.96;
        // rolos da BIB-02 perto do fim do ciclo: reforça a hipótese do assistente
        if (cenario === 'anomaliaAlimentacao' && tipo === 'rolos') pct = 0.82;
        // ADM-04: caixa/cilindro já com OS aberta
        if (cenario === 'osAberta' && tipo === 'cilindro') pct = 0.83;
        const usado = Math.round(vida * pct);
        state.componentes.push({
          id: `C${String(seqComp++).padStart(3, '0')}`, impressoraId: id, tipo,
          nome: E.TIPOS_COMPONENTE[tipo], vidaPaginas: vida,
          contadorNaInstalacao: contadorFinal - usado,
          instaladoEm: E.addDays(hoje, -Math.min(1200, Math.round(usado / Math.max(ppd * 0.75, 1))))
        });
      }

      // ---- erros: base aleatória baixa + cenários ----
      const tiposBase = ['alimentacao', 'atolamento', 'qualidade', 'comunicacao'];
      for (let semana = 0; semana < 13; semana++) {
        const qtd = [0, 0, 0, 1, 1, 2][ri(0, 5)];
        for (let k = 0; k < qtd; k++) {
          const diasAtras = semana * 7 + ri(0, 6);
          let tipo = tiposBase[ri(0, tiposBase.length - 1)];
          if (cenario === 'anomaliaAlimentacao' && semana === 0) continue; // a última semana é controlada abaixo
          state.erros.push({ id: `E${seqErro++}`, impressoraId: id, data: E.addDays(hoje, -diasAtras), tipo, descricao: E.TIPOS_ERRO[tipo] });
        }
      }
      if (cenario === 'anomaliaAlimentacao') {
        // Semanas anteriores: 1–2 falhas de alimentação; últimos 7 dias: 12
        const anteriores = [1, 2, 1, 1, 2, 1, 2];
        anteriores.forEach((q, i) => {
          for (let k = 0; k < q; k++) {
            const diasAtras = (i + 1) * 7 + ri(0, 6);
            state.erros.push({ id: `E${seqErro++}`, impressoraId: id, data: E.addDays(hoje, -diasAtras), tipo: 'alimentacao', descricao: E.TIPOS_ERRO.alimentacao });
          }
        });
        const ultimos = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
        ultimos.forEach(diasAtras => {
          state.erros.push({ id: `E${seqErro++}`, impressoraId: id, data: E.addDays(hoje, -diasAtras), tipo: 'alimentacao', descricao: 'Falha de alimentação na bandeja 2' });
        });
      }
      if (cenario === 'fusor96') {
        [3, 9, 12, 26].forEach(diasAtras => state.erros.push({ id: `E${seqErro++}`, impressoraId: id, data: E.addDays(hoje, -diasAtras), tipo: 'fusor', descricao: E.TIPOS_ERRO.fusor }));
      }
    });

    // Remove falhas de alimentação aleatórias da BIB-02 que não sejam do cenário (mantém o exemplo limpo)
    // (já tratado acima ao pular a semana 0)

    // ---- histórico de ordens de serviço ----
    const imp = cod => state.impressoras.find(i => i.codigo === cod);
    const comp = (cod, tipo) => state.componentes.find(c => c.impressoraId === imp(cod).id && c.tipo === tipo);
    let seqOS = 1;
    const os = (o) => state.ordens.push({ id: `OS-${String(seqOS++).padStart(4, '0')}`, alertaId: null, tecnico: 'Equipe de TI', defeitoEncontrado: '', custo: 0, componenteSubstituidoId: null, ...o });

    os({ impressoraId: imp('SAL-02').id, tipo: 'corretiva', status: 'concluida', abertaEm: E.addDays(hoje, -82), fechadaEm: E.addDays(hoje, -80),
      descricao: 'Atolamento recorrente na saída', defeitoEncontrado: 'Rolo de saída com resíduo de etiqueta', custo: 0, tecnico: 'Marcos (TI)' });
    os({ impressoraId: imp('LAB-02').id, tipo: 'corretiva', status: 'concluida', abertaEm: E.addDays(hoje, -71), fechadaEm: E.addDays(hoje, -66),
      descricao: 'Impressão com manchas repetidas', defeitoEncontrado: 'Cartucho com defeito (substituído em garantia)', custo: 0, tecnico: 'Assistência autorizada' });
    os({ impressoraId: imp('CLI-01').id, tipo: 'preventiva', status: 'concluida', abertaEm: E.addDays(hoje, -60), fechadaEm: E.addDays(hoje, -60),
      descricao: 'Preventiva semestral', defeitoEncontrado: 'Limpeza interna e inspeção de rolos', custo: 120, tecnico: 'Marcos (TI)' });
    os({ impressoraId: imp('ADM-01').id, tipo: 'corretiva', status: 'concluida', abertaEm: E.addDays(hoje, -55), fechadaEm: E.addDays(hoje, -51),
      descricao: 'Erro de fusor intermitente', defeitoEncontrado: 'Unidade fusora substituída', custo: 890, tecnico: 'Assistência autorizada',
      componenteSubstituidoNome: 'Unidade fusora' });
    os({ impressoraId: imp('BIB-01').id, tipo: 'preventiva', status: 'concluida', abertaEm: E.addDays(hoje, -44), fechadaEm: E.addDays(hoje, -44),
      descricao: 'Preventiva semestral', defeitoEncontrado: 'Limpeza e troca de rolos de alimentação', custo: 210, tecnico: 'Marcos (TI)',
      componenteSubstituidoNome: 'Rolos de alimentação' });
    os({ impressoraId: imp('SAL-01').id, tipo: 'corretiva', status: 'concluida', abertaEm: E.addDays(hoje, -37), fechadaEm: E.addDays(hoje, -35),
      descricao: 'Impressora parada — erro 31.xx', defeitoEncontrado: 'Cartucho incompatível; substituído por original', custo: 0, tecnico: 'Marcos (TI)' });
    os({ impressoraId: imp('CLI-03').id, tipo: 'preventiva', status: 'concluida', abertaEm: E.addDays(hoje, -28), fechadaEm: E.addDays(hoje, -27),
      descricao: 'Preventiva semestral', defeitoEncontrado: 'Limpeza interna', custo: 120, tecnico: 'Marcos (TI)' });
    os({ impressoraId: imp('LAB-01').id, tipo: 'corretiva', status: 'concluida', abertaEm: E.addDays(hoje, -12), fechadaEm: E.addDays(hoje, -11),
      descricao: 'Erro de fusor — impressora parada', defeitoEncontrado: 'Reinicialização; fusor perto do fim do ciclo', custo: 0, tecnico: 'Marcos (TI)' });
    os({ impressoraId: imp('ADM-04').id, tipo: 'preventiva', status: 'aberta', abertaEm: E.addDays(hoje, -2), fechadaEm: null,
      descricao: 'Programar inspeção do cilindro (83% do ciclo)', alertaId: `componente:${comp('ADM-04', 'cilindro').id}`, tecnico: 'Marcos (TI)' });

    return state;
  }

  const API = { gerarDemo, MODELOS, LOCAIS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.PrintCareSeed = API;
})(typeof window !== 'undefined' ? window : globalThis);
