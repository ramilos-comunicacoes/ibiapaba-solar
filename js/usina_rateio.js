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
        document.getElementById('ger-irrad').value     = r.irradiacao || '';
        document.getElementById('ger-obs').value       = r.observacoes || '';
        document.getElementById('ger-leitura-ant').value = r.leitura_ant || '';
        document.getElementById('ger-leitura-atu').value = r.leitura_atu || '';
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
    const ant  = parseFloat(document.getElementById('ger-leitura-ant').value);
    const atu  = parseFloat(document.getElementById('ger-leitura-atu').value);

    if (!mes || !real || real <= 0) {
      App.toast('Informe o mês e a geração real.', 'warning'); return;
    }

    const data = { 
       mes_ano: mes, 
       geracao_real: real, 
       geracao_estimada: est || 38000, 
       irradiacao: irr || null, 
       observacoes: obs,
       leitura_ant: isNaN(ant) ? null : ant,
       leitura_atu: isNaN(atu) ? null : atu
    };

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

  function calcLeitura() {
     const ant = parseFloat(document.getElementById('ger-leitura-ant').value);
     const atu = parseFloat(document.getElementById('ger-leitura-atu').value);
     if(!isNaN(ant) && !isNaN(atu) && atu >= ant) {
         document.getElementById('ger-real').value = atu - ant;
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
    if(!mes_ano) return '—';
    const [y, m] = mes_ano.split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${meses[parseInt(m)-1]}/${y}`;
  }

  return { render, abrirModal, fecharModal, salvar, editar, excluir, getUltimaGeracao, getRegistros, calcLeitura };
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

    // Total das cotas em kWp dos associados ativos
    const cotaTotal = ativos.reduce((s, c) => s + (parseFloat(c.cota_kwp) || 0), 0);

    // Consumo de cada cliente no mês
    const consumos = [];
    for (const c of ativos) {
      // Tenta buscar o consumo do mês específico
      const mesConsumos = await DB.getByIndex(DB.STORES.CONSUMO, 'cliente_id', c.id);
      const mesReg = mesConsumos.find(x => x.mes_ano === mes);
      consumos.push({
        cliente: c,
        consumo_kwh: mesReg ? parseFloat(mesReg.consumo_kwh) : (parseFloat(c.consumo_medio) || 0),
        conta_cmc:   mesReg ? parseFloat(mesReg.valor_conta)  : ((parseFloat(c.consumo_medio) || 0) * parseFloat(_estimarTarifa(c) || 0)),
      });
    }

    const consumoTotal = consumos.reduce((s, x) => s + x.consumo_kwh, 0);
    if (consumoTotal === 0 && cotaTotal === 0) { App.toast('Consumo e Cotas Inexistentes.', 'error'); return; }

    // Remover rateios antigos do mês
    const antigos = await DB.getByIndex(DB.STORES.RATEIO, 'mes_ano', mes);
    for (const a of antigos) { await DB.remove(DB.STORES.RATEIO, a.id); }

    // Calcular e salvar rateio de cada cliente
    for (const item of consumos) {
      const c = item.cliente;
      const MINIMO = { monofasico: 30, bifasico: 50, trifasico: 100 };
      const minKwh = MINIMO[c.tipo_ligacao] || 30;

      // RATEIO LUMI INSPIRATION: Rateio feito baseado na Cota KWP do cliente
      const participacao = cotaTotal > 0 ? (parseFloat(c.cota_kwp || 0) / cotaTotal) : (consumoTotal > 0 ? (item.consumo_kwh / consumoTotal) : 0);
      const energiaAlocada = Math.min(
        participacao * geracaoLiquida,
        item.consumo_kwh - minKwh  // nunca zerar consumo abaixo do mínimo
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
    // Usa módulo Tarifas ENEL-CE se disponível
    if (typeof Tarifas !== 'undefined') {
      const res = Tarifas.calcularConta(
        cliente.consumo_medio || 300,
        cliente.tipo_ligacao || 'monofasico',
        Tarifas.getMunicipioDetectado(),
        Tarifas.getBandeira()
      );
      const kwh = Math.max(cliente.consumo_medio || 300, Tarifas.getMinimo(cliente.tipo_ligacao));
      return res.total / kwh;
    }
    return 0.90; // fallback
  }

  /* ── Auto-cálculo da conta via Tarifas ENEL-CE ─────────── */
  let _clientes_cache = [];

  async function registrarConsumo() {
    const modal = document.getElementById('modal-consumo');
    _clientes_cache = await DB.getAll(DB.STORES.CLIENTES);
    const sel = document.getElementById('cons-cliente');
    sel.innerHTML = '<option value="">Selecione o cliente</option>' +
      _clientes_cache.filter(c => c.status === 'ativo').map(c =>
        `<option value="${c.id}" data-tipo="${c.tipo_ligacao}">${c.nome}</option>`).join('');

    document.getElementById('cons-mes').value = _getMesAtual();
    document.getElementById('cons-kwh').value = '';
    document.getElementById('cons-conta').value = '';
    document.getElementById('cons-detalhes').innerHTML = '';
    document.getElementById('cons-auto-badge').style.display = 'none';
    document.getElementById('cons-local-status').textContent = 'CIP calculada por município';

    // Restaura bandeira salva
    const bandEl = document.getElementById('cons-bandeira');
    if (bandEl && typeof Tarifas !== 'undefined') bandEl.value = Tarifas.getBandeira();

    // Restaura município detectado
    const munEl = document.getElementById('cons-municipio');
    if (munEl && typeof Tarifas !== 'undefined' && Tarifas.getMunicipioDetectado()) {
      munEl.value = Tarifas.getMunicipioDetectado();
      document.getElementById('cons-local-status').textContent =
        `📍 ${Tarifas.getMunicipioDetectado()} – CIP: R$ ${Tarifas.getCIP(Tarifas.getMunicipioDetectado()).toFixed(2)}/mês`;
    }

    modal.classList.add('open');
  }

  function autoCalcularConta() {
    if (typeof Tarifas === 'undefined') return;
    const kwh     = parseFloat(document.getElementById('cons-kwh').value);
    const cliId   = parseInt(document.getElementById('cons-cliente').value);
    const bandeira = document.getElementById('cons-bandeira')?.value || 'verde';
    const municipio = document.getElementById('cons-municipio')?.value || '';

    if (!kwh || kwh <= 0) {
      document.getElementById('cons-conta').value = '';
      document.getElementById('cons-detalhes').innerHTML = '';
      document.getElementById('cons-auto-badge').style.display = 'none';
      return;
    }

    // Detecta tipo de ligação do cliente selecionado
    const cli = _clientes_cache.find(c => c.id === cliId);
    const tipo = cli?.tipo_ligacao || 'monofasico';

    const result = Tarifas.calcularConta(kwh, tipo, municipio || Tarifas.getMunicipioDetectado(), bandeira);
    document.getElementById('cons-conta').value = result.total.toFixed(2);
    document.getElementById('cons-auto-badge').style.display = 'inline';
    Tarifas.renderDetalhesConta(result, 'cons-detalhes');
  }

  function onClienteChange() {
    autoCalcularConta(); // recalcula quando muda o cliente (muda tipo de ligação)
  }

  function onBandeiraChange(val) {
    if (typeof Tarifas !== 'undefined') Tarifas.setBandeira(val);
    autoCalcularConta();
  }

  function onMunicipioChange() {
    const mun = document.getElementById('cons-municipio')?.value || '';
    if (typeof Tarifas !== 'undefined') {
      Tarifas.setMunicipio(mun || null);
      if (mun) {
        const cip = Tarifas.getCIP(mun);
        document.getElementById('cons-local-status').textContent =
          `📍 ${mun} – CIP estimada: R$ ${cip.toFixed(2)}/mês`;
      }
    }
    autoCalcularConta();
  }

  function detectarLocal() {
    const statusEl = document.getElementById('cons-local-status');
    statusEl.textContent = '📡 Detectando localização...';
    if (typeof Tarifas === 'undefined') { statusEl.textContent = 'Módulo de tarifas não carregado.'; return; }

    Tarifas.detectarMunicipio(
      (municipio) => {
        document.getElementById('cons-municipio').value = municipio;
        const cip = Tarifas.getCIP(municipio);
        statusEl.textContent = `✅ ${municipio} detectado – CIP: R$ ${cip.toFixed(2)}/mês`;
        autoCalcularConta();
      },
      (erro) => {
        statusEl.textContent = `⚠️ ${erro} – insira o município manualmente.`;
      }
    );
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

    const existentes = await DB.getByIndex(DB.STORES.CONSUMO, 'cliente_id', cliId);
    const existente  = existentes.find(x => x.mes_ano === mes);

    if (existente) {
      existente.consumo_kwh = kwh;
      existente.valor_conta = conta;
      await DB.put(DB.STORES.CONSUMO, existente);
    } else {
      await DB.add(DB.STORES.CONSUMO, { cliente_id: cliId, mes_ano: mes, consumo_kwh: kwh, valor_conta: conta });
    }

    App.toast('✅ Consumo registrado com tarifa ENEL-CE!', 'success');
    fecharConsumo();
  }

  async function gerarRelatorioPDF() {
    if (_rateios.length === 0) { App.toast('Sem dados para relatório neste mês.', 'warning'); return; }
    if (typeof html2pdf === 'undefined') { App.toast('Lib PDF não carregada.', 'error'); return; }

    App.toast('Gerando Relatório...', 'info');
    const container = document.getElementById('pdf-container');
    container.style.display = 'block';

    const totalGer = _rateios.reduce((s, r) => s + (r.energia_alocada || 0), 0);
    const totalEco = _rateios.reduce((s, r) => s + (r.economia_liquida || 0), 0);
    const totalCont = _rateios.reduce((s, r) => s + (r.contribuicao || 0), 0);

    let html = `
      <div style="font-family: 'Inter', sans-serif; color: #1f2937; padding:20px;">
        <div style="text-align:center; border-bottom:2px solid #16a34a; padding-bottom:16px; margin-bottom:20px;">
          <h1 style="color:#16a34a; margin:0; font-size:24px;">📊 RELATÓRIO DE RATEIO - ${_formatMesAno(_mesAtual)}</h1>
          <p style="color:#6b7280; margin:4px 0 0; font-size:12px;">Associação Ibiapaba Solar</p>
        </div>
        
        <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
           <div style="background:#f3f4f6; padding:10px; border-radius:6px; flex:1; margin-right:10px; text-align:center;">
             <div style="font-size:10px; color:#6b7280;">ENERGIA ALOCADA</div>
             <div style="font-size:16px; font-weight:bold;">${totalGer.toLocaleString('pt-BR')} kWh</div>
           </div>
           <div style="background:#f0fdf4; padding:10px; border-radius:6px; flex:1; margin-right:10px; text-align:center;">
             <div style="font-size:10px; color:#166534;">ECONOMIA CLIENTES</div>
             <div style="font-size:16px; font-weight:bold; color:#15803d;">${App.moeda(totalEco)}</div>
           </div>
           <div style="background:#fefce8; padding:10px; border-radius:6px; flex:1; text-align:center;">
             <div style="font-size:10px; color:#a16207;">CONTRIBUIÇÃO TOTAL</div>
             <div style="font-size:16px; font-weight:bold; color:#854d0e;">${App.moeda(totalCont)}</div>
           </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:10px; text-align:left;">
          <thead>
            <tr style="background:#16a34a; color:#fff;">
              <th style="padding:6px;">Cliente</th>
              <th style="padding:6px;">Cons.</th>
              <th style="padding:6px;">Particip.</th>
              <th style="padding:6px;">En. Alocada</th>
              <th style="padding:6px;">Cmc</th>
              <th style="padding:6px;">Cgd</th>
              <th style="padding:6px;">Contribuição</th>
            </tr>
          </thead>
          <tbody>
            ${_rateios.map((r, i) => `
              <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">
                <td style="padding:6px; border-bottom:1px solid #e5e7eb;">${r.nome_cliente || '—'}</td>
                <td style="padding:6px; border-bottom:1px solid #e5e7eb;">${(r.consumo_kwh || 0).toLocaleString('pt-BR')}</td>
                <td style="padding:6px; border-bottom:1px solid #e5e7eb;">${(r.participacao_pct || 0).toFixed(1)}%</td>
                <td style="padding:6px; border-bottom:1px solid #e5e7eb;">${(r.energia_alocada || 0).toLocaleString('pt-BR')}</td>
                <td style="padding:6px; border-bottom:1px solid #e5e7eb;">${App.moeda(r.valor_conta_cmc)}</td>
                <td style="padding:6px; border-bottom:1px solid #e5e7eb;">${App.moeda(r.valor_conta_cgd)}</td>
                <td style="padding:6px; border-bottom:1px solid #e5e7eb; font-weight:bold; color:#dc2626;">${App.moeda(r.contribuicao)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="text-align:center; padding-top:20px; font-size:10px; color:#9ca3af;">
          Documento gerado em ${new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>
    `;

    container.innerHTML = html;
    const opt = { margin: 10, filename: `Rat_${_mesAtual}.pdf`, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
    try {
      await html2pdf().set(opt).from(container).save();
    } catch(e) { } finally { container.style.display = 'none'; container.innerHTML = ''; }
  }

  async function gerarRecibosLote() {
    if (_rateios.length === 0) { App.toast('Sem rateio processado para gerar recibos.', 'warning'); return; }
    if (typeof html2pdf === 'undefined') { App.toast('Lib PDF não carregada.', 'error'); return; }

    App.toast('Gerando Lote de Recibos...', 'info');
    const container = document.getElementById('pdf-container');
    container.style.display = 'block';
    
    const clientes = await DB.getAll(DB.STORES.CLIENTES);

    let html = _rateios.map((r, index) => {
      const cli = clientes.find(c => c.id === r.cliente_id) || {};
      return `
        <div style="font-family: 'Inter', sans-serif; color: #1f2937; padding:20px; ${index < _rateios.length - 1 ? 'page-break-after: always;' : ''}">
          <div style="text-align:center; border-bottom:2px solid #16a34a; padding-bottom:16px; margin-bottom:20px;">
            <h1 style="color:#16a34a; margin:0; font-size:24px;">☀️ RECIBO DE CONTRIBUIÇÃO</h1>
            <p style="color:#6b7280; margin:4px 0 0; font-size:12px;">Associação Ibiapaba Solar · Lei 14.300/2022</p>
          </div>

          <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:14px;">
            <tr style="background:#f9fafb;">
              <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Associado:</strong></td>
              <td style="padding:8px; border:1px solid #e5e7eb;">${r.nome_cliente || '—'}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #e5e7eb;"><strong>CPF:</strong></td>
              <td style="padding:8px; border:1px solid #e5e7eb;">${cli.cpf || '—'}</td>
            </tr>
            <tr style="background:#f9fafb;">
              <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Referência:</strong></td>
              <td style="padding:8px; border:1px solid #e5e7eb;">${_formatMesAno(_mesAtual)}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Consumo:</strong></td>
              <td style="padding:8px; border:1px solid #e5e7eb;">${(r.consumo_kwh || 0).toLocaleString('pt-BR')} kWh</td>
            </tr>
            <tr style="background:#f9fafb;">
              <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Energia Alocada (GD):</strong></td>
              <td style="padding:8px; border:1px solid #e5e7eb;">${(r.energia_alocada || 0).toLocaleString('pt-BR')} kWh</td>
            </tr>
          </table>

          <div style="background:#dcfce7; padding:16px; border-radius:8px; text-align:center; margin-bottom:20px;">
            <div style="font-size:12px; color:#166534; text-transform:uppercase; margin-bottom:4px;">Valor da Contribuição Mensal</div>
            <div style="font-size:28px; font-weight:900; color:#15803d;">${App.moeda(r.contribuicao)}</div>
            <div style="font-size:12px; color:#166534; margin-top:4px;">Economia gerada: ${App.moeda(r.economia_liquida)}</div>
          </div>

          <div style="margin-top:40px; display:flex; justify-content:space-between;">
            <div style="text-align:center; flex:1;">
              <div style="border-top:1px solid #000; width:200px; margin:0 auto; padding-top:8px;">
                Associado(a)
              </div>
            </div>
            <div style="text-align:center; flex:1;">
              <div style="border-top:1px solid #000; width:200px; margin:0 auto; padding-top:8px;">
                 Associação Ibiapaba Solar
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
    const opt = { margin: 10, filename: `Recibos_Lote_${_mesAtual}.pdf`, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
    try {
      await html2pdf().set(opt).from(container).save();
    } catch(e) { } finally { container.style.display = 'none'; container.innerHTML = ''; }
  }

  function _formatMesAno(mes_ano) {
    if(!mes_ano) return '—';
    const [y, m] = mes_ano.split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${meses[parseInt(m)-1]}/${y}`;
  }

  return { render, processarMes, registrarConsumo, fecharConsumo, salvarConsumo,
           autoCalcularConta, detectarLocal, onClienteChange, onBandeiraChange, 
           onMunicipioChange, gerarRelatorioPDF, gerarRecibosLote };
})();

window.ModRateio = ModRateio;
