const DB_NAME = 'TravelToolDB';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'dataFileHandle';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSaveHandle(handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbLoadHandle() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function verifyHandlePermission(handle) {
  const opts = { mode: 'readwrite' };
  if (await handle.queryPermission(opts) === 'granted') return true;
  if (await handle.requestPermission(opts) === 'granted') return true;
  return false;
}

let currentFileHandle = null;
let currentFileName = '';

async function pickDataFile() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: '数据文件', accept: { 'application/json': ['.json'] } }],
      multiple: false
    });
    currentFileHandle = handle;
    currentFileName = handle.name;
    await idbSaveHandle(handle);
    return handle;
  } catch (e) {
    if (e.name !== 'AbortError') showError('选择文件失败：' + e.message);
    return null;
  }
}

async function createDataFile() {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'travel_data.json',
      types: [{ description: '数据文件', accept: { 'application/json': ['.json'] } }]
    });
    const defaultData = { current: '默认行程', itineraries: [{ name: '默认行程', markers: [] }] };
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(defaultData, null, 2));
    await writable.close();
    currentFileHandle = handle;
    currentFileName = handle.name;
    await idbSaveHandle(handle);
    return handle;
  } catch (e) {
    if (e.name !== 'AbortError') showError('创建文件失败：' + e.message);
    return null;
  }
}

async function loadFromHandle(handle) {
  const file = await handle.getFile();
  currentFileName = handle.name;
  return JSON.parse(await file.text());
}

async function saveToHandle(handle, data) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function initFileSystem() {
  const stored = await idbLoadHandle();
  if (stored) {
    if (await verifyHandlePermission(stored)) {
      currentFileHandle = stored;
      currentFileName = stored.name;
      return 'loaded';
    }
  }
  return 'need_file';
}

function getFileStatus() {
  return currentFileName || '未选择文件';
}

async function saveData(data) {
  if (!currentFileHandle) {
    showError('请先选择数据文件');
    return false;
  }
  try {
    await saveToHandle(currentFileHandle, data);
    return true;
  } catch (e) {
    showError('保存失败：' + e.message);
    return false;
  }
}
