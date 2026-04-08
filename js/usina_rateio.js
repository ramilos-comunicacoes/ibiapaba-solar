/**
 * IBIAPABA SOLAR - Módulo Usina & Rateio Inteligente
 * Geração mensal, performance e distribuição automática de créditos.
 *
 * Fórmula de Rateio (Estatuto):
 *   EnergiaCliente = (ConsumoCliente / ConsumoTotal) × GeraçãoUsina
 */

const ModUsina = (() => {

  let _registros = [];

  async function render() {
    _registros = await DB.getAll(DB.STORES.USINA);
    _registros.sort((a, b) => b.mes_ano.localeCompare(a.mes_ano));
    _renderStats();
    _renderTabela();
    _renderGrafico();
  }

  function _renderStats() {
    const ultimo = _registros[0];
    const ger    = ultimo ? ultimo.geracao_real : 0;
    const est    = ultimo ? ultimo.geracao_estimada : 38000;
    const perf   = est > 0 ? ((ger / est) * 100).toFixed(1) : 0;
    const total  = _registros.reduce((s, r) => s + (r.geracao_real || 0), 0);

    document.getElementById('usina-ger-mes').textContent   = ger.toLocaleString('pt-BR') + ' kWh';
    document.getElementById('usina-perf').textContent      = perf + '%';
    document.getElementById('usina-total-ano').textContent = total.toLocaleString('pt-BR') + ' kWh';

    const fillEl = document.getElementById('usina-perf-bar');
    if (fillEl) {
      fillEl.style.width = Math.min(perf, 100) + '%';
      fillEl.className = 'progress-fill' + (perf >= 95 ? '' : perf >= 80 ? ' orange' : ' red');
    }
  }

  function _renderTabela() {
    const tbody = document.getElementById('usina-tbody');
    if (_registros.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">
        <div class="empty-state"><div class="empty-icon">⚡</div>
        <h3>Nenhum registro de geração</h3>
        <p>Adicione a geração mensal da usina.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = _registros.map(r => {
      const perf = r.geracao_estimada > 0
        ? ((r.geracao_real / r.geracao_estimada) * 100).toFixed(1)
        : 0;
      const cor = perf >= 95 ? 'badge-green' : perf >= 80 ? 'badge-yellow' : 'badge-red';
      return `<tr>
        <td>${_formatMesAno(r.mes_ano)}</td>
        <td class="font-bold text-primary">${(r.geracao_real || 0).toLocaleString('pt-BR')} kWh</td>
        <td>${(r.geracao_estimada || 0).toLocaleString('pt-BR')} kWh</td>
        <td><span class="badge ${cor}">${perf}%</span></td>
        <td>${r.irradiacao || '—'} kWh/m²</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-primary btn-sm" onclick="ModRateio.processarMes('${r.mes_ano}')">⚡ Ratear</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="ModUsina.editar(${r.id})">✏️</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="ModUsina.excluir(${r.id})">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function _renderGrafico() {
    const cont  = document.getElementById('usina-grafico');
    if (!cont) return;
    const itens = _registros.slice(0, 6).reverse();
    const max   = Math.max(...itens.map(r => Math.max(r.geracao_real || 0, r.geracao_estimada || 0)));

    cont.innerHTML = `<div class="bar-chart">` + itens.map(r => {
      const hReal = max > 0 ? ((r.geracao_real / max) * 100) : 0;
      const hEst  = max > 0 ? ((r.geracao_estimada / max) * 100) : 0;
      return `<div class="bar-wrap" style="gap:2px">
        <div class="bar" style="height:${hEst}%; background: var(--gray-200)" title="Estimado: ${r.geracao_estimada} kWh"></div>
        <div class="bar" style="height:${hReal}%" title="Real: ${r.geracao_real} kWh"></div>
        <span class="bar-label" style="margin-top:4px">${_formatMesAno(r.mes_ano).split('/')[0]}</span>
      </div>`;
    }).join('') + `</div>
    <div class="flex gap-2 mt-2 text-xs text-muted" style="gap:16px; margin-top:8px">
      <div style="display:flex;align-items:center;gap:4px"><div style="width:10px;height:10px;background:var(--primary);border-radius:2px"></div> Real</div>
      <div style="display:flex;align-items:center;gap:4px"><div style="width:10px;height:10px;background:var(--gray-200);border-radius:2px"></div> Estimado</div>
    </div>`;
  }

  /* ── Modal Geração ───────────────────────────────────────── */
  let _editId = null;

  function abrirModal(id = null) {
    _editId = id;
    const modal = document.getElementById('modal-geracao');
    document.getElementById('form-geracao').reset();
    document.getElementById('modal-geracao-titulo').textContent =
      id ? '✏️ Editar Geração' : '➕ Registrar Geração';

    if (id) {
      const r = _registros.find(x => x.id === id);
      if (r) {
        document.getElementById('ger-mes').value       = r.mes_ano;
        document.getElementById('ger-real').value      = r.geracao_real;
        document.getElementById('ger-estimada').value  = r.geracao_estimada;
        document.getElementById('ger-irrad').value     = r.irradiacao;
        document.getElementById('ger-obs').value       = r.observacoes;
      }
    }
    modal.classList.add('open');
  }

  function fecharModal() {
    document.getElementById('modal-geracao').classList.remove('open');
    _editId = null;
  }

  async function salvar() {
    const mes  = document.getElementById('ger-mes').value;
    const real = parseFloat(document.getElementById('ger-real').value);
    const est  = parseFloat(document.getElementById('ger-estimada').value);
    const irr  = parseFloat(document.getElementById('ger-irrad').value);
    const obs  = document.getElementById('ger-obs').value.trim();

    if (!mes || !real || real <= 0) {
      App.toast('Informe o mês e a geração real.', 'warning'); return;
    }

    const data = { mes_ano: mes, geracao_real: real, geracao_estimada: est || 38000, irradiacao: irr || null, observacoes: obs };

    try {
      if (_editId) { data.id = _editId; await DB.put(DB.STORES.USINA, data); }
      else { await DB.add(DB.STORES.USINA, data); }
      App.toast('Geração registrada!', 'success');
      fecharModal();
      await render();
    } catch (err) {
      if (err.name === 'ConstraintError') { App.toast('Já existe registro para este mês.', 'error'); }
      else { App.toast('Erro: ' + err.message, 'error'); }
    }
  }

  async function editar(id) { abrirModal(id); }

  async function excluir(id) {
    if (!confirm('Excluir este registro de geração?')) return;
    await DB.remove(DB.STORES.USINA, id);
    App.toast('Registro excluído.', 'success');
    await render();
  }

  function getUltimaGeracao() { return _registros[0] || null; }
  function getRegistros()     { return _registros; }

  function _formatMesAno(mes_ano) {
    const [y, m] = mes_ano.split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${meses[parseInt(m)-1]}/${y}`;
  }

  return { render, abrirModal, fecharModal, salvar, editar, excluir, getUltimaGeracao, getRegistros };
})();

window.ModUsina = ModUsina;

/* ============================================================
   RATEIO INTELIGENTE
   ============================================================ */
const ModRateio = (() => {

  let _rateios  = [];
  let _mesAtual = '';

  async function render() {
    _mesAtual = document.getElementById('rateio-mes').value || _getMesAtual();
    document.getElementById('rateio-mes').value = _mesAtual;

    _rateios = await DB.getByIndex(DB.STORES.RATEIO, 'mes_ano', _mesAtual);
    _renderResumo();
    _renderTabela();
  }

  function _getMesAtual() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function _renderResumo() {
    const totalGer    = _rateios.reduce((s, r) => s + (r.energia_alocada || 0), 0);
    const totalContrib = _rateios.reduce((s, r) => s + (r.contribuicao || 0), 0);
    const totalEco    = _rateios.reduce((s, r) => s + (r.economia_liquida || 0), 0);
    const clientes    = _rateios.length;

    document.getElementById('rat-energia').textContent  = totalGer.toLocaleString('pt-BR') + ' kWh';
    document.getElementById('rat-contrib').textContent  = App.moeda(totalContrib);
    document.getElementById('rat-eco').textContent      = App.moeda(totalEco);
    document.getElementById('rat-clientes').textContent = clientes;
  }

  function _renderTabela() {
    const tbody = document.getElementById('rateio-tbody');
    if (_rateios.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8">
        <div class="empty-state"><div class="empty-icon">⚡</div>
        <h3>Rateio não processado</h3>
        <p>Selecione o mês e registre o consumo de cada cliente, depois clique em "Processar Rateio".</p>
        </div></td></tr>`;
      return;
    }

    tbody.innerHTML = _rateios.map(r => `<tr>
      <td class="td-name">${r.nome_cliente || '—'}</td>
      <td>${(r.consumo_kwh || 0).toLocaleString('pt-BR')} kWh</td>
      <td>${(r.participacao_pct || 0).toFixed(2)}%</td>
      <td class="text-primary font-bold">${(r.energia_alocada || 0).toLocaleString('pt-BR')} kWh</td>
      <td>${App.moeda(r.valor_conta_cmc)}</td>
      <td>${App.moeda(r.valor_conta_cgd)}</td>
      <td><span class="text-primary font-bold">${App.moeda(r.contribuicao)}</span></td>
      <td><span class="text-success font-bold">${App.moeda(r.economia_liquida)}</span></td>
    </tr>`).join('');
  }

  /* ── Processar rateio do mês ─────────────────────────────── */
  async function processarMes(mesAno = null) {
    const mes = mesAno || document.getElementById('rateio-mes').value;
    if (!mes) { App.toast('Selecione o mês.', 'warning'); return; }

    // Buscar geração da usina
    const geracaoRec = await DB.getSingle(DB.STORES.USINA, 'mes_ano', mes);
    if (!geracaoRec) {
      App.toast(`Sem registro de geração para ${mes}. Registre primeiro na aba Usina.`, 'error');
      return;
    }

    const config = await _loadConfig();
    const fatorPerda = config.fator_perda || 0.10;
    const margem     = config.margem_seguranca || 0.10;

    // Geração disponível após perdas
    const geracaoLiquida = geracaoRec.geracao_real * (1 - fatorPerda);

    // Buscar consumo dos clientes no mês (ou usar consumo médio)
    const clientes = await DB.getAll(DB.STORES.CLIENTES);
    const ativos   = clientes.filter(c => c.status === 'ativo');

    if (ativos.length === 0) {
      App.toast('Nenhum cliente ativo.', 'warning'); return;
    }

    // Consumo de cada cliente no mês
    const consumos = [];
    for (const c of ativos) {
      const cons = await DB.getSingle(DB.STORES.CONSUMO, 'cliente_id', c.id);
      // Tenta buscar o consumo do mês específico
      const mesConsumos = await DB.getByIndex(DB.STORES.CONSUMO, 'cliente_id', c.id);
      const mesReg = mesConsumos.find(x => x.mes_ano === mes);
      consumos.push({
        cliente: c,
        consumo_kwh: mesReg ? mesReg.consumo_kwh : (c.consumo_medio || 0),
        conta_cmc:   mesReg ? mesReg.valor_conta  : ((c.consumo_medio || 0) * _estimarTarifa(c)),
      });
    }

    const consumoTotal = consumos.reduce((s, x) => s + x.consumo_kwh, 0);
    if (consumoTotal === 0) { App.toast('Consumo total zerado.', 'error'); return; }

    // Detectar superalocação
    if (geracaoLiquida > consumoTotal) {
      App.toast(`⚠️ Geração (${geracaoLiquida.toFixed(0)} kWh) excede consumo total (${consumoTotal.toFixed(0)} kWh). Ajuste a cota ou adicione clientes.`, 'warning');
    }

    // Remover rateios antigos do mês
    const antigos = await DB.getByIndex(DB.STORES.RATEIO, 'mes_ano', mes);
    for (const a of antigos) { await DB.remove(DB.STORES.RATEIO, a.id); }

    // Calcular e salvar rateio de cada cliente
    for (const item of consumos) {
      const c = item.cliente;
      const MINIMO = { monofasico: 30, bifasico: 50, trifasico: 100 };
      const minKwh = MINIMO[c.tipo_ligacao] || 30;

      const participacao = consumoTotal > 0 ? (item.consumo_kwh / consumoTotal) : 0;
      const energiaAlocada = Math.min(
        participacao * geracaoLiquida,
        item.consumo_kwh - minKwh  // nunca zerar consumo
      );
      const energiaAlocadaFinal = Math.max(0, energiaAlocada);

      const tarifa = item.consumo_kwh > 0 ? (item.conta_cmc / item.consumo_kwh) : 0;
      const cmc    = item.conta_cmc || 0;
      const cgd    = (item.consumo_kwh - energiaAlocadaFinal) * tarifa;
      const economiaBruta  = cmc - cgd;
      const contribuicao   = economiaBruta * 0.80;
      const economiaReal   = economiaBruta * (1 - margem);
      const economiaLiq    = economiaBruta - contribuicao;

      await DB.add(DB.STORES.RATEIO, {
        mes_ano:          mes,
        cliente_id:       c.id,
        nome_cliente:     c.nome,
        consumo_kwh:      item.consumo_kwh,
        consumo_total:    consumoTotal,
        participacao_pct: participacao * 100,
        geracao_usina:    geracaoLiquida,
        energia_alocada:  energiaAlocadaFinal,
        valor_conta_cmc:  cmc,
        valor_conta_cgd:  cgd,
        economia_bruta:   economiaBruta,
        contribuicao:     contribuicao,
        economia_real:    economiaReal,
        economia_liquida: economiaLiq,
      });
    }

    App.toast(`✅ Rateio de ${mes} processado para ${ativos.length} clientes!`, 'success');
    await render();
    // Atualizar financeiro se estiver visível
    if (typeof ModFinanceiro !== 'undefined') { ModFinanceiro.render(); }
  }

  async function _loadConfig() {
    const fp = await DB.getConfig('fator_perda');
    const ms = await DB.getConfig('margem_seguranca');
    return {
      fator_perda:      (fp && fp.valor !== undefined) ? fp.valor : 0.10,
      margem_seguranca: (ms && ms.valor !== undefined) ? ms.valor : 0.10,
    };
  }

  function _estimarTarifa(cliente) {
    // Tarifa estimada Ceará (ENEL): ~R$ 0,85-0,95/kWh
    return 0.90;
  }

  async function registrarConsumo() {
    const modal = document.getElementById('modal-consumo');
    // Popula select de clientes
    const clientes = await DB.getAll(DB.STORES.CLIENTES);
    const sel = document.getElementById('cons-cliente');
    sel.innerHTML = '<option value="">Selecione o cliente</option>' +
      clientes.filter(c => c.status === 'ativo').map(c =>
        `<option value="${c.id}">${c.nome}</option>`).join('');
    document.getElementById('cons-mes').value = _getMesAtual();
    modal.classList.add('open');
  }

  function fecharConsumo() {
    document.getElementById('modal-consumo').classList.remove('open');
  }

  async function salvarConsumo() {
    const cliId  = parseInt(document.getElementById('cons-cliente').value);
    const mes    = document.getElementById('cons-mes').value;
    const kwh    = parseFloat(document.getElementById('cons-kwh').value);
    const conta  = parseFloat(document.getElementById('cons-conta').value);

    if (!cliId || !mes || !kwh) {
      App.toast('Preencha todos os campos obrigatórios.', 'warning'); return;
    }

    // Verifica se já existe registro
    const existentes = await DB.getByIndex(DB.STORES.CONSUMO, 'cliente_id', cliId);
    const existente  = existentes.find(x => x.mes_ano === mes);

    if (existente) {
      existente.consumo_kwh = kwh;
      existente.valor_conta = conta;
      await DB.put(DB.STORES.CONSUMO, existente);
    } else {
      await DB.add(DB.STORES.CONSUMO, { cliente_id: cliId, mes_ano: mes, consumo_kwh: kwh, valor_conta: conta });
    }

    App.toast('Consumo registrado!', 'success');
    fecharConsumo();
  }

  return { render, processarMes, registrarConsumo, fecharConsumo, salvarConsumo };
})();

window.ModRateio = ModRateio;
