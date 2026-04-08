/**
 * IBIAPABA SOLAR - Módulo de Clientes
 * Cadastro, listagem, edição e exclusão de associados.
 */

const ModClientes = (() => {

  let _clientes = [];
  let _editId = null;
  let _searchTerm = '';

  /* ── Constantes de disponibilidade mínima ────────────────── */
  const MINIMO_KWH = { monofasico: 30, bifasico: 50, trifasico: 100 };

  /* ── Renderização principal ──────────────────────────────── */
  async function render() {
    _clientes = await DB.getAll(DB.STORES.CLIENTES);
    _renderStats();
    _renderTable();
  }

  function _renderStats() {
    const total    = _clientes.length;
    const ativos   = _clientes.filter(c => c.status === 'ativo').length;
    const inad     = _clientes.filter(c => c.status === 'inadimplente').length;
    const consumoT = _clientes.reduce((s, c) => s + (c.consumo_medio || 0), 0);

    document.getElementById('cli-total').textContent   = total;
    document.getElementById('cli-ativos').textContent  = ativos;
    document.getElementById('cli-inad').textContent    = inad;
    document.getElementById('cli-consumo').textContent = consumoT.toLocaleString('pt-BR') + ' kWh';
  }

  function _renderTable() {
    const tbody = document.getElementById('cli-tbody');
    const filtered = _clientes.filter(c =>
      !_searchTerm ||
      c.nome.toLowerCase().includes(_searchTerm) ||
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

    tbody.innerHTML = filtered.map(c => `
      <tr>
        <td class="td-name">${c.nome}</td>
        <td>${c.cpf || '—'}</td>
        <td>${_tipoLabel(c.tipo_ligacao)}</td>
        <td>${(c.consumo_medio || 0).toLocaleString('pt-BR')} kWh</td>
        <td>${c.cota_kwp || 0} kWp</td>
        <td>${_statusBadge(c.status)}</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-ghost btn-sm btn-icon" title="Ver histórico" onclick="ModClientes.verHistorico(${c.id})">📊</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Editar" onclick="ModClientes.abrirModal(${c.id})">✏️</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Excluir" onclick="ModClientes.excluir(${c.id}, '${c.nome.replace(/'/g,"\\'")}')">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
  }

  /* ── Modal de cadastro / edição ─────────────────────────── */
  async function abrirModal(id = null) {
    _editId = id;
    const modal = document.getElementById('modal-cliente');
    const form  = document.getElementById('form-cliente');
    form.reset();

    document.getElementById('modal-cliente-titulo').textContent =
      id ? '✏️ Editar Cliente' : '➕ Novo Cliente';

    if (id) {
      const c = await DB.getById(DB.STORES.CLIENTES, id);
      if (c) _preencherForm(c);
    }

    modal.classList.add('open');
  }

  function fecharModal() {
    document.getElementById('modal-cliente').classList.remove('open');
    _editId = null;
  }

  function _preencherForm(c) {
    const f = document.getElementById('form-cliente');
    f.elements['nome'].value          = c.nome || '';
    f.elements['cpf'].value           = c.cpf || '';
    f.elements['rg'].value            = c.rg || '';
    f.elements['telefone'].value      = c.telefone || '';
    f.elements['email'].value         = c.email || '';
    f.elements['endereco'].value      = c.endereco || '';
    f.elements['tipo_ligacao'].value  = c.tipo_ligacao || 'monofasico';
    f.elements['consumo_medio'].value = c.consumo_medio || '';
    f.elements['cota_kwp'].value      = c.cota_kwp || '';
    f.elements['status'].value        = c.status || 'ativo';
    f.elements['data_adesao'].value   = c.data_adesao || '';
    f.elements['observacoes'].value   = c.observacoes || '';
  }

  async function salvar() {
    const f = document.getElementById('form-cliente');
    const data = {
      nome:          f.elements['nome'].value.trim(),
      cpf:           f.elements['cpf'].value.trim(),
      rg:            f.elements['rg'].value.trim(),
      telefone:      f.elements['telefone'].value.trim(),
      email:         f.elements['email'].value.trim(),
      endereco:      f.elements['endereco'].value.trim(),
      tipo_ligacao:  f.elements['tipo_ligacao'].value,
      consumo_medio: parseFloat(f.elements['consumo_medio'].value) || 0,
      cota_kwp:      parseFloat(f.elements['cota_kwp'].value) || 0,
      status:        f.elements['status'].value,
      data_adesao:   f.elements['data_adesao'].value,
      observacoes:   f.elements['observacoes'].value.trim(),
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
    await DB.remove(DB.STORES.CLIENTES, id);
    App.toast('Cliente excluído.', 'success');
    await render();
  }

  /* ── Histórico de consumo ────────────────────────────────── */
  async function verHistorico(id) {
    const cliente  = await DB.getById(DB.STORES.CLIENTES, id);
    const consumos = await DB.getByIndex(DB.STORES.CONSUMO, 'cliente_id', id);
    const rateios  = await DB.getByIndex(DB.STORES.RATEIO, 'cliente_id', id);

    consumos.sort((a, b) => b.mes_ano.localeCompare(a.mes_ano));

    const modal = document.getElementById('modal-historico');
    document.getElementById('hist-nome').textContent = cliente.nome;
    document.getElementById('hist-tipo').textContent  = _tipoLabel(cliente.tipo_ligacao);
    document.getElementById('hist-cota').textContent  = `${cliente.cota_kwp || 0} kWp`;
    document.getElementById('hist-status').innerHTML  = _statusBadge(cliente.status);

    const tbody = document.getElementById('hist-tbody');
    if (consumos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:24px">Sem histórico registrado.</td></tr>`;
    } else {
      tbody.innerHTML = consumos.map(co => {
        const rateio = rateios.find(r => r.mes_ano === co.mes_ano);
        return `<tr>
          <td>${_formatMesAno(co.mes_ano)}</td>
          <td>${(co.consumo_kwh || 0).toLocaleString('pt-BR')} kWh</td>
          <td>${rateio ? (rateio.energia_alocada || 0).toLocaleString('pt-BR') + ' kWh' : '—'}</td>
          <td>${rateio ? App.moeda(rateio.valor_conta_cmc) : '—'}</td>
          <td>${rateio ? App.moeda(rateio.valor_conta_cgd) : '—'}</td>
          <td>${rateio ? `<span class="text-primary font-bold">${App.moeda(rateio.contribuicao)}</span>` : '—'}</td>
        </tr>`;
      }).join('');
    }

    modal.classList.add('open');
  }

  function fecharHistorico() {
    document.getElementById('modal-historico').classList.remove('open');
  }

  /* ── Search ──────────────────────────────────────────────── */
  function onSearch(val) {
    _searchTerm = val.toLowerCase();
    _renderTable();
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function _tipoLabel(t) {
    return { monofasico: 'Monofásico', bifasico: 'Bifásico', trifasico: 'Trifásico' }[t] || t;
  }

  function _statusBadge(s) {
    const map = {
      ativo: '<span class="badge badge-green">Ativo</span>',
      inativo: '<span class="badge badge-gray">Inativo</span>',
      inadimplente: '<span class="badge badge-red">Inadimplente</span>',
      pendente: '<span class="badge badge-yellow">Pendente</span>',
    };
    return map[s] || `<span class="badge badge-gray">${s}</span>`;
  }

  function _formatMesAno(mes_ano) {
    const [y, m] = mes_ano.split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${meses[parseInt(m)-1]}/${y}`;
  }

  function getClientes() { return _clientes; }

  return { render, abrirModal, fecharModal, salvar, excluir, verHistorico, fecharHistorico, onSearch, getClientes };
})();

window.ModClientes = ModClientes;
