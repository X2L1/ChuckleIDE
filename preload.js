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

  // ── Mechanics ────────────────────────────────────────────────────────────
  mechanics: {
    calculateGear: (input) => ipcRenderer.invoke('mechanics:calculateGear', input),
    calculateBeltChain: (input) => ipcRenderer.invoke('mechanics:calculateBeltChain', input),
    analyzeDrivetrain: (rpm, wheelDiameter) => ipcRenderer.invoke('mechanics:analyzeDrivetrain', rpm, wheelDiameter),
    analyzeCadWeakPoints: (fileName) => ipcRenderer.invoke('mechanics:analyzeCadWeakPoints', fileName)
  },

  // ── Management & Outreach ─────────────────────────────────────────────────
  management: {
    getTasks: () => ipcRenderer.invoke('management:getTasks'),
    saveTask: (task) => ipcRenderer.invoke('management:saveTask', task),
    deleteTask: (id) => ipcRenderer.invoke('management:deleteTask', id),
    getTeam: () => ipcRenderer.invoke('management:getTeam'),
    getAiSuggestion: (taskId) => ipcRenderer.invoke('management:getAiSuggestion', taskId),
    getOutreachLog: () => ipcRenderer.invoke('outreach:getLog'),
    addOutreachEntry: (entry) => ipcRenderer.invoke('outreach:addEntry', entry)
  },

  // ── Resources ────────────────────────────────────────────────────────────
  resources: {
    analyze: (query) => ipcRenderer.invoke('resources:analyze', query),
    getQuiz: () => ipcRenderer.invoke('resources:getQuiz'),
    saveLink: (label, url) => ipcRenderer.invoke('resources:saveLink', label, url),
    getLinks: () => ipcRenderer.invoke('resources:getLinks'),
    deleteLink: (id) => ipcRenderer.invoke('resources:deleteLink', id)
  },

  scouting: {
    setToken: (token) => ipcRenderer.invoke('scouting:setToken', token),
    getMatches: (season, eventCode) => ipcRenderer.invoke('scouting:getMatches', season, eventCode),
    getRankings: (season, eventCode) => ipcRenderer.invoke('scouting:getRankings', season, eventCode),
    predictMatch: (red, blue) => ipcRenderer.invoke('scouting:predictMatch', red, blue),
    calculateAdvancement: (rank, total, awards) => ipcRenderer.invoke('scouting:calculateAdvancement', rank, total, awards),
    getTeamEvents: (season, team) => ipcRenderer.invoke('scouting:getTeamEvents', season, team),
    getAutoData: (teamNumber) => ipcRenderer.invoke('scouting:getAutoData', teamNumber)
  },

  // ── Git ─────────────────────────────────────────────────────────────────────
  git: {
    clone: (url, localPath) => ipcRenderer.invoke('git:clone', url, localPath),
    status: (repoPath) => ipcRenderer.invoke('git:status', repoPath),
    init: (repoPath) => ipcRenderer.invoke('git:init', repoPath),
    add: (repoPath, files) => ipcRenderer.invoke('git:add', repoPath, files),
    commit: (repoPath, message) => ipcRenderer.invoke('git:commit', repoPath, message),
    push: (repoPath, remote, branch) => ipcRenderer.invoke('git:push', repoPath, remote, branch),
    pull: (repoPath, remote, branch) => ipcRenderer.invoke('git:pull', repoPath, remote, branch)
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
      'lsp:notification'
    ];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
  },

  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});
