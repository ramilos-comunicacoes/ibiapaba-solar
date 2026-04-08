/**
 * IBIAPABA SOLAR – Módulo de Tarifas ENEL Distribuição Ceará
 * ─────────────────────────────────────────────────────────────
 * Fontes:
 *  • ANEEL – Tarifas Homologadas (REH vigente ENEL-CE)
 *  • ICMS/CE – Lei 17.417/2020 + Decreto 33.640/2020
 *  • Bandeiras Tarifárias – REN ANEEL vigente
 *  • CIP – Contribuição de Iluminação Pública por município
 *  • Geolocalização Browser API + Nominatim (OpenStreetMap)
 * ─────────────────────────────────────────────────────────────
 */

const Tarifas = (() => {

  /* ──────────────────────────────────────────────────────────
     1. ESTRUTURA TARIFÁRIA ENEL-CE (B1 Residencial)
     Fonte: ANEEL REH vigente – ENEL Distribuição Ceará S.A.
     Última referência: Resolução Homologatória 2024/2025
     (Valores incluem PIS/COFINS; ICMS calculado separado)
     ────────────────────────────────────────────────────────── */
  const TARIFA_BASE = {
    /* Tarifa de Energia                */ TE:   0.39972,  // R$/kWh
    /* TUSD Distribuição (Fio B)        */ TUSD_B: 0.21920, // R$/kWh
    /* TUSD Transmissão (Fio A)         */ TUSD_A: 0.07845, // R$/kWh
    /* Encargos setoriais (CDE+PROINFA) */ ENC:  0.01843,  // R$/kWh
    /* PIS/COFINS (incluso no acima)    */ PIS_COFINS_RATE: 0.0365,
  };

  // Total sem ICMS (pré-ICMS)
  const BASE_SEM_ICMS = TARIFA_BASE.TE + TARIFA_BASE.TUSD_B + TARIFA_BASE.TUSD_A + TARIFA_BASE.ENC;
  // ≈ R$ 0.7158/kWh sem ICMS

  /* ──────────────────────────────────────────────────────────
     2. ICMS – CEARÁ (Lei 17.417/2020)
     ICMS é "por dentro" (compõe a própria base de cálculo)
     Alíquota depende do consumo mensal total
     ────────────────────────────────────────────────────────── */
  const ICMS_CE = [
    { ate: 300,     aliquota: 0.12 },  // 0 a 300 kWh → 12%
    { ate: Infinity, aliquota: 0.25 }, // acima de 300 kWh → 25%
  ];

  function getAliquotaICMS(kwh) {
    return ICMS_CE.find(f => kwh <= f.ate).aliquota;
  }

  // Tarifa final com ICMS "por dentro": T_final = BASE / (1 - ICMS)
  function tarifaComICMS(kwh) {
    return BASE_SEM_ICMS / (1 - getAliquotaICMS(kwh));
  }

  /* ──────────────────────────────────────────────────────────
     3. BANDEIRAS TARIFÁRIAS ANEEL (REN vigente)
     Valores em R$/kWh adicionados sobre a energia consumida
     ────────────────────────────────────────────────────────── */
  const BANDEIRAS = {
    verde:    { label: '🟢 Verde',      valor: 0.00000, descricao: 'Sem adicional' },
    amarela:  { label: '🟡 Amarela',    valor: 0.02300, descricao: '+R$ 0,0230/kWh' },
    vermelha1:{ label: '🔴 Vermelha I', valor: 0.04608, descricao: '+R$ 0,0461/kWh' },
    vermelha2:{ label: '🔴 Vermelha II',valor: 0.09812, descricao: '+R$ 0,0981/kWh' },
  };

  let _bandeiraSelecionada = 'verde';

  /* ──────────────────────────────────────────────────────────
     4. CIP – CONTRIBUIÇÃO PARA ILUMINAÇÃO PÚBLICA
     Valores mensais por município no Ceará (média residencial)
     Fonte: Decretos municipais vigentes
     ────────────────────────────────────────────────────────── */
  const CIP_MUNICIPIOS = {
    // ─── Serra da Ibiapaba ──────────────────────
    'tianguá':               16.50,
    'ubajara':               12.00,
    'viçosa do ceará':       10.50,
    'carnaubal':              8.50,
    'guaraciaba do norte':   14.00,
    'são benedito':          13.50,
    'croatá':                 8.00,
    'ipu':                   10.00,
    'ipueiras':               8.00,
    'mucambo':                8.00,
    'coreaú':                 8.50,
    'graça':                  7.50,
    'moraújo':                7.00,
    'pires ferreira':         6.50,
    'alcântaras':             6.00,
    'pacujá':                 6.00,
    'reriutaba':              9.00,
    'santa quitéria':        10.00,
    // ─── Sertão Central ─────────────────────────
    'sobral':                20.00,
    'crateus':               12.00,
    'crateús':               12.00,
    'tauá':                  10.00,
    'senador pompeu':         9.00,
    // ─── Fortaleza / Região Metropolitana ───────
    'fortaleza':             35.00,
    'caucaia':               18.00,
    'maracanaú':             18.00,
    'horizonte':             16.00,
    'itaitinga':             14.00,
    'maranguape':            14.00,
    'aquiraz':               14.00,
    'eusébio':               16.00,
    'pacatuba':              15.00,
    'guaiúba':               12.00,
    // ─── Interior ───────────────────────────────
    'juazeiro do norte':     22.00,
    'barbalha':              14.00,
    'crato':                 16.00,
    'iguatu':                12.00,
    'quixadá':               12.00,
    'quixeramobim':          10.00,
    'canindé':               10.00,
    'itapipoca':             12.00,
    'aracati':               14.00,
    'morada nova':           10.00,
    'russas':                12.00,
    'limoeiro do norte':     11.00,
    'cascavel':              12.00,
    'pacajus':               12.00,
    'baturité':              10.00,
    'redenção':               9.00,
    // ─── Default ────────────────────────────────
    '_default':              10.00,
  };

  function getCIP(municipio) {
    if (!municipio) return CIP_MUNICIPIOS['_default'];
    const key = municipio.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const keyNorm = key.replace(/[\u0300-\u036f]/g,'');
    // busca direta
    for (const [nome, valor] of Object.entries(CIP_MUNICIPIOS)) {
      const nNorm = nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      if (nNorm === keyNorm) return valor;
    }
    return CIP_MUNICIPIOS['_default'];
  }

  /* ──────────────────────────────────────────────────────────
     5. CUSTO DE DISPONIBILIDADE (mínimo por tipo de ligação)
     Cobrado mesmo com consumo zero
     ────────────────────────────────────────────────────────── */
  const MINIMO_KWH = { monofasico: 30, bifasico: 50, trifasico: 100 };

  /* ──────────────────────────────────────────────────────────
     6. CÁLCULO PRINCIPAL DA CONTA
     ────────────────────────────────────────────────────────── */
  function calcularConta(kwh, tipo_ligacao, municipio, bandeiraCod) {
    kwh = parseFloat(kwh) || 0;
    const minimoKwh   = MINIMO_KWH[tipo_ligacao] || 30;
    const kwhCobravel = Math.max(kwh, minimoKwh); // nunca abaixo do mínimo
    const bandeira    = BANDEIRAS[bandeiraCod || _bandeiraSelecionada] || BANDEIRAS.verde;

    const aliquotaICMS = getAliquotaICMS(kwhCobravel);
    const tarifaFinal  = tarifaComICMS(kwhCobravel);

    // Energia
    const valorEnergia  = kwhCobravel * tarifaFinal;

    // Bandeira
    const valorBandeira = kwhCobravel * bandeira.valor;

    // ICMS já embutido no tarifaFinal (por dentro)
    const valorICMS     = valorEnergia * aliquotaICMS;

    // CIP
    const cip = getCIP(municipio);

    // Total
    const total = valorEnergia + valorBandeira + cip;

    return {
      kwh,
      kwhCobravel,
      minimoKwh,
      tarifaFinal:     +tarifaFinal.toFixed(4),
      aliquotaICMS,
      valorEnergia:    +valorEnergia.toFixed(2),
      valorBandeira:   +valorBandeira.toFixed(2),
      valorICMS:       +valorICMS.toFixed(2),
      cip:             +cip.toFixed(2),
      total:           +total.toFixed(2),
      bandeira,
      municipio:       municipio || 'Ceará (padrão)',
      dataReferencia:  '2025 – ANEEL REH ENEL-CE',
    };
  }

  /* ──────────────────────────────────────────────────────────
     7. GEOLOCALIZAÇÃO → MUNICÍPIO (via Nominatim / OSM)
     ────────────────────────────────────────────────────────── */
  let _municipioDetectado = null;
  let _detectandoLocal    = false;

  async function detectarMunicipio(onSuccess, onError) {
    if (_municipioDetectado) { onSuccess(_municipioDetectado); return; }
    if (!navigator.geolocation) { onError('Geolocalização não suportada.'); return; }
    if (_detectandoLocal) return;

    _detectandoLocal = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&accept-language=pt`;
          const res   = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
          const data  = await res.json();
          const mun   = data.address?.city || data.address?.town || data.address?.village
                       || data.address?.municipality || 'Ceará';
          _municipioDetectado = mun;
          _detectandoLocal = false;
          onSuccess(mun);
        } catch (e) {
          _detectandoLocal = false;
          onError('Não foi possível identificar o município.');
        }
      },
      (err) => {
        _detectandoLocal = false;
        onError('Permissão de localização negada.');
      },
      { timeout: 8000, maximumAge: 300000 }
    );
  }

  /* ──────────────────────────────────────────────────────────
     8. BANDEIRA TARIFÁRIA – busca + gestão
     ────────────────────────────────────────────────────────── */
  async function fetchBandeira() {
    // Tenta ANEEL open data (can be CORS-blocked, handled gracefully)
    try {
      const res = await fetch(
        'https://dadosabertos.aneel.gov.br/api/3/action/datastore_search?resource_id=e0b7b9a5-5dd1-4b7c-acf5-3b0c4f4a4b1a&limit=1',
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const json = await res.json();
        const rec  = json?.result?.records?.[0];
        if (rec?.NomBandeira) {
          const b = _parseBandeiraNome(rec.NomBandeira);
          if (b) { setBandeira(b); return b; }
        }
      }
    } catch (_) { /* CORS ou timeout – usa localStorage */ }

    // Recupera do localStorage
    const saved = localStorage.getItem('bandeira_tarifaria');
    if (saved && BANDEIRAS[saved]) { _bandeiraSelecionada = saved; return saved; }
    return 'verde';
  }

  function _parseBandeiraNome(nome) {
    const n = nome.toLowerCase();
    if (n.includes('vermelha') && n.includes('2')) return 'vermelha2';
    if (n.includes('vermelha'))                    return 'vermelha1';
    if (n.includes('amarela'))                     return 'amarela';
    return 'verde';
  }

  function setBandeira(cod) {
    if (!BANDEIRAS[cod]) return;
    _bandeiraSelecionada = cod;
    localStorage.setItem('bandeira_tarifaria', cod);
  }

  function getBandeira()  { return _bandeiraSelecionada; }
  function getBandeiras() { return BANDEIRAS; }
  function getMunicipioDetectado() { return _municipioDetectado; }
  function setMunicipio(m) { _municipioDetectado = m; }
  function getMinimo(tipo) { return MINIMO_KWH[tipo] || 30; }

  /* ──────────────────────────────────────────────────────────
     9. RENDERIZAR CARD DE DETALHES DA CONTA
     ────────────────────────────────────────────────────────── */
  function renderDetalhesConta(result, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
      <div style="background:var(--primary-bg);border:1.5px solid var(--primary);border-radius:10px;padding:14px;font-size:12.5px">
        <div style="font-weight:700;color:var(--primary);margin-bottom:10px;font-size:13px">
          📋 Detalhamento da Conta – ENEL Distribuição Ceará
        </div>
        <table style="width:100%;border-collapse:collapse">
          ${_linhaDetalhe('⚡ Consumo cobrado', `${result.kwhCobravel} kWh`)}
          ${_linhaDetalhe('💵 TE + TUSD + Encargos', `R$ ${result.tarifaFinal.toFixed(4)}/kWh`)}
          ${_linhaDetalhe('🏛️ ICMS Ceará (${(result.aliquotaICMS*100).toFixed(0)}%)','por dentro – embutido')}
          ${_linhaDetalhe('💡 Sub-total Energia', App.moeda(result.valorEnergia))}
          ${result.valorBandeira > 0
            ? _linhaDetalhe(`${result.bandeira.label}`, App.moeda(result.valorBandeira))
            : _linhaDetalhe('🟢 Bandeira Tarifária', 'Sem adicional')}
          ${_linhaDetalhe('🏙️ CIP – ' + result.municipio, App.moeda(result.cip))}
          <tr style="border-top:1.5px solid var(--primary)">
            <td style="padding:6px 0;font-weight:800;color:var(--primary)">💰 TOTAL ESTIMADO</td>
            <td style="padding:6px 0;font-weight:800;color:var(--primary);text-align:right">${App.moeda(result.total)}</td>
          </tr>
        </table>
        <div style="margin-top:8px;font-size:10.5px;color:var(--gray-500)">
          ⚠️ Estimativa baseada em ${result.dataReferencia}. Valores reais podem variar.
          <a href="https://www.aneel.gov.br/bandeiras-tarifarias" target="_blank" style="color:var(--primary)">Ver bandeira atual →</a>
        </div>
      </div>`;
  }

  function _linhaDetalhe(label, valor) {
    return `<tr style="border-bottom:1px solid #d1fae5">
      <td style="padding:5px 0;color:var(--gray-600)">${label}</td>
      <td style="padding:5px 0;text-align:right;font-weight:600;color:var(--gray-800)">${valor}</td>
    </tr>`;
  }

  /* ──────────────────────────────────────────────────────────
     10. INICIALIZAÇÃO
     ────────────────────────────────────────────────────────── */
  async function init() {
    // Recupera bandeira salva
    const saved = localStorage.getItem('bandeira_tarifaria');
    if (saved && BANDEIRAS[saved]) _bandeiraSelecionada = saved;
    // Tenta buscar bandeira atualizada
    fetchBandeira().catch(() => {});
  }

  return {
    init,
    calcularConta,
    detectarMunicipio,
    setBandeira,
    getBandeira,
    getBandeiras,
    getMunicipioDetectado,
    setMunicipio,
    getCIP,
    getMinimo,
    renderDetalhesConta,
    MINIMO_KWH,
    TARIFA_BASE,
    ICMS_CE,
  };
})();

window.Tarifas = Tarifas;
