/**
 * IBIAPABA SOLAR - Módulo Simulador Profissional
 * Implementa a lógica financeira legal (Lei 14.300/2022 + estatuto).
 *
 * Fórmulas:
 *   ValorContribuição = (Cmc - Cgd) × 0.8
 *   EnergiaCliente = (ConsumoCliente / ConsumoTotal) × GeraçãoUsina
 *
 * Integração ENEL-CE: preenche automaticamente o valor da conta
 * com base nas tarifas vigentes (módulo Tarifas).
 */

const ModSimulador = (() => {

  const MINIMO_KWH = { monofasico: 30, bifasico: 50, trifasico: 100 };

  let _resultado   = null;
  let _contaManual = false; // true quando o usuário digitou à mão

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

    // Restaura bandeira salva
    const bandeiraEl = document.getElementById('sim-bandeira');
    if (bandeiraEl && typeof Tarifas !== 'undefined') {
      bandeiraEl.value = Tarifas.getBandeira();
    }
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

  /* ── CÁLCULO DE MÉDIA DE CONSUMO ────────────────────────── */
  function calcularMediaConsumo() {
    const m1 = parseFloat(document.getElementById('sim-consumo-m1').value) || 0;
    const m2 = parseFloat(document.getElementById('sim-consumo-m2').value) || 0;
    const m3 = parseFloat(document.getElementById('sim-consumo-m3').value) || 0;
    
    let count = 0;
    let sum = 0;
    if(m1 > 0) { sum += m1; count++; }
    if(m2 > 0) { sum += m2; count++; }
    if(m3 > 0) { sum += m3; count++; }

    let media = 0;
    if(count > 0) media = sum / count;

    document.getElementById('sim-consumo').value = media > 0 ? media.toFixed(0) : '';
    autoPreencherConta();
  }

  /* ── AUTO-CÁLCULO DA CONTA (ENEL-CE) ───────────────────── */
  function autoPreencherConta() {
    if (_contaManual) return; // respeita edição manual
    if (typeof Tarifas === 'undefined') return;

    const kwh  = parseFloat(document.getElementById('sim-consumo').value);
    const tipo = document.getElementById('sim-tipo').value;
    const band = document.getElementById('sim-bandeira')?.value || 'verde';
    if (!kwh || kwh <= 0 || !tipo) {
      document.getElementById('sim-tarifa-detalhe').innerHTML = '';
      return;
    }
    const result = Tarifas.calcularConta(kwh, tipo, Tarifas.getMunicipioDetectado(), band);
    document.getElementById('sim-conta').value = result.total.toFixed(2);
    const badge = document.getElementById('sim-auto-badge');
    if (badge) badge.style.display = 'inline';
    Tarifas.renderDetalhesConta(result, 'sim-tarifa-detalhe');
    Tarifas.setBandeira(band);
  }

  function onContaManual() {
    _contaManual = true;
    const badge = document.getElementById('sim-auto-badge');
    if (badge) badge.style.display = 'none';
    document.getElementById('sim-tarifa-detalhe').innerHTML = '';
  }

  /* ── CÁLCULO PRINCIPAL ──────────────────────────────────── */
  async function calcular() {
    const config = await _loadConfig();

    const consumo = parseFloat(document.getElementById('sim-consumo').value);
    const cmc     = parseFloat(document.getElementById('sim-conta').value);
    const cip     = parseFloat(document.getElementById('sim-cip').value) || 0;
    const tipo    = document.getElementById('sim-tipo').value;
    const perda   = parseInt(document.getElementById('sim-fator-perda').value) / 100;

    // Validações
    if (!consumo || consumo <= 0) { App.toast('Informe o consumo (ou a média dos meses) em kWh.', 'warning'); return; }
    if (!cmc || cmc <= 0)         { App.toast('Informe o valor da conta atual.', 'warning'); return; }
    if (!tipo)                    { App.toast('Selecione o tipo de ligação.', 'warning'); return; }

    const minimoKwh = MINIMO_KWH[tipo];

    if (consumo < minimoKwh) {
      App.toast(`Consumo menor que o mínimo para ${_tipoLabel(tipo)}: ${minimoKwh} kWh.`, 'error');
      return;
    }

    // ---------- CÁLCULOS ----------
    // Desconta o modelo de iluminação pública da conta bruta para uma tarifa limpa de energia
    const cmc_energia = Math.max(0.1, cmc - cip);
    
    const tarifa_kwh          = cmc_energia / consumo;               // R$/kWh médio puro
    const energia_compensavel = consumo - minimoKwh;          // kWh que podem ser compensados
    const energia_com_perda   = energia_compensavel * (1 - perda); // após perda técnica

    // Nova conta (Cgd): paga apenas custo mínimo da energia + iluminação pública inteira
    const cgd_kwh             = minimoKwh;                    // kWh cobráveis
    const cgd                 = (cgd_kwh * tarifa_kwh) + cip; // valor final pós GD
    
    // Fórmula do estatuto: ValorContribuição = (Cmc - Cgd) × 0.80
    const margem              = config.margem_seguranca;       // 10%
    const economia_bruta      = cmc - cgd;
    const contribuicao        = economia_bruta * 0.80;
    const economia_real       = economia_bruta * (1 - margem);
    const economia_conserv    = economia_real  * 0.85;         // cenário conservador
    const economia_liquida    = economia_bruta - contribuicao;

    // Taxa de compensação efetiva
    const pct_compensado      = (energia_com_perda / consumo) * 100;

    // Métricas Ambientais (estimativa genérica de mercado anual para GD)
    const consumo_anual = consumo * 12;
    const co2_evitado = consumo_anual * 0.43; // kg CO2 por kWh
    const arvores_plantadas = (co2_evitado / 1000) * 7.14; // ~7 árvores por tonelada


    const ger = parseFloat(config.geracao_media_estimada) || 38000;
    const cap = parseFloat(config.capacidade_usina_kwp) || 300;
    let cota_recomendada = ger > 0 ? (consumo / ger) * cap : 0;

    _resultado = {
      consumo, cmc, cip, tipo, perda, minimoKwh,
      tarifa_kwh, energia_compensavel, energia_com_perda,
      cgd, economia_bruta, contribuicao,
      economia_real, economia_conserv, economia_liquida,
      pct_compensado, cota_recomendada,
      co2: co2_evitado, arvores: arvores_plantadas
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

    // Cota Recomendada
    document.getElementById('res-cota-recomendada').textContent = `${(r.cota_recomendada || 0).toFixed(2)} kWp`;

    // Projeção anual
    document.getElementById('res-eco-anual').textContent  = App.moeda(r.economia_liquida * 12);
    document.getElementById('res-contrib-anual').textContent = App.moeda(r.contribuicao * 12);

    // Ambiental
    document.getElementById('res-arvores').textContent = r.arvores.toFixed(1);
    document.getElementById('res-co2').textContent = r.co2.toFixed(1);

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
    _resultado   = null;
    _contaManual = false;
    document.getElementById('sim-alertas').innerHTML = '';
    document.getElementById('sim-tarifa-detalhe').innerHTML = '';
    const badge = document.getElementById('sim-auto-badge');
    if (badge) badge.style.display = 'none';
    _updatePerdaLabel();
  }

  /* ── Exportar Proposta PDF Profissional ─────────────────────────────────── */
  async function exportarResultado() {
    if (!_resultado) { App.toast('Faça uma simulação primeiro.', 'warning'); return; }
    const r = _resultado;
    
    // Verificamos se a lib html2pdf está carregada
    if (typeof html2pdf === 'undefined') {
      App.toast('Biblioteca PDF não carregada. Tente recarregar a página.', 'error');
      return;
    }

    App.toast('Gerando PDF da Proposta...', 'info');

    const container = document.getElementById('pdf-container');
    container.style.display = 'block';

    // Montar o HTML do PDF
    container.innerHTML = `
      <div style="font-family: 'Inter', sans-serif; color: #1f2937;">
        <div style="text-align: center; border-bottom: 2px solid #16a34a; padding-bottom: 20px; margin-bottom: 30px;">
          <h1 style="color: #16a34a; margin: 0; font-size: 28px;">☀️ Proposta Ibiapaba Solar</h1>
          <p style="margin: 5px 0 0; color: #4b5563; font-size: 14px;">Lei 14.300/2022 - Geração Compartilhada Geração Distribuída</p>
          <p style="margin: 5px 0 0; color: #9ca3af; font-size: 12px;">Data da Simulação: ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>

        <h3 style="margin-bottom: 10px; color: #374151;">🧑‍💻 Perfil Técnico do Cliente</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr style="background-color: #f3f4f6;">
            <td style="padding: 10px; border: 1px solid #e5e7eb; width: 50%;"><strong>Tipo Ligação:</strong> ${_tipoLabel(r.tipo)}</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; width: 50%;"><strong>Consumo Médio Projetado:</strong> ${r.consumo} kWh/mês</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Cota Instalada (Recomendada):</strong> <span style="color:#16a34a; font-weight:bold;">${parseFloat(r.cota_recomendada || 0).toFixed(2)} kWp</span></td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Tarifa I. Pública (CIP):</strong> ${r.cip > 0 ? App.moeda(r.cip) : 'Isento ou R$ 0,00'}</td>
          </tr>
        </table>

        <h3 style="margin-bottom: 10px; color: #374151;">🌱 Impacto e Sustentabilidade (Acumulado em 1 ano)</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; text-align: center; font-size: 14px;">
          <tr style="background-color: #f0fdf4;">
            <td style="padding: 10px; border: 1px solid #dcfce7; width: 50%;">
              <div style="font-size: 20px; font-weight:bold; color: #15803d;">🌳 ${r.arvores.toFixed(1)}</div>
              <div style="color: #166534; font-size: 12px;">Árvores Plantadas (Equivalência)</div>
            </td>
            <td style="padding: 10px; border: 1px solid #e0f2fe; background-color: #f0f9ff; width: 50%;">
              <div style="font-size: 20px; font-weight:bold; color: #0369a1;">☁️ ${r.co2.toFixed(1)}</div>
              <div style="color: #075985; font-size: 12px;">CO₂ Evitado na Atmosfera (kg)</div>
            </td>
          </tr>
        </table>

        <h3 style="margin-bottom: 10px; color: #374151;">💰 Resultados da Economia</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; text-align: left; font-size: 14px;">
          <thead>
            <tr style="background-color: #16a34a; color: white;">
              <th style="padding: 10px; border: 1px solid #e5e7eb;">Descrição</th>
              <th style="padding: 10px; border: 1px solid #e5e7eb;">Valor (R$ / mês)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">Conta Atual s/ Solar (Estimada)</td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${App.moeda(r.cmc)}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">Nova Conta Obrigatória na ENEL (Cgd)</td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${App.moeda(r.cgd)}</td>
            </tr>
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px; border: 1px solid #e5e7eb;">Economia Bruta</td>
              <td style="padding: 10px; border: 1px solid #e5e7eb; color: #16a34a;"><strong>${App.moeda(r.economia_bruta)}</strong></td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">Contribuição Mensal Associação</td>
              <td style="padding: 10px; border: 1px solid #e5e7eb; color: #dc2626;">- ${App.moeda(r.contribuicao)}</td>
            </tr>
            <tr style="background-color: #dcfce7; font-weight: bold;">
              <td style="padding: 12px 10px; border: 1px solid #e5e7eb; font-size: 16px;">Sua Economia Líquida</td>
              <td style="padding: 12px 10px; border: 1px solid #e5e7eb; font-size: 16px; color: #15803d;">${App.moeda(r.economia_liquida)} / mês</td>
            </tr>
          </tbody>
        </table>

        <h3 style="margin-bottom: 10px; color: #374151;">📈 Projeção Anual</h3>
        <div style="background-color: #f8fafc; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 30px;">
          <p style="margin: 0; font-size: 18px; text-align: center;">
            Com a Ibiapaba Solar, você economizará aproximadamente <br/>
            <strong style="color: #16a34a; font-size: 24px;">${App.moeda(r.economia_liquida * 12)}</strong> no primeiro ano!
          </p>
        </div>

        <div style="font-size: 10px; color: #6b7280; text-align: justify; margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <strong>AVISO LEGAL:</strong> Este documento possui caráter exclusivamente informativo e simulatório. 
          Os valores apresentados são baseados nas tarifas vigentes da concessionária local, aplicadas sem ICMS (benefício isenção ou base de cálculo reduzida a depender da UF para consumo gerado). 
          Flutuações climáticas, tributárias, adição de bandeiras tarifárias e reajustes da distribuidora poderão afetar o valor real da economia. A contribuição associativa tem margem de segurança de mitigação de 10%.
        </div>
      </div>
    `;

    // Opções do PDF
    const opt = {
      margin:       10,
      filename:     `Proposta_IbiapabaSolar_${Date.now()}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      await html2pdf().set(opt).from(container).save();
      App.toast('PDF baixado!', 'success');
    } catch(e) {
      console.error(e);
      App.toast('Erro ao gerar PDF', 'error');
    } finally {
      // Ocultar div de renderização
      container.style.display = 'none';
      container.innerHTML = '';
    }
  }

  /* ── TRANSFORMAR EM CLIENTE (CRM) ───────────────────────────────── */
  async function transformarEmCliente() {
    if (!_resultado) { App.toast('Faça uma simulação primeiro.', 'warning'); return; }
    
    // Obter cota kwp baseado na simulação: (consumo / geracao_media_mensal) * capacidade_kwp
    const config = await _loadConfig();
    const ger = parseFloat(config.geracao_media_estimada) || 38000;
    const cap = parseFloat(config.capacidade_usina_kwp) || 300;
    let cota = 0;
    
    if(ger > 0) {
       cota = (_resultado.consumo / ger) * cap;
    }

    if(typeof ModClientes !== 'undefined') {
       App.navegar('clientes');
       ModClientes.abrirModalComDados({
          consumo_medio: _resultado.consumo,
          tipo_ligacao: _resultado.tipo,
          cota_kwp: cota.toFixed(2)
       });
    } else {
       App.toast('Módulo de clientes não encontrado.', 'error');
    }
  }

  function _tipoLabel(t) {
    return { monofasico: 'Monofásico', bifasico: 'Bifásico', trifasico: 'Trifásico' }[t] || t;
  }

  return { render, calcular, limpar, exportarResultado, transformarEmCliente, _updatePerdaLabel, autoPreencherConta, onContaManual, calcularMediaConsumo };
})();

window.ModSimulador = ModSimulador;
