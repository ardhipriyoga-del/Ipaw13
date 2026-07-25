// ============================================================
//  IPAW EMC — Google Apps Script Cloud Backup & Restore
//  Versi: 2.1
// ============================================================
//
//  CARA DEPLOY:
//  1. Buka https://script.google.com dan buat project baru
//  2. Paste seluruh isi file ini, ganti kode yang ada
//  3. Klik Deploy > New deployment
//  4. Type: Web app
//  5. Execute as: Me
//  6. Who has access: Anyone
//  7. Klik Deploy, izinkan permission yang diminta
//  8. Salin URL deployment ke Pengaturan > Backup & Restore di aplikasi
//
//  DATA TERSIMPAN di Google Drive (folder "My Drive") sebagai file JSON.
//  File ID disimpan di PropertiesService agar pencarian lebih cepat.
// ============================================================

var API_KEY          = 'IPAW-EMC';
var BACKUP_FILE_NAME = 'IPAW_EMC_Backup.json';

// ── Entry point GET ──────────────────────────────────────────────────────────

/**
 * Menangani GET request.
 * ?action=status → cek apakah GAS online dan ada backup tersimpan
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

    if (action === 'status') {
      var info = getBackupInfo();
      return jsonResponse({
        success : true,
        status  : 'online',
        version : '2.1',
        hasData : info.hasData,
        metadata: info.metadata
      });
    }

    // Fallback: kembalikan status sederhana agar cek koneksi tetap berhasil
    return jsonResponse({ success: true, status: 'online', version: '2.1' });

  } catch (err) {
    return jsonResponse({ success: false, error: String(err.message || err) });
  }
}

// ── Entry point POST ─────────────────────────────────────────────────────────

/**
 * Menangani POST request.
 * Body JSON dengan field:
 *   action  — "save" | "backup" | "upload" | "store" | "write" | "simpan" | "restore"
 *   apiKey  — harus cocok dengan API_KEY
 *   database — (untuk aksi backup) object berisi array tiap store
 */
function doPost(e) {
  try {
    // ── Parse body ───────────────────────────────────────────────────────────
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: 'Body POST bukan JSON yang valid: ' + parseErr.message });
    }

    var action = String(payload.action || '').toLowerCase().trim();
    var apiKey  = String(payload.apiKey  || '').trim();

    // ── Validasi API key ─────────────────────────────────────────────────────
    if (apiKey !== API_KEY) {
      return jsonResponse({ success: false, error: 'API key tidak valid. Periksa pengaturan apiKey di aplikasi.' });
    }

    // ── Routing ──────────────────────────────────────────────────────────────
    var SAVE_ACTIONS = ['save', 'backup', 'upload', 'store', 'write', 'simpan'];

    if (SAVE_ACTIONS.indexOf(action) !== -1) {
      return handleBackup(payload);
    }

    if (action === 'restore') {
      return handleRestore();
    }

    if (action === 'status') {
      var info = getBackupInfo();
      return jsonResponse({ success: true, status: 'online', hasData: info.hasData, metadata: info.metadata });
    }

    if (action === 'delete' || action === 'reset') {
      return handleDelete(payload);
    }

    return jsonResponse({ success: false, error: 'Action tidak dikenal: "' + action + '". Action yang valid: save, backup, restore, status, delete.' });

  } catch (err) {
    return jsonResponse({ success: false, error: 'Internal error: ' + String(err.message || err) });
  }
}

// ── Handler: Backup (simpan data ke Drive) ───────────────────────────────────

function handleBackup(payload) {
  var database = payload.database;

  // Validasi: database harus ada dan harus punya array users yang tidak kosong
  if (!database || typeof database !== 'object') {
    return jsonResponse({ success: false, error: 'Field "database" tidak ditemukan atau bukan object.' });
  }
  if (!Array.isArray(database.users) || database.users.length === 0) {
    return jsonResponse({ success: false, error: 'Data backup tidak memiliki Master User (users[]. Backup dibatalkan untuk keamanan akun.' });
  }

  try {
    // Bangun metadata
    var now      = new Date();
    var metadata = {
      backupTime   : now.toISOString(),
      backupTimeWIB: formatWIB(now),
      stores       : Object.keys(database),
      recordCounts : {}
    };
    for (var store in database) {
      if (Object.prototype.hasOwnProperty.call(database, store) && Array.isArray(database[store])) {
        metadata.recordCounts[store] = database[store].length;
      }
    }

    var backupPayload = {
      success : true,
      metadata: metadata,
      database: database
    };

    var jsonStr = JSON.stringify(backupPayload);
    saveJsonToFile(jsonStr);

    Logger.log('Backup sukses: ' + JSON.stringify(metadata.recordCounts));

    return jsonResponse({
      success : true,
      message : 'Backup berhasil disimpan pada ' + metadata.backupTimeWIB,
      metadata: metadata
    });

  } catch (err) {
    Logger.log('handleBackup error: ' + err.message);
    return jsonResponse({ success: false, error: 'Gagal menyimpan backup: ' + String(err.message || err) });
  }
}

// ── Handler: Restore (ambil data dari Drive) ─────────────────────────────────

function handleRestore() {
  try {
    var jsonStr = loadJsonFromFile();

    if (!jsonStr || jsonStr.trim() === '' || jsonStr.trim() === '{}') {
      return jsonResponse({ success: false, error: 'Belum ada data backup yang tersimpan di cloud.' });
    }

    var data;
    try {
      data = JSON.parse(jsonStr);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: 'File backup rusak atau bukan JSON yang valid. Silakan backup ulang.' });
    }

    // Pastikan format response yang diharapkan aplikasi:
    // { success: true, database: {...}, metadata: {...} }
    if (data && data.success === true && data.database) {
      return jsonResponse(data);
    }

    // Fallback: kalau file lama tidak punya wrapper, kembalikan apa adanya
    return jsonResponse({ success: true, database: data, metadata: null });

  } catch (err) {
    Logger.log('handleRestore error: ' + err.message);
    return jsonResponse({ success: false, error: 'Gagal memuat backup: ' + String(err.message || err) });
  }
}

