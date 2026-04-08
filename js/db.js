/**
 * IBIAPABA SOLAR - Camada de Banco de Dados (IndexedDB)
 * Gerencia toda a persistência de dados localmente no navegador.
 */

const DB_NAME = 'IbiababaaSolarDB';
const DB_VERSION = 1;

const STORES = {
  CLIENTES: 'clientes',
  USINA: 'usina',
  RATEIO: 'rateio',
  FINANCEIRO: 'financeiro',
  CONSUMO: 'consumo',
  CONFIG: 'config',
};

let _db = null;

/** Abre / inicializa o banco de dados */
function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // CLIENTES
      if (!db.objectStoreNames.contains(STORES.CLIENTES)) {
        const s = db.createObjectStore(STORES.CLIENTES, { keyPath: 'id', autoIncrement: true });
        s.createIndex('cpf', 'cpf', { unique: true });
        s.createIndex('nome', 'nome', { unique: false });
        s.createIndex('status', 'status', { unique: false });
      }

      // USINA – registros mensais de geração
      if (!db.objectStoreNames.contains(STORES.USINA)) {
        const s = db.createObjectStore(STORES.USINA, { keyPath: 'id', autoIncrement: true });
        s.createIndex('mes_ano', 'mes_ano', { unique: true });
      }

      // RATEIO – distribuições mensais por cliente
      if (!db.objectStoreNames.contains(STORES.RATEIO)) {
        const s = db.createObjectStore(STORES.RATEIO, { keyPath: 'id', autoIncrement: true });
        s.createIndex('mes_ano', 'mes_ano', { unique: false });
        s.createIndex('cliente_id', 'cliente_id', { unique: false });
      }

      // FINANCEIRO – lançamentos financeiros
      if (!db.objectStoreNames.contains(STORES.FINANCEIRO)) {
        const s = db.createObjectStore(STORES.FINANCEIRO, { keyPath: 'id', autoIncrement: true });
        s.createIndex('mes_ano', 'mes_ano', { unique: false });
        s.createIndex('tipo', 'tipo', { unique: false });
      }

      // CONSUMO – histórico de consumo mensal por cliente
      if (!db.objectStoreNames.contains(STORES.CONSUMO)) {
        const s = db.createObjectStore(STORES.CONSUMO, { keyPath: 'id', autoIncrement: true });
        s.createIndex('cliente_id', 'cliente_id', { unique: false });
        s.createIndex('mes_ano', 'mes_ano', { unique: false });
      }

      // CONFIG – configurações do sistema (chave/valor)
      if (!db.objectStoreNames.contains(STORES.CONFIG)) {
        db.createObjectStore(STORES.CONFIG, { keyPath: 'chave' });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => { reject(e.target.error); };
  });
}

/** Helper genérico para transações */
function tx(storeName, mode = 'readonly') {
  return _db.transaction([storeName], mode).objectStore(storeName);
}

