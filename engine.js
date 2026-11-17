/*
 * PrintCare — motor de análise (MVP A3)
 * -------------------------------------------------------------
 * Funções puras: recebem o estado (dados) e a data de referência
 * e devolvem indicadores, alertas e hipóteses de diagnóstico.
 * Funciona no navegador (window.PrintCareEngine) e no Node
 * (module.exports), o que permite testar a lógica com node:test.
 */
(function (global) {
  'use strict';

  // ---------- Datas ----------
  const DIA_MS = 24 * 60 * 60 * 1000;

  function parseISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function toISO(date) {
    return date.toISOString().slice(0, 10);
  }
  function addDays(iso, n) {
    return toISO(new Date(parseISO(iso).getTime() + n * DIA_MS));
  }
  function diffDays(a, b) {
    // dias de b até a (a - b)
    return Math.round((parseISO(a) - parseISO(b)) / DIA_MS);
  }
  function hojeISO() {
    const d = new Date();
    return toISO(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
  }

  // ---------- Parâmetros (configuráveis) ----------
  const PARAMETROS = {
    componente: { atencao: 80, critico: 90, vencido: 100 },  // % do ciclo de referência
    toner: { atencao: 20, critico: 10 },                       // % restante
    anomalia: { semanas: 8, minimoEventos: 4, sigmas: 3 },     // gráfico de controle c
    semComunicacaoDias: 2,      // impressora SNMP sem leitura há mais de N dias
    leituraManualDias: 15,      // impressora manual sem leitura há mais de N dias
    janelaTaxaDias: 30          // janela para média diária de páginas
  };

  const TIPOS_ERRO = {
    alimentacao: 'Falha de alimentação de papel',
    atolamento: 'Atolamento de papel',
    fusor: 'Erro de unidade fusora',
    qualidade: 'Defeito de qualidade de impressão',
    comunicacao: 'Falha de comunicação',
    suprimento: 'Erro de suprimento (toner/tinta)'
  };

  const TIPOS_COMPONENTE = {
    cilindro: 'Cilindro fotocondutor',
    fusor: 'Unidade fusora',
    rolos: 'Rolos de alimentação',
    transferencia: 'Unidade de transferência',
    caixa_manutencao: 'Caixa de manutenção (tinta residual)'
  };

  // ---------- Consultas básicas ----------
  function leiturasDe(state, impressoraId) {
    return state.leituras
      .filter(l => l.impressoraId === impressoraId)
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  }

  function ultimaLeitura(state, impressoraId) {
    const ls = leiturasDe(state, impressoraId);
    return ls.length ? ls[ls.length - 1] : null;
  }

  /** Média diária de páginas na janela (usa a primeira e a última leitura da janela). */
  function taxaDiaria(state, impressoraId, hoje, janela = PARAMETROS.janelaTaxaDias) {
    const inicio = addDays(hoje, -janela);
    const ls = leiturasDe(state, impressoraId).filter(l => l.data >= inicio && l.data <= hoje);
    if (ls.length < 2) return null;
    const primeira = ls[0];
    const ultima = ls[ls.length - 1];
    const dias = diffDays(ultima.data, primeira.data);
    if (dias <= 0) return null;
    return Math.max(0, (ultima.contador - primeira.contador) / dias);
  }

  // ---------- B. Desgaste de componentes ----------
  function nivelPorPercentual(pct) {
    const p = PARAMETROS.componente;
    if (pct >= p.vencido) return 'vencido';
    if (pct >= p.critico) return 'critico';
    if (pct >= p.atencao) return 'atencao';
    return 'ok';
  }

  function desgasteComponente(state, componente, hoje) {
    const ultima = ultimaLeitura(state, componente.impressoraId);
    const contadorAtual = ultima ? ultima.contador : componente.contadorNaInstalacao;
    const uso = Math.max(0, contadorAtual - componente.contadorNaInstalacao);
    const pct = componente.vidaPaginas > 0 ? (uso / componente.vidaPaginas) * 100 : 0;
    const restantes = Math.max(0, componente.vidaPaginas - uso);
    const taxa = taxaDiaria(state, componente.impressoraId, hoje);
    const diasRestantes = taxa && taxa > 0 ? Math.floor(restantes / taxa) : null;
    return {
      componente,
      contadorAtual,
      uso,
      pct: Math.round(pct * 10) / 10,
      paginasRestantes: restantes,
      taxaDiaria: taxa ? Math.round(taxa) : null,
      diasRestantes,
      dataPrevista: diasRestantes !== null ? addDays(hoje, diasRestantes) : null,
      nivel: nivelPorPercentual(pct)
    };
  }

  // ---------- Suprimento (toner/tinta) ----------
  function previsaoSuprimento(state, impressoraId, hoje) {
    const ls = leiturasDe(state, impressoraId).filter(l => l.data >= addDays(hoje, -PARAMETROS.janelaTaxaDias));
    const ultima = ls[ls.length - 1] || ultimaLeitura(state, impressoraId);
    if (!ultima || ultima.toner == null) return null;
    // consumo: soma das quedas entre leituras consecutivas (ignora trocas de cartucho)
    let queda = 0;
    let dias = 0;
    for (let i = 1; i < ls.length; i++) {
      const d = ls[i - 1].toner - ls[i].toner;
      if (d > 0) queda += d;
      dias += diffDays(ls[i].data, ls[i - 1].data);
    }
    const consumoDia = dias > 0 ? queda / dias : 0;
    const diasRestantes = consumoDia > 0 ? Math.floor(ultima.toner / consumoDia) : null;
    let nivel = 'ok';
    if (ultima.toner <= PARAMETROS.toner.critico) nivel = 'critico';
    else if (ultima.toner <= PARAMETROS.toner.atencao) nivel = 'atencao';
    return { nivel: nivel, toner: ultima.toner, consumoDia: Math.round(consumoDia * 100) / 100, diasRestantes };
  }

  // ---------- C. Comportamento anormal ----------
  /** Contagem de erros de um tipo por semana. Índice 0 = semana mais antiga; último = últimos 7 dias. */
  function serieSemanalErros(state, impressoraId, tipo, hoje, semanas = PARAMETROS.anomalia.semanas) {
    const serie = new Array(semanas).fill(0);
    for (const e of state.erros) {
      if (e.impressoraId !== impressoraId) continue;
      if (tipo && e.tipo !== tipo) continue;
      const idade = diffDays(hoje, e.data); // 0 = hoje
      if (idade < 0) continue;
      const semanaAtras = Math.floor(idade / 7);
      if (semanaAtras < semanas) serie[semanas - 1 - semanaAtras] += 1;
    }
    return serie;
  }

  /**
   * Gráfico de controle c (contagem de eventos):
   *   linha média c̄ = média das semanas anteriores
   *   limite superior LSC = c̄ + 3·√c̄
   * A semana atual é anormal se ultrapassar o LSC e tiver um mínimo de eventos
   * (evita alertas por 1 ou 2 ocorrências isoladas).
   */
  function detectarAnomalia(serie, opcoes = {}) {
    const minimo = opcoes.minimoEventos ?? PARAMETROS.anomalia.minimoEventos;
    const sigmas = opcoes.sigmas ?? PARAMETROS.anomalia.sigmas;
    if (!serie || serie.length < 3) return { anomalo: false, motivo: 'histórico insuficiente' };
    const base = serie.slice(0, -1);
    const atual = serie[serie.length - 1];
    const media = base.reduce((s, v) => s + v, 0) / base.length;
    const limite = media + sigmas * Math.sqrt(Math.max(media, 0.25));
    const anomalo = atual >= minimo && atual > limite;
    return {
      anomalo,
      atual,
      media: Math.round(media * 100) / 100,
      limite: Math.round(limite * 100) / 100,
      razao: media > 0 ? Math.round((atual / media) * 10) / 10 : null
    };
  }

  // ---------- Alertas ----------
  const RECOMENDACOES_ANOMALIA = {
    alimentacao: 'Verificar rolos de alimentação e mecanismo de tração; conferir tipo e armazenamento do papel.',
    atolamento: 'Inspecionar trajeto do papel, rolos e unidade fusora; remover resíduos de papel.',
    fusor: 'Inspecionar a unidade fusora e o histórico de substituição; avaliar troca preventiva.',
    qualidade: 'Verificar cilindro, suprimento e limpeza interna; medir distância entre marcas repetidas.',
    comunicacao: 'Verificar cabo/rede, endereço IP e configuração SNMP do equipamento.',
    suprimento: 'Verificar cartucho instalado (original/compatível) e chip do suprimento.'
  };

  const br = iso => (iso ? iso.split('-').reverse().join('/') : '—');   // 2026-11-17 → 17/11/2026
  const dec = v => String(v).replace('.', ',');                          // 1.43 → 1,43

  function nomeImpressora(imp) {
    return `${imp.codigo} · ${imp.marca} ${imp.modelo}`;
  }

  function osAbertaPara(state, alertaId) {
    return state.ordens.find(o => o.alertaId === alertaId && o.status !== 'concluida') || null;
  }

  function gerarAlertas(state, hoje) {
    const alertas = [];
    const push = a => {
      a.os = osAbertaPara(state, a.id);
      a.reconhecido = Boolean(state.alertasReconhecidos && state.alertasReconhecidos[a.id]);
      alertas.push(a);
    };

    for (const imp of state.impressoras) {
      if (imp.ativa === false) continue;
      const ultima = ultimaLeitura(state, imp.id);

      // Comunicação / atualização dos dados
      if (ultima) {
        const idade = diffDays(hoje, ultima.data);
        if (imp.origem === 'snmp' && idade > PARAMETROS.semComunicacaoDias) {
          push({
            id: `comunicacao:${imp.id}`, impressoraId: imp.id, tipo: 'comunicacao', gravidade: 'atencao',
            titulo: 'Impressora sem comunicação',
            descricao: `Nenhuma leitura automática recebida há ${idade} dias.`,
            recomendacao: RECOMENDACOES_ANOMALIA.comunicacao,
            evidencia: `Última leitura: ${br(ultima.data)}`
          });
        }
        if (imp.origem === 'manual' && idade > PARAMETROS.leituraManualDias) {
          push({
            id: `leitura:${imp.id}`, impressoraId: imp.id, tipo: 'leitura', gravidade: 'info',
            titulo: 'Leitura manual desatualizada',
            descricao: `O contador não é registrado há ${idade} dias; as previsões podem estar imprecisas.`,
            recomendacao: 'Registrar o contador e o nível de suprimento atuais.',
            evidencia: `Última leitura manual: ${br(ultima.data)}`
          });
        }
      }

      // Suprimento
      const sup = previsaoSuprimento(state, imp.id, hoje);
      if (sup && sup.nivel !== 'ok') {
        push({
          id: `toner:${imp.id}`, impressoraId: imp.id, tipo: 'toner',
          gravidade: sup.nivel === 'critico' ? 'critico' : 'atencao',
          titulo: imp.tipo === 'jato' ? 'Tinta próxima do fim' : 'Toner próximo do fim',
          descricao: `Nível atual de ${sup.toner}%` + (sup.diasRestantes !== null ? `, previsão de ${sup.diasRestantes} dia(s) de uso.` : '.'),
          recomendacao: 'Providenciar suprimento de reposição antes da parada.',
          evidencia: `Consumo médio: ${dec(sup.consumoDia)}% ao dia`
        });
      }

      // Componentes
      for (const c of state.componentes.filter(x => x.impressoraId === imp.id)) {
        const d = desgasteComponente(state, c, hoje);
        if (d.nivel === 'ok') continue;
        const gravidade = d.nivel === 'atencao' ? 'atencao' : 'critico';
        const recomendacao = d.nivel === 'atencao'
          ? 'Programar inspeção e avaliar substituição preventiva.'
          : d.nivel === 'critico'
            ? 'Agendar substituição preventiva e reservar a peça.'
            : 'Ciclo de referência ultrapassado: substituir o componente.';
        push({
          id: `componente:${c.id}`, impressoraId: imp.id, tipo: 'componente', gravidade,
          componenteId: c.id,
          titulo: `${TIPOS_COMPONENTE[c.tipo] || c.nome} em ${Math.round(d.pct)}% do ciclo`,
          descricao: `${d.uso.toLocaleString('pt-BR')} de ${c.vidaPaginas.toLocaleString('pt-BR')} páginas de referência` +
            (d.diasRestantes !== null ? `; limite previsto em ~${d.diasRestantes} dia(s).` : '.'),
          recomendacao,
          evidencia: `Ritmo atual: ${d.taxaDiaria ?? '—'} páginas/dia`
        });
      }

      // Comportamento anormal por tipo de erro
      for (const tipo of Object.keys(TIPOS_ERRO)) {
        const serie = serieSemanalErros(state, imp.id, tipo, hoje);
        const an = detectarAnomalia(serie);
        if (!an.anomalo) continue;
        push({
          id: `anomalia:${imp.id}:${tipo}`, impressoraId: imp.id, tipo: 'anomalia', tipoErro: tipo,
          gravidade: an.atual >= an.limite * 2 ? 'critico' : 'atencao',
          titulo: `Aumento anormal: ${TIPOS_ERRO[tipo].toLowerCase()}`,
          descricao: `${an.atual} ocorrência(s) nos últimos 7 dias; média anterior de ${dec(an.media)} por semana.`,
          recomendacao: RECOMENDACOES_ANOMALIA[tipo],
          evidencia: `Limite estatístico (c̄ + 3√c̄): ${dec(an.limite)} por semana`,
          serie
        });
      }

      // Preventiva
      if (imp.ultimaPreventiva && imp.intervaloPreventivaDias) {
        const vencimento = addDays(imp.ultimaPreventiva, imp.intervaloPreventivaDias);
        const atraso = diffDays(hoje, vencimento);
        if (atraso > 0) {
          push({
            id: `preventiva:${imp.id}`, impressoraId: imp.id, tipo: 'preventiva',
            gravidade: atraso > 30 ? 'critico' : 'atencao',
            titulo: 'Manutenção preventiva atrasada',
            descricao: `Prevista para ${br(vencimento)} (${atraso} dia(s) de atraso).`,
            recomendacao: 'Abrir ordem de serviço preventiva: limpeza, inspeção de rolos e fusor.',
            evidencia: `Última preventiva: ${br(imp.ultimaPreventiva)}; intervalo de ${imp.intervaloPreventivaDias} dias`
          });
        }
      }
    }

    const peso = { critico: 0, atencao: 1, info: 2 };
    alertas.sort((a, b) => peso[a.gravidade] - peso[b.gravidade] || a.titulo.localeCompare(b.titulo));
    for (const a of alertas) a.data = hoje;
    return alertas;
  }

  function situacaoImpressora(alertasDaImpressora) {
    if (alertasDaImpressora.some(a => a.gravidade === 'critico')) return 'critico';
    if (alertasDaImpressora.some(a => a.gravidade === 'atencao')) return 'atencao';
    return 'ok';
  }

  // ---------- Disponibilidade ----------
  /** % de dias do período em que a impressora não ficou parada (leituras com status "parada"). */
  function disponibilidade(state, impressoraId, hoje, dias = 30) {
    const inicio = addDays(hoje, -dias + 1);
    const parados = new Set(state.leituras
      .filter(l => l.impressoraId === impressoraId && l.data >= inicio && l.data <= hoje && l.status === 'parada')
      .map(l => l.data));
    return Math.round(((dias - parados.size) / dias) * 1000) / 10;
  }

  // ---------- Operações (validação de entrada) ----------
  function validarLeitura(state, impressoraId, leitura) {
    const erros = [];
    if (!Number.isFinite(leitura.contador) || leitura.contador < 0) erros.push('Contador inválido.');
    const ultima = ultimaLeitura(state, impressoraId);
    if (ultima && Number.isFinite(leitura.contador) && leitura.contador < ultima.contador) {
      erros.push(`Contador menor que a última leitura (${ultima.contador.toLocaleString('pt-BR')}). Verifique o valor.`);
    }
    if (leitura.toner != null && (!Number.isFinite(leitura.toner) || leitura.toner < 0 || leitura.toner > 100)) {
      erros.push('Nível de suprimento deve estar entre 0 e 100%.');
    }
    return erros;
  }

  /** Conclui uma OS. Se houve troca de componente, reinicia a contagem dele. */
  function concluirOrdem(state, ordemId, dados, hoje) {
    const os = state.ordens.find(o => o.id === ordemId);
    if (!os) throw new Error('Ordem de serviço não encontrada.');
    os.status = 'concluida';
    os.fechadaEm = hoje;
    os.defeitoEncontrado = dados.defeitoEncontrado || '';
    os.custo = Number(dados.custo) || 0;
    os.tecnico = dados.tecnico || os.tecnico || '';
    if (dados.componenteSubstituidoId) {
      const comp = state.componentes.find(c => c.id === dados.componenteSubstituidoId);
      if (comp) {
        const ultima = ultimaLeitura(state, comp.impressoraId);
        os.componenteSubstituidoId = comp.id;
        os.componenteSubstituidoNome = TIPOS_COMPONENTE[comp.tipo] || comp.nome;
        comp.contadorNaInstalacao = ultima ? ultima.contador : comp.contadorNaInstalacao;
        comp.instaladoEm = hoje;
      }
    }
    if (os.tipo === 'preventiva') {
      const imp = state.impressoras.find(i => i.id === os.impressoraId);
      if (imp) imp.ultimaPreventiva = hoje;
    }
    return os;
  }

  // ---------- D. Assistente de diagnóstico ----------
  const SINTOMAS = {
    alimentacao: {
      rotulo: 'Falhas de alimentação de papel (não puxa ou puxa várias folhas)',
      hipoteses: [
        { causa: 'Rolos de alimentação desgastados', peso: 40, componente: 'rolos',
          verificar: ['Inspecionar a superfície dos rolos (borracha lisa, brilhante ou rachada).', 'Limpar os rolos com pano levemente umedecido em água e testar novamente.', 'Se persistir, substituir conforme o manual do fabricante.'] },
        { causa: 'Acúmulo de poeira ou resíduos de papel no mecanismo', peso: 25,
          verificar: ['Desligar o equipamento e remover a bandeja.', 'Retirar resíduos de papel e poeira do trajeto de alimentação.'] },
        { causa: 'Papel inadequado ou armazenado incorretamente', peso: 20,
          verificar: ['Conferir gramatura e tipo de papel aceitos pela bandeja.', 'Verificar se o papel está úmido, ondulado ou com as folhas grudadas.', 'Testar com uma resma nova, armazenada em local seco.'] },
        { causa: 'Problema no mecanismo de tração (separador, engrenagens, sensor)', peso: 15,
          verificar: ['Verificar a almofada/rolo separador.', 'Observar ruídos anormais no acionamento.', 'Se necessário, encaminhar à assistência técnica.'] }
      ]
    },
    atolamento: {
      rotulo: 'Atolamentos de papel frequentes',
      hipoteses: [
        { causa: 'Resíduo ou objeto no trajeto do papel', peso: 30,
          verificar: ['Abrir todas as tampas de acesso e inspecionar com lanterna.', 'Remover pedaços de papel, grampos ou etiquetas.'] },
        { causa: 'Rolos de alimentação desgastados', peso: 25, componente: 'rolos',
          verificar: ['Inspecionar e limpar os rolos.', 'Comparar o uso com o ciclo de referência do fabricante.'] },
        { causa: 'Unidade fusora desgastada (atolamento na saída)', peso: 25, componente: 'fusor',
          verificar: ['Verificar onde o papel atola (entrada, meio ou saída).', 'Atolamento na saída e papel enrugado indicam o fusor.'] },
        { causa: 'Papel fora da especificação', peso: 20,
          verificar: ['Conferir gramatura, umidade e ajuste das guias da bandeja.'] }
      ]
    },
    qualidade: {
      rotulo: 'Impressão com manchas, falhas, riscos ou muito clara',
      hipoteses: [
        { causa: 'Cilindro fotocondutor desgastado ou riscado', peso: 35, componente: 'cilindro',
          verificar: ['Medir a distância entre marcas que se repetem na página.', 'Comparar com a tabela de defeitos repetitivos do manual (cada rolo tem uma circunferência).', 'Inspecionar a superfície do cilindro.'] },
        { causa: 'Suprimento baixo ou cartucho com defeito', peso: 30,
          verificar: ['Conferir nível do toner/tinta.', 'Agitar levemente o cartucho (toner) ou executar limpeza de cabeça (jato de tinta).', 'Testar com outro cartucho.'] },
        { causa: 'Unidade de transferência ou fusor com problema', peso: 20, componente: 'fusor',
          verificar: ['Verificar se o toner sai ao passar o dedo (fixação ruim aponta para o fusor).'] },
        { causa: 'Sujeira interna ou configuração de impressão', peso: 15,
          verificar: ['Executar a página de limpeza do equipamento.', 'Conferir modo economia de toner e tipo de papel configurado.'] }
      ]
    },
    fusor: {
      rotulo: 'Erro de fusor, toner não fixa ou papel sai enrugado',
      hipoteses: [
        { causa: 'Unidade fusora no fim da vida útil', peso: 45, componente: 'fusor',
          verificar: ['Comparar o uso do fusor com o ciclo de referência.', 'Inspecionar o rolo de pressão e a película do fusor.'] },
        { causa: 'Alimentação elétrica instável', peso: 20,
          verificar: ['Ligar a impressora direto na tomada (sem extensão ou filtro sobrecarregado).'] },
        { causa: 'Papel inadequado (gramatura/umidade)', peso: 20,
          verificar: ['Testar com papel novo e dentro da especificação.'] },
        { causa: 'Sensor de temperatura ou conector com falha', peso: 15,
          verificar: ['Encaminhar à assistência técnica autorizada.'] }
      ]
    },
    comunicacao: {
      rotulo: 'Impressora não aparece na rede / sem comunicação',
      hipoteses: [
        { causa: 'Equipamento desligado ou em modo de economia profunda', peso: 30,
          verificar: ['Confirmar se está ligada e se o painel responde.'] },
        { causa: 'Cabo de rede ou ponto de rede com problema', peso: 30,
          verificar: ['Verificar o LED da porta de rede.', 'Testar outro cabo ou ponto de rede.'] },
        { causa: 'Mudança de endereço IP (DHCP)', peso: 25,
          verificar: ['Imprimir a página de configuração e comparar o IP com o cadastro.', 'Reservar IP fixo no servidor DHCP.'] },
        { causa: 'SNMP desativado ou community alterada', peso: 15,
          verificar: ['Acessar a página web da impressora e conferir a configuração SNMP.'] }
      ]
    }
  };

  function diagnosticar(state, impressoraId, sintoma, hoje) {
    const base = SINTOMAS[sintoma];
    if (!base) return null;
    const imp = state.impressoras.find(i => i.id === impressoraId);
    const comps = state.componentes.filter(c => c.impressoraId === impressoraId);
    const serie = serieSemanalErros(state, impressoraId, sintoma, hoje);
    const anomalia = detectarAnomalia(serie);

    const hipoteses = base.hipoteses.map(h => {
      let peso = h.peso;
      const evidencias = [];
      if (h.componente) {
        const comp = comps.find(c => c.tipo === h.componente);
        if (comp) {
          const d = desgasteComponente(state, comp, hoje);
          if (d.pct >= PARAMETROS.componente.atencao) {
            peso += 30;
            evidencias.push(`${TIPOS_COMPONENTE[comp.tipo]} em ${Math.round(d.pct)}% do ciclo de referência.`);
          } else if (d.pct < 10) {
            peso -= 20;
            evidencias.push(`${TIPOS_COMPONENTE[comp.tipo]} substituído recentemente (${Math.round(d.pct)}% do ciclo).`);
          } else {
            evidencias.push(`${TIPOS_COMPONENTE[comp.tipo]} em ${Math.round(d.pct)}% do ciclo (dentro do esperado).`);
          }
        }
      }
      return { causa: h.causa, peso: Math.max(5, peso), evidencias, verificar: h.verificar };
    });

    const total = hipoteses.reduce((s, h) => s + h.peso, 0);
    for (const h of hipoteses) h.relevancia = Math.round((h.peso / total) * 100);
    hipoteses.sort((a, b) => b.peso - a.peso);

    return {
      impressora: imp,
      sintoma: base.rotulo,
      anomalia,
      serie,
      hipoteses,
      aviso: 'As hipóteses são orientações para investigação técnica, não um diagnóstico definitivo. Confirme sempre com inspeção do equipamento e o manual do fabricante.'
    };
  }

  // ---------- Demonstração: manter as datas atuais ----------
  /** Desloca todas as datas do estado em n dias (usado para manter a demo "no presente"). */
  function deslocarDatas(state, n) {
    if (!n) return state;
    const shift = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? addDays(v, n) : v);
    for (const l of state.leituras) l.data = shift(l.data);
    for (const e of state.erros) e.data = shift(e.data);
    for (const c of state.componentes) c.instaladoEm = shift(c.instaladoEm);
    for (const i of state.impressoras) { i.ultimaPreventiva = shift(i.ultimaPreventiva); i.instaladaEm = shift(i.instaladaEm); }
    for (const o of state.ordens) { o.abertaEm = shift(o.abertaEm); o.fechadaEm = shift(o.fechadaEm); }
    if (state.alertasReconhecidos) {
      for (const k of Object.keys(state.alertasReconhecidos)) state.alertasReconhecidos[k] = shift(state.alertasReconhecidos[k]);
    }
    state.dataReferencia = shift(state.dataReferencia);
    return state;
  }

  const API = {
    PARAMETROS, TIPOS_ERRO, TIPOS_COMPONENTE, SINTOMAS,
    parseISO, toISO, addDays, diffDays, hojeISO,
    leiturasDe, ultimaLeitura, taxaDiaria,
    desgasteComponente, nivelPorPercentual, previsaoSuprimento,
    serieSemanalErros, detectarAnomalia,
    gerarAlertas, situacaoImpressora, disponibilidade, nomeImpressora,
    validarLeitura, concluirOrdem, diagnosticar, deslocarDatas
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.PrintCareEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
