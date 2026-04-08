/**
 * IBIAPABA SOLAR - App Principal & Dashboard
 * Inicialização, navegação e dashboard com KPIs.
 */

const App = (() => {

  /* ── Estado ─────────────────────────────────────────────── */
  let _paginaAtual = 'dashboard';

  /* ── Formatadores ────────────────────────────────────────── */
  function moeda(val) {
    if (val === null || val === undefined || isNaN(val)) return 'R$ —';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /* ── Toast Notifications ─────────────────────────────────── */
  function toast(msg, tipo = 'info', duracao = 3500) {
    const cont = document.getElementById('toast-container');
    const el   = document.createElement('div');
    el.className = `toast ${tipo}`;
    const icones = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    el.innerHTML = `<span>${icones[tipo] || '•'}</span><span>${msg}</span>`;
    cont.appendChild(el);
    setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 300); }, duracao);
  }

  /* ── Navegação ───────────────────────────────────────────── */
  function navegar(pagina) {
    _paginaAtual = pagina;

    // Atualiza nav items
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === pagina);
    });

    // Mostra página
    document.querySelectorAll('.page').forEach(el => {
      el.classList.toggle('active', el.id === `page-${pagina}`);
    });

    // Atualiza topbar
    const titulos = {
      dashboard:  { t: '🏠 Dashboard', s: 'Visão geral do sistema' },
      clientes:   { t: '👥 Clientes',  s: 'Gestão de associados' },
      usina:      { t: '⚡ Usina',     s: 'Geração e performance' },
      rateio:     { t: '⚖️ Rateio',   s: 'Distribuição inteligente de créditos' },
      simulador:  { t: '🧮 Simulador', s: 'Simulação profissional de economia' },
      financeiro: { t: '💰 Financeiro',s: 'Receitas e projeções' },
      backup:     { t: '🔒 Backup',    s: 'Exportação, importação e configurações' },
    };
    const info = titulos[pagina] || { t: pagina, s: '' };
    document.getElementById('topbar-titulo').textContent  = info.t;
    document.getElementById('topbar-subtitulo').textContent = info.s;

    // Fecha sidebar mobile
    closeSidebar();

    // Renderiza módulo
    _renderPagina(pagina);
  }

  async function _renderPagina(pagina) {
    switch (pagina) {
      case 'dashboard':  renderDashboard(); break;
      case 'clientes':   ModClientes.render(); break;
      case 'usina':      ModUsina.render(); break;
      case 'rateio':     ModRateio.render(); break;
      case 'simulador':  ModSimulador.render(); break;
      case 'financeiro': ModFinanceiro.render(); break;
      case 'backup':     ModBackup.render(); break;
    }
  }

  /* ── DASHBOARD ───────────────────────────────────────────── */
  async function renderDashboard() {
    const clientes = await DB.getAll(DB.STORES.CLIENTES);
    const usina    = await DB.getAll(DB.STORES.USINA);
    const rateios  = await DB.getAll(DB.STORES.RATEIO);

    usina.sort((a, b) => b.mes_ano.localeCompare(a.mes_ano));
    const ultimaGer = usina[0];

    const totalClientes  = clientes.length;
    const ativos         = clientes.filter(c => c.status === 'ativo').length;
    const inadimplentes  = clientes.filter(c => c.status === 'inadimplente').length;

    const mesAtual = _getMesAtual();
    const rateioMes = rateios.filter(r => r.mes_ano === mesAtual);
    const receitaMes = rateioMes.reduce((s, r) => s + (r.contribuicao || 0), 0);
    const economiaTotal = rateioMes.reduce((s, r) => s + (r.economia_liquida || 0), 0);

    const geracaoMes   = ultimaGer ? ultimaGer.geracao_real : 0;
    const geracaoEst   = ultimaGer ? ultimaGer.geracao_estimada : 38000;
    const perf         = geracaoEst > 0 ? ((geracaoMes / geracaoEst) * 100).toFixed(1) : 0;

    // KPI Cards
    _setKPI('kpi-clientes',    totalClientes, `${ativos} ativos`);
    _setKPI('kpi-geracao',     `${geracaoMes.toLocaleString('pt-BR')} kWh`, `${perf}% performance`);
    _setKPI('kpi-receita',     moeda(receitaMes), 'mês atual');
    _setKPI('kpi-economia',    moeda(economiaTotal), 'clientes pouparam');

    // Alertas inteligentes
    _renderAlertas(clientes, ultimaGer, rateioMes, inadimplentes);

    // Últimos clientes
    const tbody = document.getElementById('dash-clientes-tbody');
    if (tbody) {
      const recentes = [...clientes].reverse().slice(0, 5);
      tbody.innerHTML = recentes.map(c => `<tr>
        <td class="td-name">${c.nome}</td>
        <td>${_tipoLabel(c.tipo_ligacao)}</td>
        <td>${(c.consumo_medio || 0).toLocaleString('pt-BR')} kWh</td>
        <td>${_statusBadge(c.status)}</td>
      </tr>`).join('') || `<tr><td colspan="4" class="text-center text-muted" style="padding:20px">Nenhum cliente ainda.</td></tr>`;
    }

    // Gráfico de geração
    _renderDashGrafico(usina.slice(0, 6).reverse());
  }

  function _setKPI(id, valor, sub) {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelector('.kpi-val').textContent = valor;
    el.querySelector('.kpi-lbl').textContent = sub;
  }

  function _renderAlertas(clientes, ultimaGer, rateioMes, inadimplentes) {
    const cont = document.getElementById('dash-alertas');
    if (!cont) return;
    const alertas = [];

    if (inadimplentes > 0) {
      alertas.push({ tipo: 'warning', msg: `⚠️ ${inadimplentes} cliente(s) inadimplente(s). Verifique o financeiro.` });
    }
    if (ultimaGer) {
      const perf = ultimaGer.geracao_estimada > 0
        ? (ultimaGer.geracao_real / ultimaGer.geracao_estimada * 100)
        : 100;
      if (perf < 80) {
        alertas.push({ tipo: 'warning', msg: `⚠️ Performance da usina baixa: ${perf.toFixed(1)}%. Verifique condições técnicas.` });
      }
    } else {
      alertas.push({ tipo: 'info', msg: 'ℹ️ Nenhuma geração registrada ainda. Acesse a aba Usina para começar.' });
    }
    if (rateioMes.length === 0) {
      alertas.push({ tipo: 'info', msg: `ℹ️ Rateio de ${_formatMesAtual()} ainda não processado.` });
    }
    if (alertas.length === 0) {
      alertas.push({ tipo: 'success', msg: '✅ Tudo em ordem! Sistema operando normalmente.' });
    }

    cont.innerHTML = alertas.map(a =>
      `<div class="alert alert-${a.tipo}"><span class="alert-icon"></span>${a.msg}</div>`
    ).join('');
  }

  function _renderDashGrafico(usina) {
    const cont = document.getElementById('dash-grafico');
    if (!cont || usina.length === 0) {
      if (cont) cont.innerHTML = `<div class="empty-state" style="padding:30px"><p>Sem dados de geração.</p></div>`;
      return;
    }

    const max = Math.max(...usina.map(r => Math.max(r.geracao_real || 0, r.geracao_estimada || 0)));
    cont.innerHTML = `<div class="bar-chart" style="height:140px">` +
      usina.map(r => {
        const hR = max > 0 ? (r.geracao_real / max * 100) : 0;
        const hE = max > 0 ? (r.geracao_estimada / max * 100) : 0;
        const mes = _formatMesAno(r.mes_ano);
        return `<div class="bar-wrap" style="gap:3px; height:100%; justify-content:flex-end">
          <div style="font-size:10px;color:var(--gray-400);text-align:center;margin-bottom:4px">${r.geracao_real.toLocaleString('pt-BR')}</div>
          <div style="display:flex;gap:2px;align-items:flex-end;flex:1">
            <div class="bar gray" style="height:${hE}%;flex:1" title="Estimado"></div>
            <div class="bar" style="height:${hR}%;flex:1" title="Real"></div>
          </div>
          <span class="bar-label" style="margin-top:4px">${mes.split('/')[0]}</span>
        </div>`;
      }).join('') + `</div>`;
  }

  /* ── Sidebar Mobile ──────────────────────────────────────── */
  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('show');
  }

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
  }

  /* ── DATA ────────────────────────────────────────────────── */
  function _getMesAtual() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function _formatMesAtual() {
    const [y, m] = _getMesAtual().split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${meses[parseInt(m) - 1]}/${y}`;
  }

  function _formatMesAno(mes_ano) {
    if (!mes_ano) return '—';
    const [y, m] = mes_ano.split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${meses[parseInt(m) - 1]}/${y}`;
  }

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

  /* ── INIT ────────────────────────────────────────────────── */
  async function init() {
    // Configura data no topbar
    document.getElementById('date-badge').textContent =
      new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

    // Inicializa banco e dados demo
    await DB.openDB();
    await DB.seedDemoData();

    // Inicializa módulo de tarifas ENEL-CE
    if (typeof Tarifas !== 'undefined') await Tarifas.init();

    // Configura navegação
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.addEventListener('click', () => navegar(el.dataset.page));
    });

    // Escuta estado de autenticação
    if (typeof DB.onAuthStateChange !== 'undefined') {
      DB.onAuthStateChange((user) => {
        if (user) {
          // Logado
          document.getElementById('login-overlay').style.display = 'none';
          navegar('dashboard');
        } else {
          // Deslogado
          document.getElementById('login-overlay').style.display = 'flex';
          toast('Faça login para acessar o sistema', 'info');
        }
      });

      // Checa sessão atual
      const user = await DB.getUser();
      if (!user) {
        document.getElementById('login-overlay').style.display = 'flex';
        return; // Não inicializa telas ainda
      }
    } else {
      // Fallback pra modo offline se DB.auth não existir
      navegar('dashboard');
    }
  }

  /* ── Autenticação ───────────────────────────────────────── */
  async function fazerLogin() {
    const rawUser = document.getElementById('login-email').value.trim();
    // Transforma o usuário num email válido para o Supabase caso não possua @
    const email = rawUser.includes('@') ? rawUser : `${rawUser}@ibiapaba.solar`;
    const senha = document.getElementById('login-senha').value;
    const btn = document.getElementById('btn-login');
    const errEl = document.getElementById('login-error');
    
    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Aguarde...';

    try {
      try {
        await DB.login(email, senha);
      } catch (err) {
        // Se der erro de credential, tentaremos registrar na surdina (ATENÇÃO: Apenas para facilitar 1º acesso no MVP)
        // O ideal é ter tela separada ou bloquear o cadastro público depois
        if (err.message && err.message.includes('Invalid login credentials')) {
            console.log('User not found or invalid pass, trying to register as new...');
            await DB.registrar(email, senha);
            // Ao registrar, dependendo do Supabase, ele já loga ou pede confirmação de e-mail.
            // Para não travar, avise o usuário
            toast('Usuário novo! Verifique seu email caso necessário ou tente logar novamente.', 'info');
        } else {
            throw err;
        }
      }
    } catch (e) {
      errEl.textContent = 'Erro ao entrar: ' + (e.message || 'Credenciais inválidas');
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = '🔒 Entrar';
    }
  }

  async function fazerLogout() {
    if (confirm('Deseja realmente sair do sistema?')) {
      try {
        await DB.logout();
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Backup automático a cada 30 minutos
  setInterval(async () => {
    const data = await DB.exportDB();
    localStorage.setItem('ibiapaba_autobackup', JSON.stringify({ ts: Date.now(), data }));
  }, 30 * 60 * 1000);

  return {
    init, navegar, toggleSidebar, closeSidebar,
    toast, moeda,
    fazerLogin, fazerLogout
  };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', App.init);
