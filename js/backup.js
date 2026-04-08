/**
 * IBIAPABA SOLAR - Módulo de Backup & Configurações
 * Exportação JSON, importação segura e configurações globais.
 */

const ModBackup = (() => {

  async function render() {
    const config = await _loadConfig();
    document.getElementById('cfg-fator-perda').value     = Math.round((config.fator_perda || 0.10) * 100);
    document.getElementById('cfg-margem').value          = Math.round((config.margem_seguranca || 0.10) * 100);
    document.getElementById('cfg-cap-usina').value       = config.capacidade_usina_kwp || 300;
    document.getElementById('cfg-ger-estimada').value    = config.geracao_media_estimada || 38000;
    _renderEstatisticas();
  }

  async function _loadConfig() {
    const fp  = await DB.getConfig('fator_perda');
    const ms  = await DB.getConfig('margem_seguranca');
    const cap = await DB.getConfig('capacidade_usina_kwp');
    const ger = await DB.getConfig('geracao_media_estimada');
    return {
      fator_perda:            (fp  && fp.valor  !== undefined) ? fp.valor  : 0.10,
      margem_seguranca:       (ms  && ms.valor  !== undefined) ? ms.valor  : 0.10,
      capacidade_usina_kwp:   (cap && cap.valor !== undefined) ? cap.valor : 300,
      geracao_media_estimada: (ger && ger.valor !== undefined) ? ger.valor : 38000,
    };
  }

  async function _renderEstatisticas() {
    const clientes  = await DB.getAll(DB.STORES.CLIENTES);
    const usina     = await DB.getAll(DB.STORES.USINA);
    const rateios   = await DB.getAll(DB.STORES.RATEIO);
    const fins      = await DB.getAll(DB.STORES.FINANCEIRO);
    const consumos  = await DB.getAll(DB.STORES.CONSUMO);

    document.getElementById('bk-qtd-clientes').textContent  = clientes.length;
    document.getElementById('bk-qtd-usina').textContent     = usina.length;
    document.getElementById('bk-qtd-rateios').textContent   = rateios.length;
    document.getElementById('bk-qtd-fin').textContent       = fins.length;
    document.getElementById('bk-qtd-consumos').textContent  = consumos.length;

    const totalReg = clientes.length + usina.length + rateios.length + fins.length + consumos.length;
    document.getElementById('bk-total-reg').textContent = totalReg;

    // Última atualização
    const todos = [...clientes, ...usina, ...rateios, ...fins, ...consumos];
    if (todos.length > 0) {
      const ultima = todos
        .map(x => x.updated_at || x.created_at)
        .filter(Boolean)
        .sort()
        .pop();
      document.getElementById('bk-ultima-at').textContent = ultima
        ? new Date(ultima).toLocaleString('pt-BR')
        : '—';
    }
  }

  /* ── EXPORTAÇÃO ─────────────────────────────────────────── */
  async function exportar() {
    try {
      App.toast('Exportando dados...', 'info');
      const data = await DB.exportDB();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const ts   = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      a.href     = url;
      a.download = `ibiapaba-solar-backup-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      App.toast('✅ Backup exportado com sucesso!', 'success');
    } catch (err) {
      App.toast('Erro ao exportar: ' + err.message, 'error');
    }
  }

  /* ── IMPORTAÇÃO ─────────────────────────────────────────── */
  function importar() {
    const input = document.getElementById('bk-import-file');
    input.click();
  }

  async function onImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);

        if (!data.meta || data.meta.sistema !== 'IBIAPABA SOLAR') {
          App.toast('Arquivo inválido. Use apenas backups do IBIAPABA SOLAR.', 'error');
          return;
        }

        const confirma = confirm(
          `Importar backup de ${new Date(data.meta.data).toLocaleString('pt-BR')}?\n\n` +
          `⚠️ ATENÇÃO: Os dados atuais serão substituídos. Esta ação não pode ser desfeita.\n\n` +
          `Clique em OK para confirmar.`
        );

        if (!confirma) return;

        App.toast('Importando dados...', 'info');
        await DB.importDB(data);
        App.toast('✅ Backup importado com sucesso! Recarregando...', 'success');
        setTimeout(() => location.reload(), 1500);
      } catch (err) {
        App.toast('Erro ao importar: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /* ── SALVAR CONFIGURAÇÕES ──────────────────────────────── */
  async function salvarConfig() {
    const fp   = parseInt(document.getElementById('cfg-fator-perda').value) / 100;
    const ms   = parseInt(document.getElementById('cfg-margem').value) / 100;
    const cap  = parseFloat(document.getElementById('cfg-cap-usina').value);
    const ger  = parseFloat(document.getElementById('cfg-ger-estimada').value);

    if (fp < 0.05 || fp > 0.20) { App.toast('Fator de perda deve estar entre 5% e 20%.', 'warning'); return; }
    if (ms < 0.05 || ms > 0.25) { App.toast('Margem de segurança deve estar entre 5% e 25%.', 'warning'); return; }
    if (cap <= 0)                { App.toast('Capacidade da usina inválida.', 'warning'); return; }
    if (ger <= 0)                { App.toast('Geração estimada inválida.', 'warning'); return; }

    await DB.setConfig('fator_perda',            fp);
    await DB.setConfig('margem_seguranca',       ms);
    await DB.setConfig('capacidade_usina_kwp',   cap);
    await DB.setConfig('geracao_media_estimada', ger);

    App.toast('✅ Configurações salvas!', 'success');
  }

  /* ── RESET (dados demo) ─────────────────────────────────── */
  async function resetDemo() {
    if (!confirm('Isso vai apagar TODOS os dados e carregar demonstração. Confirma?')) return;

    for (const store of Object.values(DB.STORES)) {
      await DB.clearStore(store);
    }
    await DB.seedDemoData();
    App.toast('Dados de demonstração carregados!', 'success');
    setTimeout(() => location.reload(), 1000);
  }

  return { render, exportar, importar, onImportFile, salvarConfig, resetDemo };
})();

window.ModBackup = ModBackup;
