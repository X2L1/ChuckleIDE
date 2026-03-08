'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ftcIDE', {

  // ── Platform ────────────────────────────────────────────────────────────────
  platform: process.platform,

  // ── Window Controls ─────────────────────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  },

  // ── File System ─────────────────────────────────────────────────────────────
  fs: {
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
    exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
    createFile: (filePath, content) => ipcRenderer.invoke('fs:createFile', filePath, content),
    createDir: (dirPath) => ipcRenderer.invoke('fs:createDir', dirPath),
    deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),
    rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    openDialog: (options) => ipcRenderer.invoke('fs:openDialog', options),
    saveDialog: (options) => ipcRenderer.invoke('fs:saveDialog', options)
  },

  // ── ADB ─────────────────────────────────────────────────────────────────────
  adb: {
    connect: (host, port) => ipcRenderer.invoke('adb:connect', host, port),
    disconnect: (host) => ipcRenderer.invoke('adb:disconnect', host),
    listDevices: () => ipcRenderer.invoke('adb:listDevices'),
    pushFile: (localPath, remotePath) => ipcRenderer.invoke('adb:pushFile', localPath, remotePath),
    shell: (command) => ipcRenderer.invoke('adb:shell', command),
    pair: (host, port, code) => ipcRenderer.invoke('adb:pair', host, port, code),
    getStatus: () => ipcRenderer.invoke('adb:getStatus')
  },

  // ── Build ───────────────────────────────────────────────────────────────────
  build: {
    assemble: (projectPath) => ipcRenderer.invoke('build:assemble', projectPath),
    clean: (projectPath) => ipcRenderer.invoke('build:clean', projectPath),
    install: (projectPath) => ipcRenderer.invoke('build:install', projectPath),
    stop: () => ipcRenderer.invoke('build:stop')
  },

  // ── Project ─────────────────────────────────────────────────────────────────
  project: {
    create: (options) => ipcRenderer.invoke('project:create', options),
    open: (projectPath) => ipcRenderer.invoke('project:open', projectPath),
    getInfo: (projectPath) => ipcRenderer.invoke('project:getInfo', projectPath),
    copyTemplate: (destPath) => ipcRenderer.invoke('project:copyTemplate', destPath)
  },

  // ── Templates ────────────────────────────────────────────────────────────────
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    get: (templateId) => ipcRenderer.invoke('templates:get', templateId),
    create: (templateId, options) => ipcRenderer.invoke('templates:create', templateId, options)
  },

  // ── Settings ─────────────────────────────────────────────────────────────────
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    delete: (key) => ipcRenderer.invoke('settings:delete', key)
  },

  // ── LSP ──────────────────────────────────────────────────────────────────────
  lsp: {
    start: (projectPath) => ipcRenderer.invoke('lsp:start', projectPath),
    stop: () => ipcRenderer.invoke('lsp:stop'),
    isRunning: () => ipcRenderer.invoke('lsp:isRunning'),
    sendRequest: (method, params) => ipcRenderer.invoke('lsp:sendRequest', method, params)
  },

  // ── Shell ────────────────────────────────────────────────────────────────────
  shell: {
    open: (dirPath) => ipcRenderer.invoke('shell:open', dirPath),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },

  // ── Updater ──────────────────────────────────────────────────────────────────
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    status: () => ipcRenderer.invoke('update:status')
  },

  // ── GitHub Auth ─────────────────────────────────────────────────────────────
  auth: {
    startDeviceFlow: () => ipcRenderer.invoke('auth:startDeviceFlow'),
    cancelDeviceFlow: () => ipcRenderer.invoke('auth:cancelDeviceFlow'),
    getUser: () => ipcRenderer.invoke('auth:getUser'),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
    setClientId: (id) => ipcRenderer.invoke('auth:setClientId', id)
  },

  // ── GitHub REST API ─────────────────────────────────────────────────────────
  github: {
    // Repos
    listRepos: (opts) => ipcRenderer.invoke('github:listRepos', opts),
    getRepo: (owner, repo) => ipcRenderer.invoke('github:getRepo', owner, repo),
    createRepo: (name, options) => ipcRenderer.invoke('github:createRepo', name, options),
    deleteRepo: (owner, repo) => ipcRenderer.invoke('github:deleteRepo', owner, repo),
    forkRepo: (owner, repo) => ipcRenderer.invoke('github:forkRepo', owner, repo),
    searchRepos: (query) => ipcRenderer.invoke('github:searchRepos', query),
    // Contents
    getContents: (owner, repo, path, ref) => ipcRenderer.invoke('github:getContents', owner, repo, path, ref),
    createOrUpdateFile: (owner, repo, path, content, message, sha) => ipcRenderer.invoke('github:createOrUpdateFile', owner, repo, path, content, message, sha),
    deleteFile: (owner, repo, path, sha, message) => ipcRenderer.invoke('github:deleteFile', owner, repo, path, sha, message),
    // Branches
    listBranches: (owner, repo) => ipcRenderer.invoke('github:listBranches', owner, repo),
    createBranch: (owner, repo, branchName, sha) => ipcRenderer.invoke('github:createBranch', owner, repo, branchName, sha),
    // Commits
    listCommits: (owner, repo, opts) => ipcRenderer.invoke('github:listCommits', owner, repo, opts),
    getCommit: (owner, repo, ref) => ipcRenderer.invoke('github:getCommit', owner, repo, ref),
    // Issues
    listIssues: (owner, repo, opts) => ipcRenderer.invoke('github:listIssues', owner, repo, opts),
    createIssue: (owner, repo, title, body) => ipcRenderer.invoke('github:createIssue', owner, repo, title, body),
    updateIssue: (owner, repo, issueNumber, data) => ipcRenderer.invoke('github:updateIssue', owner, repo, issueNumber, data),
    // Pull Requests
    listPullRequests: (owner, repo, opts) => ipcRenderer.invoke('github:listPullRequests', owner, repo, opts),
    createPullRequest: (owner, repo, title, head, base, body) => ipcRenderer.invoke('github:createPullRequest', owner, repo, title, head, base, body),
    // Releases
    listReleases: (owner, repo) => ipcRenderer.invoke('github:listReleases', owner, repo),
    // Git operations
    downloadRepo: (owner, repo, branch, destPath) => ipcRenderer.invoke('github:downloadRepo', owner, repo, branch, destPath),
    pushProject: (owner, repo, branch, projectPath) => ipcRenderer.invoke('github:pushProject', owner, repo, branch, projectPath),
    // Copilot
    copilotSuggest: (prompt, language, filename) => ipcRenderer.invoke('github:copilotSuggest', prompt, language, filename)
  },

  // ── Event Listeners ──────────────────────────────────────────────────────────
  on: (channel, callback) => {
    const allowedChannels = [
      'menu-action',
      'open-project',
      'open-file',
      'build:output',
      'project:progress',
      'adb:deviceChanged',
      'lsp:notification',
      'update:available',
      'update:progress',
      'auth:deviceFlowSuccess',
      'auth:deviceFlowError'
    ];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
  },

  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});