// ── Handler: Delete backup ───────────────────────────────────────────────────

function handleDelete(payload) {
  // Wajib konfirmasi eksplisit: { confirm: true }
  if (payload.confirm !== true) {
    return jsonResponse({ success: false, error: 'Untuk menghapus backup, sertakan { "confirm": true } di body.' });
  }

  try {
    var props  = PropertiesService.getScriptProperties();
    var fileId = props.getProperty('BACKUP_FILE_ID');

    if (fileId) {
      try {
        DriveApp.getFileById(fileId).setTrashed(true);
      } catch (e) { /* file mungkin sudah dihapus */ }
      props.deleteProperty('BACKUP_FILE_ID');
    }

    return jsonResponse({ success: true, message: 'Backup berhasil dihapus.' });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Gagal menghapus backup: ' + String(err.message || err) });
  }
}

// ── Utilitas Drive ───────────────────────────────────────────────────────────

/**
 * Simpan string JSON ke file Drive.
 * File ID disimpan di ScriptProperties agar pencarian lebih cepat
 * (DriveApp.getFilesByName() menelusuri seluruh Drive = lambat).
 */
function saveJsonToFile(content) {
  var props  = PropertiesService.getScriptProperties();
  var fileId = props.getProperty('BACKUP_FILE_ID');

  if (fileId) {
    try {
      var file = DriveApp.getFileById(fileId);
      file.setContent(content);
      return;
    } catch (e) {
      // File dihapus dari luar — hapus ID lama dan buat baru
      props.deleteProperty('BACKUP_FILE_ID');
    }
  }

  // Buat file baru
  var newFile = DriveApp.createFile(BACKUP_FILE_NAME, content, MimeType.PLAIN_TEXT);
  props.setProperty('BACKUP_FILE_ID', newFile.getId());
}

/**
 * Muat string JSON dari file Drive.
 * Mengembalikan null jika belum ada file backup.
 */
function loadJsonFromFile() {
  var props  = PropertiesService.getScriptProperties();
  var fileId = props.getProperty('BACKUP_FILE_ID');

  if (fileId) {
    try {
      return DriveApp.getFileById(fileId).getBlob().getDataAsString('UTF-8');
    } catch (e) {
      props.deleteProperty('BACKUP_FILE_ID');
    }
  }

  // Fallback: cari berdasarkan nama (untuk file yang dibuat di versi lama)
  var files = DriveApp.getFilesByName(BACKUP_FILE_NAME);
  if (files.hasNext()) {
    var file = files.next();
    props.setProperty('BACKUP_FILE_ID', file.getId());
    return file.getBlob().getDataAsString('UTF-8');
  }

  return null;
}

/**
 * Kembalikan informasi singkat tentang backup yang tersimpan
 * tanpa memuat seluruh konten file.
 */
function getBackupInfo() {
  try {
    var jsonStr = loadJsonFromFile();
    if (!jsonStr || jsonStr.trim() === '' || jsonStr.trim() === '{}') {
      return { hasData: false, metadata: null };
    }
    var data = JSON.parse(jsonStr);
    return {
      hasData : !!(data && (data.database || data.users)),
      metadata: (data && data.metadata) ? data.metadata : null
    };
  } catch (e) {
    return { hasData: false, metadata: null };
  }
}

// ── Utilitas umum ────────────────────────────────────────────────────────────

/**
 * Buat ContentService response berformat JSON.
 * Google Apps Script Web App tidak mengizinkan custom CORS header secara manual,
 * tapi jika deploy dengan "Anyone" access, GAS sudah menangani CORS otomatis.
 */
function jsonResponse(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Format tanggal ke string WIB (UTC+7) yang mudah dibaca.
 */
function formatWIB(date) {
  var wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  var pad = function(n) { return n < 10 ? '0' + n : String(n); };
  return wib.getUTCFullYear() + '-' +
         pad(wib.getUTCMonth() + 1) + '-' +
         pad(wib.getUTCDate()) + ' ' +
         pad(wib.getUTCHours()) + ':' +
         pad(wib.getUTCMinutes()) + ':' +
         pad(wib.getUTCSeconds()) + ' WIB';
}

// ── Fungsi pengujian (jalankan manual dari editor GAS) ───────────────────────

/**
 * Uji endpoint status — jalankan dari menu Run di editor GAS.
 */
function testStatus() {
  var result = doGet({ parameter: { action: 'status' } });
  Logger.log(result.getContent());
}

/**
 * Uji backup dengan data dummy — jalankan dari menu Run di editor GAS.
 */
function testBackup() {
  var result = doPost({
    postData: {
      contents: JSON.stringify({
        action  : 'backup',
        apiKey  : 'IPAW-EMC',
        database: {
          users   : [{ id: 1, username: 'admin', nama: 'Administrator', aktif: true }],
          patients: [],
          episodes: [],
          settings: [{ key: 'testKey', value: 'testValue' }]
        }
      })
    }
  });
  Logger.log(result.getContent());
}

/**
 * Uji restore — jalankan dari menu Run di editor GAS.
 */
function testRestore() {
  var result = doPost({
    postData: {
      contents: JSON.stringify({ action: 'restore', apiKey: 'IPAW-EMC' })
    }
  });
  var content = result.getContent();
  // Potong log jika data terlalu besar
  Logger.log(content.length > 2000 ? content.substring(0, 2000) + '...[terpotong]' : content);
}
