/**
 * IBIAPABA SOLAR – Banco de Dados na Nuvem (SUPABASE)
 * ─────────────────────────────────────────────────────────────
 * Substitui o antigo IndexedDB. Utiliza a API oficial do Supabase.
 * Para garantir compatibilidade com as telas antigas,
 * mantemos os nomes das funções iguais (getAll, put, add, etc.).
 */

const DB = (() => {

  const URL = 'https://fldhwjpmehzklrrxhhet.supabase.co';
  const ANON_KEY = 'sb_publishable_1pzpU6tx8b4UpnHwZtSbGg_Dz1eXTMo';

  // Instância do Supabase
  let supabase = null;

  const STORES = {
    CLIENTES:   'clientes',
    USINA:      'usina',
    RATEIO:     'rateios',
    FINANCEIRO: 'financeiro',
    CONFIG:     'configuracoes',
    CONSUMO:    'consumos'
  };

  async function openDB() {
    // 1. O script do supabase via CDN precisa estar no index.html
    if (typeof window.supabase === 'undefined') {
      console.error('Supabase library not loaded! Check index.html script tag.');
      return;
    }
    
    // 2. Inicializa conexão com a nuvem
    supabase = window.supabase.createClient(URL, ANON_KEY);
    console.log('✅ Conectado ao Supabase na nuvem!');
  }

  // ============== API DO BANCO DE DADOS ==============

  async function getAll(storeName) {
    const { data, error } = await supabase.from(storeName).select('*');
    if (error) { console.error('Supabase getAll Error:', error); throw error; }
    return data || [];
  }

  async function getSingle(storeName, indexName, value) {
    const { data, error } = await supabase.from(storeName).select('*').eq(indexName, value).limit(1);
    if (error) { console.error('Supabase getSingle Error:', error); throw error; }
    return data && data.length > 0 ? data[0] : null;
  }

  async function getByIndex(storeName, indexName, value) {
    const { data, error } = await supabase.from(storeName).select('*').eq(indexName, value);
    if (error) { console.error('Supabase getByIndex Error:', error); throw error; }
    return data || [];
  }

  async function add(storeName, item) {
    const { data, error } = await supabase.from(storeName).insert([item]).select();
    // Exceção famosa para que o Usina consiga pegar restrição de Mês único, etc.
    if (error) { 
       console.error('Supabase Add Error:', error); 
       if(error.code === '23505') { // Postgres Unique Violation
           const err = new Error('ConstraintError');
           err.name = 'ConstraintError';
           throw err;
       }
       throw error; 
    }
    return data;
  }

  async function put(storeName, item) {
    // Se o item não tem ID tentamos inserir.
    if (!item.id) {
        return await add(storeName, item);
    }
    // Caso contrário faz o update usando o ID
    const { data, error } = await supabase.from(storeName)
        .update(item)
        .eq('id', item.id)
        .select();
    
    if (error) { console.error('Supabase Put Error:', error); throw error; }
    return data;
  }

  async function remove(storeName, id) {
    const { data, error } = await supabase.from(storeName).delete().eq('id', id);
    if (error) { console.error('Supabase Remove Error:', error); throw error; }
    return true;
  }

  // ====== METODOS DE CONFIGS (CHAVE -> VALOR) =======

  async function getConfig(chave) {
    const { data, error } = await supabase.from(STORES.CONFIG).select('*').eq('chave', chave).limit(1);
    if (error || !data || data.length === 0) return null;
    // Precisamos retornar num formato parecido com o IndexedDB: {chave: 'x', valor: 'y'}
    return data[0]; 
  }

  async function setConfig(chave, valor) {
    // O supabase upsert faz o replace automático pela chave primaria "chave"
    const { data, error } = await supabase.from(STORES.CONFIG).upsert([
        { chave: chave, valor: valor }
    ]);
    if (error) { console.error('Supabase setConfig Error:', error); throw error; }
    return true;
  }


  // ============== AUTENTICAÇÃO (SUPABASE AUTH) ==============

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function registrar(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function getUser() {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }

  function onAuthStateChange(callback) {
    if (!supabase) return;
    supabase.auth.onAuthStateChange((event, session) => {
      callback(session ? session.user : null);
    });
  }

  // ================= DEMONSTRAÇÃO / FALLBACK =================

  async function seedDemoData() {
    // Para nuvem, evitamos popular dados falsos toda vez, 
    // a menos que o admin aperte o botão "gerar dados fake" que faremos depois.
    return true;
  }

  // Funçao mock para não quebrar a importação/exportação antiga do JSON (iremos manter mas adaptado depois)
  async function clearObjStore() {}

  return {
    STORES, openDB,
    getAll, getSingle, getByIndex,
    add, put, remove,
    getConfig, setConfig,
    login, registrar, logout, getUser, onAuthStateChange,
    seedDemoData, clearObjStore
  };

})();

window.DB = DB;
