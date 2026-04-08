/**
 * IBIAPABA SOLAR - Módulo de Clientes
 * Cadastro, listagem, edição, exclusão e histórico de associados.
 */

const ModClientes = (() => {

  let _clientes = [];
  let _editId = null;
  let _searchTerm = '';

  const MINIMO_KWH = { monofasico: 30, bifasico: 50, trifasico: 100 };

  /* ── Renderização principal ──────────────────────────────── */
  async function render() {
    try {
      _clientes = await DB.getAll(DB.STORES.CLIENTES);
    } catch (e) {
      console.error('Erro ao carregar clientes:', e);
      _clientes = [];
    }
    _renderStats();
    _renderTable();
  }

  function _renderStats() {
    const total    = _clientes.length;
    const ativos   = _clientes.filter(c => c.status === 'ativo').length;
    const inad     = _clientes.filter(c => c.status === 'inadimplente').length;
    const consumoT = _clientes.reduce((s, c) => s + (c.consumo_medio || 0), 0);

    const elTotal = document.getElementById('cli-total');
    const elAtivos = document.getElementById('cli-ativos');
    const elInad = document.getElementById('cli-inad');
    const elConsumo = document.getElementById('cli-consumo');

    if (elTotal) elTotal.textContent = total;
    if (elAtivos) elAtivos.textContent = ativos;
    if (elInad) elInad.textContent = inad;
    if (elConsumo) elConsumo.textContent = consumoT.toLocaleString('pt-BR') + ' kWh';
  }

  function _renderTable() {
    const tbody = document.getElementById('cli-tbody');
    if (!tbody) return;

    const filtered = _clientes.filter(c =>
      !_searchTerm ||
      (c.nome || '').toLowerCase().includes(_searchTerm) ||
      (c.cpf || '').includes(_searchTerm) ||
      (c.email || '').toLowerCase().includes(_searchTerm)
    );

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <h3>${_searchTerm ? 'Nenhum resultado encontrado' : 'Nenhum cliente cadastrado'}</h3>
          <p>${_searchTerm ? 'Tente outro termo de busca.' : 'Clique em "+ Novo Cliente" para começar.'}</p>
        </div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const nomeEscaped = (c.nome || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `
      <tr>
        <td class="td-name">${c.nome || '—'}</td>
        <td>${c.cpf || '—'}</td>
        <td>${_tipoLabel(c.tipo_ligacao)}</td>
        <td>${(c.consumo_medio || 0).toLocaleString('pt-BR')} kWh</td>
        <td>${c.cota_kwp || 0} kWp</td>
        <td>${_statusBadge(c.status)}</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-ghost btn-sm btn-icon" title="Ver histórico" onclick="ModClientes.verHistorico(${c.id})">📊</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Gerar Recibo" onclick="ModClientes.gerarRecibo(${c.id})">🧾</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Editar" onclick="ModClientes.abrirModal(${c.id})">✏️</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Excluir" onclick="ModClientes.excluir(${c.id}, '${nomeEscaped}')">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  /* ── Modal de cadastro / edição ─────────────────────────── */
  async function abrirModal(id = null) {
    _editId = id;
    const modal = document.getElementById('modal-cliente');
    const form  = document.getElementById('form-cliente');
    if (!modal || !form) return;
    form.reset();

    document.getElementById('modal-cliente-titulo').textContent =
      id ? '✏️ Editar Cliente' : '➕ Novo Cliente';

    if (id) {
      try {
        const c = await DB.getById(DB.STORES.CLIENTES, id);
        if (c) _preencherForm(c);
      } catch (e) {
        console.error('Erro ao buscar cliente:', e);
        App.toast('Erro ao buscar dados do cliente.', 'error');
      }
    }

    modal.classList.add('open');
  }

  function fecharModal() {
    const modal = document.getElementById('modal-cliente');
    if (modal) modal.classList.remove('open');
    _editId = null;
  }

  function _preencherForm(c) {
    const f = document.getElementById('form-cliente');
    if (!f) return;
    if (f.elements['nome']) f.elements['nome'].value = c.nome || '';
    if (f.elements['cpf']) f.elements['cpf'].value = c.cpf || '';
    if (f.elements['telefone']) f.elements['telefone'].value = c.telefone || '';
    if (f.elements['email']) f.elements['email'].value = c.email || '';
    if (f.elements['tipo_ligacao']) f.elements['tipo_ligacao'].value = c.tipo_ligacao || 'monofasico';
    if (f.elements['consumo_medio']) f.elements['consumo_medio'].value = c.consumo_medio || '';
    if (f.elements['cota_kwp']) f.elements['cota_kwp'].value = c.cota_kwp || '';
    if (f.elements['status']) f.elements['status'].value = c.status || 'ativo';
  }

  async function salvar() {
    const f = document.getElementById('form-cliente');
    if (!f) return;

    const data = {
      nome:          (f.elements['nome']?.value || '').trim(),
      cpf:           (f.elements['cpf']?.value || '').trim() || null,
      telefone:      (f.elements['telefone']?.value || '').trim(),
      email:         (f.elements['email']?.value || '').trim(),
      tipo_ligacao:  f.elements['tipo_ligacao']?.value || 'monofasico',
      consumo_medio: parseFloat(f.elements['consumo_medio']?.value) || 0,
      cota_kwp:      parseFloat(f.elements['cota_kwp']?.value) || 0,
      status:        f.elements['status']?.value || 'ativo'
    };

    if (!data.nome) { App.toast('Nome é obrigatório.', 'error'); return; }
    if (data.consumo_medio < MINIMO_KWH[data.tipo_ligacao]) {
      App.toast(`Consumo mínimo para ${_tipoLabel(data.tipo_ligacao)}: ${MINIMO_KWH[data.tipo_ligacao]} kWh`, 'warning');
      return;
    }

    try {
      if (_editId) {
        data.id = _editId;
        await DB.put(DB.STORES.CLIENTES, data);
        App.toast('Cliente atualizado com sucesso!', 'success');
      } else {
        await DB.add(DB.STORES.CLIENTES, data);
        App.toast('Cliente cadastrado com sucesso!', 'success');
      }
      fecharModal();
      await render();
    } catch (err) {
      if (err.name === 'ConstraintError') {
        App.toast('CPF já cadastrado no sistema.', 'error');
      } else {
        App.toast('Erro ao salvar: ' + err.message, 'error');
      }
    }
  }

  async function excluir(id, nome) {
    if (!confirm(`Excluir o cliente "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await DB.remove(DB.STORES.CLIENTES, id);
      App.toast('Cliente excluído.', 'success');
      await render();
    } catch (e) {
      App.toast('Erro ao excluir: ' + e.message, 'error');
    }
  }

  /* ── Histórico de consumo ────────────────────────────────── */
  async function verHistorico(id) {
    try {
      const cliente  = await DB.getById(DB.STORES.CLIENTES, id);
      if (!cliente) { App.toast('Cliente não encontrado.', 'error'); return; }

      const consumos = await DB.getByIndex(DB.STORES.CONSUMO, 'cliente_id', id);
      const rateios  = await DB.getByIndex(DB.STORES.RATEIO, 'cliente_id', id);

      consumos.sort((a, b) => (b.mes_ano || '').localeCompare(a.mes_ano || ''));

      const modal = document.getElementById('modal-historico');
      if (!modal) return;

      document.getElementById('hist-nome').textContent = cliente.nome;
      document.getElementById('hist-tipo').textContent  = _tipoLabel(cliente.tipo_ligacao);
      document.getElementById('hist-cota').textContent  = `${cliente.cota_kwp || 0} kWp`;
      document.getElementById('hist-status').innerHTML  = _statusBadge(cliente.status);

      const tbody = document.getElementById('hist-tbody');
      if (consumos.length === 0 && rateios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:24px">Sem histórico registrado. Registre o consumo mensal na aba Rateio.</td></tr>`;
      } else {
        // Combina os dados: usa consumos ou rateios como fonte
        const meses = [...new Set([...consumos.map(c => c.mes_ano), ...rateios.map(r => r.mes_ano)])].sort().reverse();
        tbody.innerHTML = meses.map(mes => {
          const co = consumos.find(c => c.mes_ano === mes);
          const rat = rateios.find(r => r.mes_ano === mes);
          return `<tr>
            <td>${_formatMesAno(mes)}</td>
            <td>${co ? (co.consumo_kwh || 0).toLocaleString('pt-BR') + ' kWh' : (rat ? (rat.consumo_kwh || 0).toLocaleString('pt-BR') + ' kWh' : '—')}</td>
            <td>${rat ? (rat.energia_alocada || 0).toLocaleString('pt-BR') + ' kWh' : '—'}</td>
            <td>${rat ? App.moeda(rat.valor_conta_cmc) : '—'}</td>
            <td>${rat ? App.moeda(rat.valor_conta_cgd) : '—'}</td>
            <td>${rat ? `<span class="text-primary font-bold">${App.moeda(rat.contribuicao)}</span>` : '—'}</td>
          </tr>`;
        }).join('');
      }

      modal.classList.add('open');
    } catch (e) {
      console.error('Erro verHistorico:', e);
      App.toast('Erro ao carregar histórico.', 'error');
    }
  }

  function fecharHistorico() {
    const modal = document.getElementById('modal-historico');
    if (modal) modal.classList.remove('open');
  }

  /* ── Gerar Recibo Individual ──────────────────────────── */
  async function gerarRecibo(id) {
    if (typeof html2pdf === 'undefined') { App.toast('Biblioteca PDF não carregada.', 'error'); return; }

    const cliente = await DB.getById(DB.STORES.CLIENTES, id);
    if (!cliente) { App.toast('Cliente não encontrado.', 'error'); return; }

    // Buscar último rateio
    const rateios = await DB.getByIndex(DB.STORES.RATEIO, 'cliente_id', id);
    rateios.sort((a, b) => (b.mes_ano || '').localeCompare(a.mes_ano || ''));
    const ultimo = rateios[0];

    if (!ultimo) { App.toast('Sem rateio processado para gerar recibo.', 'warning'); return; }

    App.toast('Gerando recibo...', 'info');

    const container = document.getElementById('pdf-container');
    container.style.display = 'block';
    container.innerHTML = `
      <div style="font-family: 'Inter', sans-serif; color: #1f2937; padding:20px;">
        <div style="text-align:center; border-bottom:2px solid #16a34a; padding-bottom:16px; margin-bottom:20px;">
          <h1 style="color:#16a34a; margin:0; font-size:24px;">☀️ RECIBO DE CONTRIBUIÇÃO</h1>
          <p style="color:#6b7280; margin:4px 0 0; font-size:12px;">Associação Ibiapaba Solar · Lei 14.300/2022</p>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:14px;">
          <tr style="background:#f9fafb;">
            <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Associado:</strong></td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${cliente.nome}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #e5e7eb;"><strong>CPF:</strong></td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${cliente.cpf || '—'}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Referência:</strong></td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${_formatMesAno(ultimo.mes_ano)}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Consumo:</strong></td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${(ultimo.consumo_kwh || 0).toLocaleString('pt-BR')} kWh</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Energia Alocada (GD):</strong></td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${(ultimo.energia_alocada || 0).toLocaleString('pt-BR')} kWh</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Conta s/ Solar (Cmc):</strong></td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${App.moeda(ultimo.valor_conta_cmc)}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="padding:8px; border:1px solid #e5e7eb;"><strong>Conta c/ Solar (Cgd):</strong></td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${App.moeda(ultimo.valor_conta_cgd)}</td>
          </tr>
        </table>

        <div style="background:#dcfce7; padding:16px; border-radius:8px; text-align:center; margin-bottom:20px;">
          <div style="font-size:12px; color:#166534; text-transform:uppercase; margin-bottom:4px;">Valor da Contribuição Mensal</div>
          <div style="font-size:28px; font-weight:900; color:#15803d;">${App.moeda(ultimo.contribuicao)}</div>
          <div style="font-size:12px; color:#166534; margin-top:4px;">Economia gerada para o associado: ${App.moeda(ultimo.economia_liquida)}</div>
        </div>

        <div style="margin-top:40px; display:flex; justify-content:space-between;">
          <div style="text-align:center; flex:1;">
            <div style="border-top:1px solid #000; width:200px; margin:0 auto; padding-top:8px;">
              ${cliente.nome}<br><small>Associado(a)</small>
            </div>
          </div>
          <div style="text-align:center; flex:1;">
            <div style="border-top:1px solid #000; width:200px; margin:0 auto; padding-top:8px;">
              Associação Ibiapaba Solar<br><small>Responsável</small>
            </div>
          </div>
        </div>

        <div style="text-align:center; margin-top:20px; font-size:10px; color:#9ca3af;">
          Emitido em ${new Date().toLocaleDateString('pt-BR')} · Sistema Ibiapaba Solar
        </div>
      </div>
    `;

    const opt = { margin: 10, filename: `Recibo_${(cliente.nome || 'cliente').replace(/\s+/g, '_')}_${ultimo.mes_ano}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
    try {
      await html2pdf().set(opt).from(container).save();
      App.toast('Recibo gerado!', 'success');
    } catch (e) { App.toast('Erro ao gerar recibo.', 'error'); }
    finally { container.style.display = 'none'; container.innerHTML = ''; }
  }

  /* ── Search ──────────────────────────────────────────────── */
  function onSearch(val) {
    _searchTerm = (val || '').toLowerCase();
    _renderTable();
  }

  /* ── Abertura customizada para o CRM ────────────────────── */
  async function abrirModalComDados(dados) {
    await abrirModal();
    const f = document.getElementById('form-cliente');
    if (!f) return;
    if (f.elements['consumo_medio']) f.elements['consumo_medio'].value = dados.consumo_medio || '';
    if (f.elements['tipo_ligacao']) f.elements['tipo_ligacao'].value = dados.tipo_ligacao || 'monofasico';
    if (f.elements['cota_kwp']) f.elements['cota_kwp'].value = dados.cota_kwp || '';
    App.toast('✅ Simulação transferida! Complete os dados do cliente.', 'info');
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function _tipoLabel(t) {
    return { monofasico: 'Monofásico', bifasico: 'Bifásico', trifasico: 'Trifásico' }[t] || (t || '—');
  }

  function _statusBadge(s) {
    const map = {
      ativo: '<span class="badge badge-green">Ativo</span>',
      inativo: '<span class="badge badge-gray">Inativo</span>',
      inadimplente: '<span class="badge badge-red">Inadimplente</span>',
      pendente: '<span class="badge badge-yellow">Pendente</span>',
    };
    return map[s] || `<span class="badge badge-gray">${s || '—'}</span>`;
  }

  function _formatMesAno(mes_ano) {
    if (!mes_ano) return '—';
    const [y, m] = mes_ano.split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${meses[parseInt(m)-1]}/${y}`;
  }

  function getClientes() { return _clientes; }

  return { render, abrirModal, fecharModal, salvar, excluir, verHistorico, fecharHistorico, onSearch, getClientes, abrirModalComDados, gerarRecibo };
})();

window.ModClientes = ModClientes;
