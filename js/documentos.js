/**
 * IBIAPABA SOLAR - Módulo Gerador de Documentos
 * Gerencia a configuração e geração de Contratos e Propostas Comerciais 
 * usando html2pdf e variáveis pré-definidas ({{NOME}}, etc.).
 */

const ModDocumentos = (() => {

  const DEFAULT_PROPOSTA = `<h2>PROPOSTA COMERCIAL</h2>
<p><strong>Para:</strong> {{NOME}}</p>
<p><strong>CPF/CNPJ:</strong> {{CPF}}</p>
<hr>
<p>Prezado(a) Senhor(a),</p>
<p>A <strong>{{ASSOC_NOME}}</strong> apresenta esta proposta para a participação na associação de geração compartilhada, conforme a Lei nº 14.300/2022.</p>
<p><strong>Perfil de Consumo:</strong></p>
<ul>
  <li>Tipo de Ligação: {{TIPO_LIGACAO}}</li>
  <li>Consumo Médio Histórico: {{CONSUMO_MEDIO}} kWh/mês</li>
  <li>Cota Solicitada: {{COTA}} kWp</li>
</ul>
<br>
<p>Local: {{ASSOC_ENDERECO}}</p>
<p>Data: {{DATA_HOJE}}</p>
<p>Assinatura Responsável _______________</p>`;

  const DEFAULT_CONTRATO = `<h2>CONTRATO DE ASSOCIAÇÃO - GERAÇÃO DISTRIBUÍDA</h2>
<p>Pelo presente instrumento, a <strong>{{ASSOC_NOME}}</strong>, pessoa jurídica de direito privado, inscrita debaixo do CNPJ {{ASSOC_CNPJ}}, com sede em {{ASSOC_ENDERECO}}, neste ato aceita como associado(a):</p>
<p><strong>NOME:</strong> {{NOME}}<br>
<strong>CPF/CNPJ:</strong> {{CPF}}<br>
<strong>E-MAIL:</strong> {{EMAIL}}<br>
<strong>TELEFONE:</strong> {{TELEFONE}}</p>
<h3>CLÁUSULA PRIMEIRA - DO OBJETO</h3>
<p>O presente contrato tem como objeto formalizar a alocação de créditos de energia elétrica provenientes do excedente de geração na usina solar fotovoltaica gerida pela ASSOCIAÇÃO, estimando uma cota proporcional de <strong>{{COTA}} kWp</strong> para cobrir o consumo mensal de <strong>{{CONSUMO_MEDIO}} kWh</strong> para instalação do associado.</p>
<p>...</p>
<br><br><br>
<p style="text-align:center">_________________________________________<br>{{NOME}}<br>Associado(a)</p>
<p style="text-align:center">_________________________________________<br>{{ASSOC_NOME}}<br>Presidente</p>`;

  async function render() {
    _carregarClientes();
    await _carregarConfiguracoes();
  }

  function alternarAba(aba) {
    document.getElementById('doc-aba-gerar').style.display  = aba === 'gerar' ? 'block' : 'none';
    document.getElementById('doc-aba-editar').style.display = aba === 'editar' ? 'block' : 'none';
    
    document.getElementById('tab-btn-gerar').className  = aba === 'gerar' ? 'btn btn-primary' : 'btn btn-outline';
    document.getElementById('tab-btn-editar').className = aba === 'editar' ? 'btn btn-primary' : 'btn btn-outline';
  }

  async function _carregarClientes() {
    const sel = document.getElementById('doc-cliente-select');
    if (!sel) return;
    
    try {
      const clientes = await DB.getAll(DB.STORES.CLIENTES);
      sel.innerHTML = '<option value="">Selecione o Cliente associado...</option>' + 
        clientes.map(c => `<option value="${c.id}">${c.nome} (CPF: ${c.cpf || 'Sem CPF'})</option>`).join('');
    } catch(e) {
      sel.innerHTML = '<option value="">Erro ao carregar clientes</option>';
    }
  }

  async function _carregarConfiguracoes() {
    try {
      // Inputs da Associacao
      const assoc = await DB.getConfig('doc_assoc_dados') || {valor: {}};
      const dados = assoc.valor || {};
      
      const elNome = document.getElementById('doc-assoc-nome');
      const elCNPJ = document.getElementById('doc-assoc-cnpj');
      const elEnd  = document.getElementById('doc-assoc-endereco');
      
      if(elNome) elNome.value = dados.nome || 'Associação Ibiapaba Solar';
      if(elCNPJ) elCNPJ.value = dados.cnpj || '';
      if(elEnd)  elEnd.value  = dados.endereco || '';

      // Txt Areas
      const txtProp = await DB.getConfig('doc_proposta');
      const txtCont = await DB.getConfig('doc_contrato');
      
      const elTxtProp = document.getElementById('doc-texto-proposta');
      const elTxtCont = document.getElementById('doc-texto-contrato');
      
      if(elTxtProp) elTxtProp.value = txtProp ? txtProp.valor : DEFAULT_PROPOSTA;
      if(elTxtCont) elTxtCont.value = txtCont ? txtCont.valor : DEFAULT_CONTRATO;

    } catch(e) {
      console.error(e);
      App.toast('Erro ao carregar os modelos salvos.', 'error');
    }
  }

  async function salvarConfig() {
    const nome = document.getElementById('doc-assoc-nome').value;
    const cnpj = document.getElementById('doc-assoc-cnpj').value;
    const end  = document.getElementById('doc-assoc-endereco').value;
    
    const prop = document.getElementById('doc-texto-proposta').value;
    const cont = document.getElementById('doc-texto-contrato').value;

    try {
      await DB.setConfig('doc_assoc_dados', { nome, cnpj, endereco: end });
      await DB.setConfig('doc_proposta', prop);
      await DB.setConfig('doc_contrato', cont);
      
      App.toast('Associação e Textos Salvos!', 'success');
    } catch(e) {
      console.error(e);
      App.toast('Erro ao salvar as configurações', 'error');
    }
  }

  /* ── Gerador ────────────────────────────────────────────── */
  async function gerarDocumento() {
    const cliId = document.getElementById('doc-cliente-select').value;
    const tipo  = document.getElementById('doc-tipo').value;

    if (!cliId) {
      App.toast('Selecione um cliente primeiro!', 'warning');
      return;
    }

    if (typeof html2pdf === 'undefined') {
      App.toast('Biblioteca PDF não pronta. Atualize a página e aguarde.', 'error');
      return;
    }

    const btn = document.querySelector('#doc-aba-gerar .btn-primary');
    btn.disabled = true;
    btn.textContent = '⏱️ Gerando... Aguarde...';

    try {
      const cliente = await DB.getSingle(DB.STORES.CLIENTES, 'id', parseInt(cliId));
      if(!cliente) throw new Error("Cliente não encontrado.");

      const assoc = await DB.getConfig('doc_assoc_dados') || {valor:{}};
      const assocDados = assoc.valor || {};

      let docTemplate = '';
      if(tipo === 'proposta') {
         const t = await DB.getConfig('doc_proposta');
         docTemplate = t ? t.valor : DEFAULT_PROPOSTA;
      } else {
         const t = await DB.getConfig('doc_contrato');
         docTemplate = t ? t.valor : DEFAULT_CONTRATO;
      }

      const capConfig = await DB.getConfig('capacidade_usina_kwp') || {valor: 300};
      const capUsina = parseFloat(capConfig.valor) || 300;
      const pct = (cliente.cota_kwp > 0 && capUsina > 0) ? ((cliente.cota_kwp / capUsina) * 100).toFixed(2) : 0;

      // Função de replace global
      const htmlMontado = _parserTags(docTemplate, cliente, assocDados, pct);

      await _renderPDF(htmlMontado, `${tipo.toUpperCase()}_${cliente.nome.replace(/\s+/g,'_')}.pdf`);

    } catch(e) {
      console.error(e);
      App.toast(e.message || 'Erro ao gerar documento', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📄 Gerar Modelo em PDF';
    }
  }

  function _parserTags(texto, cliente, assoc, pct) {
    let result = texto;

    const dict = {
      '{{NOME}}': cliente.nome || '—',
      '{{CPF}}': cliente.cpf || '—',
      '{{EMAIL}}': cliente.email || '—',
      '{{TELEFONE}}': cliente.telefone || '—',
      '{{TIPO_LIGACAO}}': cliente.tipo_ligacao ? cliente.tipo_ligacao.toUpperCase() : 'MONOFASICO',
      '{{CONSUMO_MEDIO}}': (cliente.consumo_medio || 0).toString(),
      '{{COTA}}': (cliente.cota_kwp || 0).toString(),
      '{{PORCENTAGEM_RATEIO}}': pct.toString(),
      '{{DATA_HOJE}}': new Date().toLocaleDateString('pt-BR'),
      '{{ASSOC_NOME}}': assoc.nome || 'Associação Ibiapaba Solar',
      '{{ASSOC_CNPJ}}': assoc.cnpj || '00.000.000/0001-00',
      '{{ASSOC_ENDERECO}}': assoc.endereco || 'Endereço da associação não defindo.'
    };

    for (const [key, value] of Object.entries(dict)) {
      // Substitui TODAS as ocorrências usando Expressão Regular global
      const regex = new RegExp(key.replace(/[{}]/g, '\\$&'), 'g');
      result = result.replace(regex, value);
    }
    
    return result;
  }

  async function _renderPDF(htmlContent, filename) {
    const container = document.getElementById('pdf-container');
    container.style.display = 'block';

    // Para evitar formatações zoadas, botaremos num canvas branco com fonte base.
    container.innerHTML = `<div style="font-family: 'Inter', sans-serif; padding:15px; color:#000;">
       ${htmlContent}
    </div>`;

    const opt = {
      margin:       [15, 10, 15, 10], // top, left, bottom, right
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await html2pdf().set(opt).from(container).save();

    container.style.display = 'none';
    container.innerHTML = '';
    App.toast('Documento PDF Gerado com Suceso!', 'success');
  }

  return { render, alternarAba, salvarConfig, gerarDocumento };
})();

window.ModDocumentos = ModDocumentos;