function promisify(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

function getAll(storeName) {
  return openDB().then(() => promisify(tx(storeName).getAll()));
}

function getById(storeName, id) {
  return openDB().then(() => promisify(tx(storeName).get(id)));
}

function add(storeName, data) {
  data.created_at = data.created_at || new Date().toISOString();
  data.updated_at = new Date().toISOString();
  return openDB().then(() => promisify(tx(storeName, 'readwrite').add(data)));
}

function put(storeName, data) {
  data.updated_at = new Date().toISOString();
  return openDB().then(() => promisify(tx(storeName, 'readwrite').put(data)));
}

function remove(storeName, id) {
  return openDB().then(() => promisify(tx(storeName, 'readwrite').delete(id)));
}

function getByIndex(storeName, indexName, value) {
  return openDB().then(() => {
    const store = tx(storeName);
    const idx   = store.index(indexName);
    return promisify(idx.getAll(value));
  });
}

function getSingle(storeName, indexName, value) {
  return openDB().then(() => {
    const idx = tx(storeName).index(indexName);
    return promisify(idx.get(value));
  });
}

function clearStore(storeName) {
  return openDB().then(() => promisify(tx(storeName, 'readwrite').clear()));
}

/** CONFIG helpers */
function getConfig(chave) {
  return openDB().then(() => promisify(tx(STORES.CONFIG).get(chave)));
}

function setConfig(chave, valor) {
  return openDB().then(() => promisify(tx(STORES.CONFIG, 'readwrite').put({ chave, valor })));
}

/** EXPORTAÇÃO completa do banco */
async function exportDB() {
  await openDB();
  const data = { meta: { versao: '1.0', data: new Date().toISOString(), sistema: 'IBIAPABA SOLAR' } };
  for (const store of Object.values(STORES)) {
    data[store] = await getAll(store);
  }
  return data;
}

/** IMPORTAÇÃO completa (substitui dados existentes) */
async function importDB(data) {
  await openDB();
  for (const store of Object.values(STORES)) {
    if (!data[store]) continue;
    await clearStore(store);
    for (const item of data[store]) {
      // remove id para recriar autoincrement
      const { id, ...rest } = item;
      await add(store, rest);
    }
  }
}

/** Popula dados de demonstração se banco estiver vazio */
async function seedDemoData() {
  await openDB();
  const clientes = await getAll(STORES.CLIENTES);
  if (clientes.length > 0) return; // já populado

  // Config padrão
  await setConfig('fator_perda', 0.10);          // 10% perda técnica
  await setConfig('margem_seguranca', 0.10);      // 10% margem
  await setConfig('capacidade_usina_kwp', 300);   // 300 kWp
  await setConfig('geracao_media_estimada', 38000); // kWh/mês estimado

  // Clientes demo
  const clientesDemo = [
    { nome: 'João Carlos Silva',   cpf: '123.456.789-00', telefone: '(88) 99001-0001', email: 'joao@email.com',   tipo_ligacao: 'monofasico', consumo_medio: 320, status: 'ativo',   cota_kwp: 15, data_adesao: '2024-01-10' },
    { nome: 'Maria Aparecida Lima',cpf: '234.567.890-11', telefone: '(88) 99001-0002', email: 'maria@email.com',  tipo_ligacao: 'bifasico',   consumo_medio: 550, status: 'ativo',   cota_kwp: 25, data_adesao: '2024-01-15' },
    { nome: 'Antônio Ferreira',    cpf: '345.678.901-22', telefone: '(88) 99001-0003', email: 'antonio@email.com',tipo_ligacao: 'trifasico',  consumo_medio: 980, status: 'ativo',   cota_kwp: 45, data_adesao: '2024-02-01' },
    { nome: 'Luciana Santos',      cpf: '456.789.012-33', telefone: '(88) 99001-0004', email: 'lu@email.com',     tipo_ligacao: 'monofasico', consumo_medio: 210, status: 'ativo',   cota_kwp: 10, data_adesao: '2024-02-10' },
    { nome: 'Roberto Mendes',      cpf: '567.890.123-44', telefone: '(88) 99001-0005', email: 'rob@email.com',    tipo_ligacao: 'bifasico',   consumo_medio: 430, status: 'inadimplente', cota_kwp: 20, data_adesao: '2024-03-01' },
    { nome: 'Francisca Oliveira',  cpf: '678.901.234-55', telefone: '(88) 99001-0006', email: 'fr@email.com',     tipo_ligacao: 'monofasico', consumo_medio: 180, status: 'ativo',   cota_kwp: 8,  data_adesao: '2024-03-15' },
  ];

  for (const c of clientesDemo) { await add(STORES.CLIENTES, c); }

  // Geração usina (últimos 6 meses)
  const meses = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03'];
  const geracoes = [36200, 34800, 33500, 37100, 38500, 39200];
  for (let i = 0; i < meses.length; i++) {
    await add(STORES.USINA, {
      mes_ano: meses[i],
      geracao_real: geracoes[i],
      geracao_estimada: 38000,
      irradiacao: (4.2 + Math.random() * 0.8).toFixed(2),
      observacoes: '',
    });
  }
}

// Exporta como objeto global
window.DB = {
  STORES,
  openDB,
  getAll,
  getById,
  add,
  put,
  remove,
  getByIndex,
  getSingle,
  clearStore,
  getConfig,
  setConfig,
  exportDB,
  importDB,
  seedDemoData,
};
