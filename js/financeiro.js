/**
 * IBIAPABA SOLAR - Módulo Financeiro
 * Receitas, projeções e lançamentos baseados nas contribuições.
 */

const ModFinanceiro = (() => {

  let _dados = { receita: 0, rateios: [], lancamentos: [] };

  async function render() {
    const mesAtual = _getMesAtual();
    const rateios  = await DB.getByIndex(DB.STORES.RATEIO, 'mes_ano', mesAtual);
    const todos    = await DB.getAll(DB.STORES.RATEIO);
    const lancs    = await DB.getAll(DB.STORES.FINANCEIRO);
    lancs.sort((a, b) => b.data.localeCompare(a.data));

    _dados = { rateios, todos, lancamentos: lancs };
    _renderKPIs(mesAtual);
    _renderProjecao();
    _renderLancamentos(lancs);
  }

  function _getMesAtual() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function _renderKPIs(mesAtual) {
    const rateios = _dados.rateios;
    const todos   = _dados.todos;
    const receita = rateios.reduce((s, r) => s + (r.contribuicao || 0), 0);
    const economiaTotal = rateios.reduce((s, r) => s + (r.economia_liquida || 0), 0);
    const clientes = rateios.length;

    // Receita acumulada do ano
    const anoAtual = new Date().getFullYear().toString();
    const receitaAno = todos
      .filter(r => r.mes_ano && r.mes_ano.startsWith(anoAtual))
      .reduce((s, r) => s + (r.contribuicao || 0), 0);

    document.getElementById('fin-receita-mes').textContent  = App.moeda(receita);
    document.getElementById('fin-receita-ano').textContent  = App.moeda(receitaAno);
    document.getElementById('fin-eco-clientes').textContent = App.moeda(economiaTotal);
    document.getElementById('fin-clientes-mes').textContent = clientes;

    // Barra de progresso meta (ex: meta = R$ 20.000/mês)
    const meta = 20000;
    const pct  = Math.min((receita / meta) * 100, 100);
    const fill = document.getElementById('fin-meta-bar');
    if (fill) {
      fill.style.width = pct + '%';
      document.getElementById('fin-meta-pct').textContent = `${pct.toFixed(0)}% da meta`;
    }
  }

  function _renderProjecao() {
    const todos = _dados.todos;
    const meses = [...new Set(todos.map(r => r.mes_ano))].sort();
    const container = document.getElementById('fin-projecao');
    if (!container) return;

    if (meses.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📊</div>
        <h3>Sem dados de projeção</h3>
        <p>Processe o rateio de pelo menos um mês.</p>
      </div>`;
      return;
    }

    // Agrupa por mês
    const grouped = meses.map(mes => ({
      mes,
      receita:   todos.filter(r => r.mes_ano === mes).reduce((s, r) => s + (r.contribuicao || 0), 0),
      clientes:  todos.filter(r => r.mes_ano === mes).length,
      economia:  todos.filter(r => r.mes_ano === mes).reduce((s, r) => s + (r.economia_liquida || 0), 0),
    }));

    const maxRec = Math.max(...grouped.map(g => g.receita));

    container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Mês</th><th>Clientes</th><th>Receita</th><th>Economia Clientes</th><th>Proporção</th>
          </tr></thead>
          <tbody>${grouped.reverse().map(g => {
            const barra = maxRec > 0 ? (g.receita / maxRec * 100) : 0;
            return `<tr>
              <td>${_formatMesAno(g.mes)}</td>
              <td>${g.clientes}</td>
              <td class="font-bold text-primary">${App.moeda(g.receita)}</td>
              <td class="text-success">${App.moeda(g.economia)}</td>
              <td style="min-width:120px">
                <div class="progress-bar" style="height:6px">
                  <div class="progress-fill" style="width:${barra}%"></div>
                </div>
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  function _renderLancamentos(lancs) {
    const tbody = document.getElementById('fin-lanc-tbody');
    if (!tbody) return;

    if (lancs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:24px; text-align:center; color:var(--gray-400)">Nenhum lançamento registrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = lancs.slice(0, 20).map(l => `<tr>
      <td>${l.data ? new Date(l.data).toLocaleDateString('pt-BR') : '—'}</td>
      <td>${l.descricao || '—'}</td>
      <td><span class="badge ${l.tipo === 'receita' ? 'badge-green' : 'badge-red'}">${l.tipo === 'receita' ? 'Receita' : 'Despesa'}</span></td>
      <td class="${l.tipo === 'receita' ? 'text-primary' : 'text-danger'} font-bold">${App.moeda(l.valor)}</td>
      <td>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="ModFinanceiro.excluirLanc(${l.id})">🗑️</button>
      </td>
    </tr>`).join('');
  }

  /* ── Modal Lançamento ────────────────────────────────────── */
  function abrirLanc() {
    document.getElementById('modal-lancamento').classList.add('open');
    document.getElementById('lanc-data').value = new Date().toISOString().split('T')[0];
  }

  function fecharLanc() {
    document.getElementById('modal-lancamento').classList.remove('open');
  }

  async function salvarLanc() {
    const data  = document.getElementById('lanc-data').value;
    const desc  = document.getElementById('lanc-desc').value.trim();
    const tipo  = document.getElementById('lanc-tipo').value;
    const valor = parseFloat(document.getElementById('lanc-valor').value);

    if (!data || !desc || !tipo || !valor || valor <= 0) {
      App.toast('Preencha todos os campos.', 'warning'); return;
    }

    await DB.add(DB.STORES.FINANCEIRO, { data, descricao: desc, tipo, valor, mes_ano: data.substring(0, 7) });
    App.toast('Lançamento registrado!', 'success');
    fecharLanc();
    await render();
  }

  async function excluirLanc(id) {
    if (!confirm('Excluir este lançamento?')) return;
    await DB.remove(DB.STORES.FINANCEIRO, id);
    App.toast('Lançamento excluído.', 'success');
    await render();
  }

  function _formatMesAno(mes_ano) {
    const [y, m] = mes_ano.split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${meses[parseInt(m) - 1]}/${y}`;
  }

  return { render, abrirLanc, fecharLanc, salvarLanc, excluirLanc };
})();

window.ModFinanceiro = ModFinanceiro;
