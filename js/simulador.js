/**
 * IBIAPABA SOLAR - Módulo Simulador Profissional
 * Implementa a lógica financeira legal (Lei 14.300/2022 + estatuto).
 *
 * Fórmulas:
 *   ValorContribuição = (Cmc - Cgd) × 0.8
 *   EnergiaCliente = (ConsumoCliente / ConsumoTotal) × GeraçãoUsina
 */

const ModSimulador = (() => {

  const MINIMO_KWH = { monofasico: 30, bifasico: 50, trifasico: 100 };

  let _resultado = null;

  /* ── Render ─────────────────────────────────────────────── */
  async function render() {
    const config = await _loadConfig();
    document.getElementById('sim-cap-usina').textContent =
      `${config.capacidade_usina_kwp} kWp`;
    document.getElementById('sim-geracao-estimada').textContent =
      `${(config.geracao_media_estimada || 38000).toLocaleString('pt-BR')} kWh/mês`;
    document.getElementById('sim-fator-perda').value =
      Math.round((config.fator_perda || 0.10) * 100);
    _updatePerdaLabel();
  }

  async function _loadConfig() {
    const fp  = await DB.getConfig('fator_perda');
    const ms  = await DB.getConfig('margem_seguranca');
    const cap = await DB.getConfig('capacidade_usina_kwp');
    const ger = await DB.getConfig('geracao_media_estimada');
    return {
      fator_perda:             (fp  && fp.valor  !== undefined) ? fp.valor  : 0.10,
      margem_seguranca:        (ms  && ms.valor  !== undefined) ? ms.valor  : 0.10,
      capacidade_usina_kwp:    (cap && cap.valor !== undefined) ? cap.valor : 300,
      geracao_media_estimada:  (ger && ger.valor !== undefined) ? ger.valor : 38000,
    };
  }

  function _updatePerdaLabel() {
    const v = document.getElementById('sim-fator-perda').value;
    document.getElementById('sim-perda-label').textContent = `${v}%`;
  }

  /* ── CÁLCULO PRINCIPAL ──────────────────────────────────── */
  async function calcular() {
    const config = await _loadConfig();

    const consumo = parseFloat(document.getElementById('sim-consumo').value);
    const cmc     = parseFloat(document.getElementById('sim-conta').value);
    const tipo    = document.getElementById('sim-tipo').value;
    const perda   = parseInt(document.getElementById('sim-fator-perda').value) / 100;

    // Validações
    if (!consumo || consumo <= 0) { App.toast('Informe o consumo mensal em kWh.', 'warning'); return; }
    if (!cmc || cmc <= 0)         { App.toast('Informe o valor da conta atual.', 'warning'); return; }
    if (!tipo)                    { App.toast('Selecione o tipo de ligação.', 'warning'); return; }

    const minimoKwh = MINIMO_KWH[tipo];

    if (consumo < minimoKwh) {
      App.toast(`Consumo menor que o mínimo para ${_tipoLabel(tipo)}: ${minimoKwh} kWh.`, 'error');
      return;
    }

    // ---------- CÁLCULOS ----------
    const tarifa_kwh          = cmc / consumo;               // R$/kWh médio
    const energia_compensavel = consumo - minimoKwh;          // kWh que podem ser compensados
    const energia_com_perda   = energia_compensavel * (1 - perda); // após perda técnica

    // Nova conta (Cgd): paga apenas custo mínimo + eventuais excedentes
    const cgd_kwh             = minimoKwh;                    // kWh cobráveis
    const cgd                 = cgd_kwh * tarifa_kwh;         // valor estimado pós GD

    // Fórmula do estatuto: ValorContribuição = (Cmc - Cgd) × 0.80
    const margem              = config.margem_seguranca;       // 10%
    const economia_bruta      = cmc - cgd;
    const contribuicao        = economia_bruta * 0.80;
    const economia_real       = economia_bruta * (1 - margem);
    const economia_conserv    = economia_real  * 0.85;         // cenário conservador
    const economia_liquida    = economia_bruta - contribuicao;

    // Taxa de compensação efetiva
    const pct_compensado      = (energia_com_perda / consumo) * 100;

    _resultado = {
      consumo, cmc, tipo, perda, minimoKwh,
      tarifa_kwh, energia_compensavel, energia_com_perda,
      cgd, economia_bruta, contribuicao,
      economia_real, economia_conserv, economia_liquida,
      pct_compensado,
    };

    _renderResultado(config);
  }

  function _renderResultado(config) {
    const r = _resultado;
    document.getElementById('sim-resultado').style.display = 'block';

    // Cards principais
    document.getElementById('res-conta-atual').textContent    = App.moeda(r.cmc);
    document.getElementById('res-conta-gd').textContent       = App.moeda(r.cgd);
    document.getElementById('res-economia-bruta').textContent = App.moeda(r.economia_bruta);
    document.getElementById('res-contribuicao').textContent   = App.moeda(r.contribuicao);
    document.getElementById('res-eco-liquida').textContent    = App.moeda(r.economia_liquida);

    // Cenários
    document.getElementById('cen-otimista').textContent  = App.moeda(r.economia_bruta);
    document.getElementById('cen-realista').textContent  = App.moeda(r.economia_real);
    document.getElementById('cen-conserv').textContent   = App.moeda(r.economia_conserv);

    // Métricas técnicas
    document.getElementById('res-tarifa').textContent    = `R$ ${r.tarifa_kwh.toFixed(4)}/kWh`;
    document.getElementById('res-compensavel').textContent = `${r.energia_compensavel.toFixed(0)} kWh`;
    document.getElementById('res-pct').textContent       = `${r.pct_compensado.toFixed(1)}%`;
    document.getElementById('res-minimo').textContent    = `${r.minimoKwh} kWh`;

    // Barra de compensação
    const pct = Math.min(r.pct_compensado, 100);
    document.getElementById('res-barra-fill').style.width = pct + '%';

    // Projeção anual
    document.getElementById('res-eco-anual').textContent  = App.moeda(r.economia_liquida * 12);
    document.getElementById('res-contrib-anual').textContent = App.moeda(r.contribuicao * 12);

    // Alertas
    _renderAlertas(r);
  }

  function _renderAlertas(r) {
    const cont = document.getElementById('sim-alertas');
    const alertas = [];

    if (r.pct_compensado < 50) {
      alertas.push({ tipo: 'warning', msg: '⚠️ Baixa compensação estimada. Consumo próximo ao mínimo obrigatório.' });
    }
    if (r.tarifa_kwh < 0.50) {
      alertas.push({ tipo: 'info', msg: 'ℹ️ Tarifa estimada baixa. Verifique se o valor informado inclui todos os encargos.' });
    }
    if (r.economia_liquida > r.cmc * 0.8) {
      alertas.push({ tipo: 'warning', msg: '⚠️ Economia projetada muito alta. Confira os dados inseridos.' });
    }
    alertas.push({ tipo: 'success', msg: '✅ Projeção calculada com margem de segurança de 10%. Economia real pode variar.' });

    cont.innerHTML = alertas.map(a =>
      `<div class="alert alert-${a.tipo}"><span class="alert-icon"></span>${a.msg}</div>`
    ).join('');
  }

  function limpar() {
    document.getElementById('form-simulador').reset();
    document.getElementById('sim-resultado').style.display = 'none';
    _resultado = null;
    document.getElementById('sim-alertas').innerHTML = '';
    _updatePerdaLabel();
  }

  /* ── Exportar resultado ─────────────────────────────────── */
  function exportarResultado() {
    if (!_resultado) { App.toast('Faça uma simulação primeiro.', 'warning'); return; }
    const r = _resultado;
    const texto = `SIMULAÇÃO IBIAPABA SOLAR
=============================
Data: ${new Date().toLocaleDateString('pt-BR')}
Tipo de Ligação: ${_tipoLabel(r.tipo)}
Consumo Mensal: ${r.consumo} kWh
Tarifa Média: R$ ${r.tarifa_kwh.toFixed(4)}/kWh
Fator de Perda: ${(r.perda*100).toFixed(0)}%

RESULTADOS:
----------------------------
Conta Atual (Cmc):          ${App.moeda(r.cmc)}
Conta Estimada c/ GD (Cgd): ${App.moeda(r.cgd)}
Economia Bruta:             ${App.moeda(r.economia_bruta)}
Valor Contribuição (80%):   ${App.moeda(r.contribuicao)}
Economia Líquida Cliente:   ${App.moeda(r.economia_liquida)}

CENÁRIOS PROJETADOS:
----------------------------
Otimista:    ${App.moeda(r.economia_bruta)}
Realista:    ${App.moeda(r.economia_real)}
Conservador: ${App.moeda(r.economia_conserv)}

PROJEÇÃO ANUAL:
----------------------------
Economia Líquida/Ano: ${App.moeda(r.economia_liquida * 12)}
Contribuição/Ano:     ${App.moeda(r.contribuicao * 12)}

AVISO LEGAL:
Este relatório é uma projeção com margem de segurança.
Valores reais podem variar conforme geração da usina e tarifas da concessionária.
`;

    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `simulacao-ibiapaba-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    App.toast('Relatório exportado!', 'success');
  }

  function _tipoLabel(t) {
    return { monofasico: 'Monofásico', bifasico: 'Bifásico', trifasico: 'Trifásico' }[t] || t;
  }

  return { render, calcular, limpar, exportarResultado, _updatePerdaLabel };
})();

window.ModSimulador = ModSimulador;
