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

  async function gerarBoletoMassa() {
    App.toast('Gerando boletos para o rateio do mês atual...', 'info');
    
    // Na vida real isto integraria com banco (ex: Asaas, Cora)
    // Aqui geramos um carnê visual em PDF para cobrança
    const mesAtual = _getMesAtual();
    const rateios  = _dados.rateios;
    
    if (rateios.length === 0) {
      App.toast('Nenhum rateio para gerar boletos neste mês.', 'warning');
      return;
    }
    
    const clientes = await DB.getAll(DB.STORES.CLIENTES);
    const container = document.getElementById('pdf-container');
    container.style.display = 'block';
    
    let html = rateios.map(r => {
       const cli = clientes.find(c => c.id === r.cliente_id) || {};
       return `
         <div style="font-family: monospace; border:1px solid #000; width:100%; margin-bottom:20px; page-break-inside: avoid;">
           <div style="border-bottom:2px solid #000; padding:10px; display:flex; justify-content:space-between; align-items:flex-end;">
             <h2 style="margin:0; font-size:20px;">001-9 | RECIBO DE PAGAMENTO / PIX</h2>
             <span style="font-size:12px;">VENCIMENTO: 10/${_formatMesAno(mesAtual)}</span>
           </div>
           
           <div style="display:flex; border-bottom:1px solid #000;">
             <div style="flex:3; border-right:1px solid #000; padding:4px 8px;">
               <span style="font-size:10px; color:#555;">Beneficiário</span><br>
               <strong>ASSOCIAÇÃO IBIAPABA SOLAR</strong>
             </div>
             <div style="flex:1; border-right:1px solid #000; padding:4px 8px;">
               <span style="font-size:10px; color:#555;">Documento</span><br>
               RAT-${mesAtual}-${r.cliente_id}
             </div>
             <div style="flex:1; padding:4px 8px; background:#f3f4f6; text-align:right;">
               <span style="font-size:10px; color:#555;">Valor Documento</span><br>
               <strong style="font-size:16px;">${App.moeda(r.contribuicao)}</strong>
             </div>
           </div>
           
           <div style="padding:4px 8px; border-bottom:1px solid #000;">
             <span style="font-size:10px; color:#555;">Pagador</span><br>
             ${r.nome_cliente}<br>
             CPF: ${cli.cpf || 'Não informado'}
           </div>
           
           <div style="padding:10px 8px; display:flex; justify-content:space-between;">
              <div style="font-size:12px; color:#333;">
                <p>Referente ao Rateio Solidário de Energia Solar.</p>
                <p>Energia Injetada: <b>${(r.energia_alocada || 0).toLocaleString('pt-BR')} kWh</b></p>
                <p>Chave PIX: <b>CNPJ 00.000.000/0001-00</b></p>
              </div>
              <div style="width:100px; height:100px; border:1px solid #ccc; display:flex; align-items:center; justify-content:center; font-size:10px; color:#999;">
                [ QR CODE PIX ]
              </div>
           </div>
           
           <div style="border-top:1px dashed #000; padding-top:10px; margin-top:20px; font-size:10px; text-align:center;">
             Corte Aqui -------------------------------------------------------------
           </div>
         </div>
       `;
    }).join('');
    
    container.innerHTML = html;
    
    const opt = { margin: 10, filename: `Boletos_${mesAtual}.pdf`, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
    try {
      await html2pdf().set(opt).from(container).save();
    } catch(e) { } finally { container.style.display = 'none'; container.innerHTML = ''; }
  }

  function _formatMesAno(mes_ano) {
    if (!mes_ano) return '—';
    const [y, m] = mes_ano.split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${meses[parseInt(m) - 1]}/${y}`;
  }

  return { render, abrirLanc, fecharLanc, salvarLanc, excluirLanc, gerarBoletoMassa };
})();

window.ModFinanceiro = ModFinanceiro;
