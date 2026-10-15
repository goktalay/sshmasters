'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  // arayüz dili (açılışta senkron alınır ki ilk çizim doğru dilde olsun)
  lang: ipcRenderer.sendSync('app:lang'),

  // hesap ve senkron (sshmasters.com)
  accountState: () => ipcRenderer.invoke('account:state'),
  login: (email, password, remember) => ipcRenderer.invoke('account:login', { email, password, remember }),
  logout: () => ipcRenderer.invoke('account:logout'),
  syncNow: () => ipcRenderer.invoke('account:syncNow'),
  setSyncEnabled: (on) => ipcRenderer.invoke('account:setSync', on),
  deleteRemoteLibrary: () => ipcRenderer.invoke('account:deleteRemote'),
  openWeb: (page) => ipcRenderer.invoke('account:openWeb', page), // 'forgot' | 'register' | 'account'
  openMastertool: () => ipcRenderer.invoke('app:openMastertool'),
  onAccountStatus: on('account:status'),
  onUpdateAvailable: on('app:update'),
  onLibraryBackup: on('account:backup'),

  // depo
  getStore: () => ipcRenderer.invoke('store:get'),
  onStoreChanged: on('store:changed'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  // bağlantılar
  saveConnection: (form) => ipcRenderer.invoke('conn:save', form),
  deleteConnection: (id) => ipcRenderer.invoke('conn:delete', id),
  duplicateConnection: (id) => ipcRenderer.invoke('conn:duplicate', id),
  moveConnection: (id, folderId) => ipcRenderer.invoke('conn:move', { id, folderId }),
  resetLastDir: (id) => ipcRenderer.invoke('conn:resetLastDir', id),
  setConnectionTheme: (id, theme) => ipcRenderer.invoke('conn:setTheme', { id, theme }),
  testConnection: (form) => ipcRenderer.invoke('conn:test', form),
  openConnection: (id) => ipcRenderer.invoke('conn:open', id),
  pickKeyFile: () => ipcRenderer.invoke('dialog:pickKey'),

  // klasörler
  saveFolder: (f) => ipcRenderer.invoke('folder:save', f),
  moveFolder: (id, parentId) => ipcRenderer.invoke('folder:move', { id, parentId }),
  deleteFolder: (id) => ipcRenderer.invoke('folder:delete', id),

  // kısayollar
  saveShortcut: (s) => ipcRenderer.invoke('shortcut:save', s),
  deleteShortcut: (id) => ipcRenderer.invoke('shortcut:delete', id),
  reorderShortcuts: (ids) => ipcRenderer.invoke('shortcut:reorder', ids),

  // terminal (her çağrı bir bölme kimliği "pane" taşır)
  sshStart: (o) => ipcRenderer.invoke('ssh:start', o), // { pane, connId, cols, rows }
  sshWrite: (pane, data) => ipcRenderer.send('ssh:write', { pane, data }),
  sshResize: (pane, cols, rows) => ipcRenderer.send('ssh:resize', { pane, cols, rows }),
  sshStop: (pane) => ipcRenderer.send('ssh:stop', { pane }),
  sshLastDir: (pane, dir) => ipcRenderer.send('ssh:lastDir', { pane, dir }),
  onSshData: on('ssh:data'),     // { pane, data }
  onSshClosed: on('ssh:closed'), // { pane }

  // uzak dosyalar
  sftpRealpath: (pane, p) => ipcRenderer.invoke('sftp:realpath', { pane, p }),
  sftpList: (pane, dir) => ipcRenderer.invoke('sftp:list', { pane, dir }),
  sftpStat: (pane, p) => ipcRenderer.invoke('sftp:stat', { pane, p }),
  sftpDownload: (o) => ipcRenderer.invoke('sftp:download', o), // { pane, id, remotePath, isDir, localDir }
  sftpUpload: (o) => ipcRenderer.invoke('sftp:upload', o),     // { pane, id, localPath, remoteDir }
  transferCancel: (id) => ipcRenderer.send('transfer:cancel', id),
  sftpMkdir: (pane, p) => ipcRenderer.invoke('sftp:mkdir', { pane, p }),
  sftpRename: (pane, from, to) => ipcRenderer.invoke('sftp:rename', { pane, from, to }),
  sftpDelete: (pane, p, isDir) => ipcRenderer.invoke('sftp:delete', { pane, p, isDir }),
  onTransferProgress: on('transfer:progress'),

  // yerel dosyalar
  localList: (dir) => ipcRenderer.invoke('local:list', dir),
  localDrives: () => ipcRenderer.invoke('local:drives'),
  localSpecial: () => ipcRenderer.invoke('local:special'),
  localOpen: (p) => ipcRenderer.invoke('local:open', p),
  localReveal: (p) => ipcRenderer.invoke('local:reveal', p),
  localMkdir: (p) => ipcRenderer.invoke('local:mkdir', p),
  pathForFile: (file) => webUtils.getPathForFile(file),

  // pano
  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  clipboardWrite: (t) => ipcRenderer.invoke('clipboard:write', t),
});
