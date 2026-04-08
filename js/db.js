/**
 * IBIAPABA SOLAR – Banco de Dados (SUPABASE + Fallback localStorage)
 * ─────────────────────────────────────────────────────────────
 * API unificada que funciona com Supabase na nuvem.
 * Se o Supabase estiver indisponível, faz fallback para localStorage.
 * Todos os módulos chamam: DB.getAll(), DB.add(), DB.put(), DB.remove(), etc.
 */

const DB = (() => {

  const URL = 'https://fldhwjpmehzklrrxhhet.supabase.co';
  const ANON_KEY = 'sb_publishable_1pzpU6tx8b4UpnHwZtSbGg_Dz1eXTMo';

  let supabase = null;
  let _usandoLocal = false; // fallback flag

  const STORES = {
    CLIENTES:   'clientes',
    USINA:      'usina',
    RATEIO:     'rateios',
    FINANCEIRO: 'financeiro',
    CONFIG:     'configuracoes',
    CONSUMO:    'consumos'
  };

  /* ══════════════════════════════════════════════════════════
     INICIALIZAÇÃO
     ══════════════════════════════════════════════════════════ */
  async function openDB() {
    // Tenta conectar ao Supabase
    if (typeof window.supabase !== 'undefined') {
      try {
        supabase = window.supabase.createClient(URL, ANON_KEY);
        // Testa a conexão com um select simples
        const { error } = await supabase.from(STORES.CONFIG).select('chave').limit(1);
        if (error) throw error;
        console.log('✅ Conectado ao Supabase na nuvem!');
        return;
      } catch (e) {
        console.warn('⚠️ Supabase indisponível, usando localStorage:', e.message || e);
      }
    }

    // Fallback: localStorage
    _usandoLocal = true;
    console.log('📦 Usando localStorage como banco de dados local.');
    // Garante que as "tabelas" existem no localStorage
    for (const store of Object.values(STORES)) {
      if (!localStorage.getItem(`ibi_${store}`)) {
        localStorage.setItem(`ibi_${store}`, JSON.stringify([]));
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     HELPERS LOCALSTORAGE
     ══════════════════════════════════════════════════════════ */
  function _localGet(store) {
    try { return JSON.parse(localStorage.getItem(`ibi_${store}`)) || []; }
    catch { return []; }
  }
  function _localSet(store, data) {
    localStorage.setItem(`ibi_${store}`, JSON.stringify(data));
  }
  function _nextId(store) {
    const items = _localGet(store);
    return items.length > 0 ? Math.max(...items.map(i => i.id || 0)) + 1 : 1;
  }

  /* ══════════════════════════════════════════════════════════
     API PRINCIPAL (CRUD)
     ══════════════════════════════════════════════════════════ */
  async function getAll(storeName) {
    if (_usandoLocal) return _localGet(storeName);
    const { data, error } = await supabase.from(storeName).select('*');
    if (error) { console.error('DB getAll:', error); return []; }
    return data || [];
  }

  async function getById(storeName, id) {
    if (_usandoLocal) {
      const items = _localGet(storeName);
      return items.find(i => i.id === id || i.id === parseInt(id)) || null;
    }
    const { data, error } = await supabase.from(storeName).select('*').eq('id', id).limit(1);
    if (error) { console.error('DB getById:', error); return null; }
    return data && data.length > 0 ? data[0] : null;
  }

  async function getSingle(storeName, indexName, value) {
    if (_usandoLocal) {
      const items = _localGet(storeName);
      return items.find(i => i[indexName] == value) || null;
    }
    const { data, error } = await supabase.from(storeName).select('*').eq(indexName, value).limit(1);
    if (error) { console.error('DB getSingle:', error); return null; }
    return data && data.length > 0 ? data[0] : null;
  }

  async function getByIndex(storeName, indexName, value) {
    if (_usandoLocal) {
      const items = _localGet(storeName);
      return items.filter(i => i[indexName] == value);
    }
    const { data, error } = await supabase.from(storeName).select('*').eq(indexName, value);
    if (error) { console.error('DB getByIndex:', error); return []; }
    return data || [];
  }

  async function add(storeName, item) {
    if (_usandoLocal) {
      const items = _localGet(storeName);
      item.id = _nextId(storeName);
      item.created_at = new Date().toISOString();
      items.push(item);
      _localSet(storeName, items);
      return [item];
    }
    const { data, error } = await supabase.from(storeName).insert([item]).select();
    if (error) {
      console.error('DB add:', error);
      if (error.code === '23505') {
        const err = new Error('ConstraintError');
        err.name = 'ConstraintError';
        throw err;
      }
      throw error;
    }
    return data;
  }

  async function put(storeName, item) {
    if (_usandoLocal) {
      const items = _localGet(storeName);
      const idx = items.findIndex(i => i.id === item.id);
      if (idx >= 0) {
        item.updated_at = new Date().toISOString();
        items[idx] = { ...items[idx], ...item };
        _localSet(storeName, items);
      } else {
        return await add(storeName, item);
      }
      return [item];
    }
    if (!item.id) return await add(storeName, item);
    const { data, error } = await supabase.from(storeName).update(item).eq('id', item.id).select();
    if (error) { console.error('DB put:', error); throw error; }
    return data;
  }

  async function remove(storeName, id) {
    if (_usandoLocal) {
      let items = _localGet(storeName);
      items = items.filter(i => i.id !== id && i.id !== parseInt(id));
      _localSet(storeName, items);
      return true;
    }
    const { error } = await supabase.from(storeName).delete().eq('id', id);
    if (error) { console.error('DB remove:', error); throw error; }
    return true;
  }

  /* ══════════════════════════════════════════════════════════
     CONFIGURAÇÕES (CHAVE → VALOR)
     ══════════════════════════════════════════════════════════ */
  async function getConfig(chave) {
    if (_usandoLocal) {
      const items = _localGet(STORES.CONFIG);
      return items.find(i => i.chave === chave) || null;
    }
    const { data, error } = await supabase.from(STORES.CONFIG).select('*').eq('chave', chave).limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0];
  }

  async function setConfig(chave, valor) {
    if (_usandoLocal) {
      const items = _localGet(STORES.CONFIG);
      const idx = items.findIndex(i => i.chave === chave);
      if (idx >= 0) { items[idx].valor = valor; }
      else { items.push({ id: _nextId(STORES.CONFIG), chave, valor }); }
      _localSet(STORES.CONFIG, items);
      return true;
    }
    const { error } = await supabase.from(STORES.CONFIG).upsert([{ chave, valor }]);
    if (error) { console.error('DB setConfig:', error); throw error; }
    return true;
  }

  /* ══════════════════════════════════════════════════════════
     BACKUP: EXPORT / IMPORT / CLEAR
     ══════════════════════════════════════════════════════════ */
  async function exportDB() {
    const result = { meta: { sistema: 'IBIAPABA SOLAR', versao: '2.0', data: new Date().toISOString() } };
    for (const [key, store] of Object.entries(STORES)) {
      result[store] = await getAll(store);
    }
    return result;
  }

  async function importDB(data) {
    for (const [key, store] of Object.entries(STORES)) {
      if (data[store] && Array.isArray(data[store])) {
        // Limpa a tabela
        await clearStore(store);
        // Insere cada item
        for (const item of data[store]) {
          try {
            if (_usandoLocal) {
              const items = _localGet(store);
              items.push(item);
              _localSet(store, items);
            } else {
              await supabase.from(store).insert([item]);
            }
          } catch (e) {
            console.warn(`Erro ao importar item em ${store}:`, e);
          }
        }
      }
    }
  }

  async function clearStore(storeName) {
    if (_usandoLocal) {
      _localSet(storeName, []);
      return;
    }
    // Supabase: deleta tudo
    try {
      await supabase.from(storeName).delete().neq('id', 0);
    } catch (e) {
      console.warn(`Erro ao limpar ${storeName}:`, e);
    }
  }

  /* ══════════════════════════════════════════════════════════
     DEMO DATA
     ══════════════════════════════════════════════════════════ */
  async function seedDemoData() {
    // Só popula se não tem nenhum dado
    const clientes = await getAll(STORES.CLIENTES);
    if (clientes.length > 0) return;

    // Dados demo mínimos
    const demos = [
      { nome: 'João Silva', cpf: '111.111.111-11', telefone: '(88) 99999-0001', email: 'joao@email.com', tipo_ligacao: 'trifasico', consumo_medio: 450, cota_kwp: 3.55, status: 'ativo' },
      { nome: 'Maria Santos', cpf: '222.222.222-22', telefone: '(88) 99999-0002', email: 'maria@email.com', tipo_ligacao: 'bifasico', consumo_medio: 280, cota_kwp: 2.21, status: 'ativo' },
      { nome: 'Carlos Oliveira', cpf: '333.333.333-33', telefone: '(88) 99999-0003', email: 'carlos@email.com', tipo_ligacao: 'monofasico', consumo_medio: 180, cota_kwp: 1.42, status: 'ativo' },
    ];
    for (const d of demos) { await add(STORES.CLIENTES, d); }
    console.log('📋 Dados demo inseridos.');
  }

  /* ══════════════════════════════════════════════════════════
     AUTH (Supabase – mantém compatibilidade)
     ══════════════════════════════════════════════════════════ */
  async function login(email, password) {
    if (_usandoLocal || !supabase) return { user: { email } };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }
  async function logout() {
    if (_usandoLocal || !supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
  async function getUser() {
    if (_usandoLocal || !supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }
  function onAuthStateChange(cb) {
    if (_usandoLocal || !supabase) return;
    supabase.auth.onAuthStateChange((ev, s) => cb(s ? s.user : null));
  }

  return {
    STORES, openDB,
    getAll, getById, getSingle, getByIndex,
    add, put, remove,
    getConfig, setConfig,
    exportDB, importDB, clearStore,
    login, logout, getUser, onAuthStateChange,
    seedDemoData
  };

})();

window.DB = DB;
