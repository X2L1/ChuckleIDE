'use strict';

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const Store = require('electron-store');

const AdbManager = require('./src/main/adb-manager');
const LspManager = require('./src/main/lsp-manager');
const BuildManager = require('./src/main/build-manager');
const ProjectManager = require('./src/main/project-manager');
const templates = require('./src/templates/index');
const GitAPI = require('./src/main/git-api');
const ScoutingManager = require('./src/main/scouting-manager');
const ResourcesManager = require('./src/main/resources-manager');
const MechanicsManager = require('./src/main/mechanics-manager');
const ManagementManager = require('./src/main/management-manager');

const store = new Store();

let mainWindow;
let adbManager;
let lspManager;
let buildManager;
let projectManager;
let gitApi;
let scoutingManager;
let resourcesManager;
let mechanicsManager;
let managementManager;

function createWindow() {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  const windowOpts = {
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  };

  if (isMac) {
    windowOpts.titleBarStyle = 'hidden';
    windowOpts.trafficLightPosition = { x: 12, y: 10 };
  } else if (isWin) {
    windowOpts.titleBarStyle = 'hidden';
    windowOpts.titleBarOverlay = {
      color: '#0f0f0f',
      symbolColor: '#e0d0d8',
      height: 40
    };
  } else {
    // Linux – no native hidden-title support; go frameless
    windowOpts.frame = false;
  }

  mainWindow = new BrowserWindow(windowOpts);

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  buildApplicationMenu();
  if (process.platform !== 'darwin') {
    mainWindow.setAutoHideMenuBar(false);
    mainWindow.setMenuBarVisibility(true);
  }
}

function buildApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => mainWindow.webContents.send('menu-action', 'new-project')
        },
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory'],
              title: 'Open FTC Project'
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('open-project', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu-action', 'new-file')
        },
        {
          label: 'Open File',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Java Files', extensions: ['java'] },
                { name: 'Gradle Files', extensions: ['gradle', 'groovy'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('open-file', result.filePaths[0]);
            }
          }
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu-action', 'save-file')
        },
        {
          label: 'Save All',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu-action', 'save-all')
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('menu-action', 'open-settings')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow.webContents.send('menu-action', 'find')
        },
        {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow.webContents.send('menu-action', 'replace')
        },
        {
          label: 'Go to Line',
          accelerator: 'CmdOrCtrl+G',
          click: () => mainWindow.webContents.send('menu-action', 'goto-line')
        },
        {
          label: 'Trigger Completion',
          accelerator: 'CmdOrCtrl+Space',
          click: () => mainWindow.webContents.send('menu-action', 'trigger-completion')
        }
      ]
    },
    {
      label: 'Git',
      submenu: [
        {
          label: 'Commit',
          click: () => mainWindow.webContents.send('menu-action', 'git-commit')
        },
        {
          label: 'Push',
          click: () => mainWindow.webContents.send('menu-action', 'git-push')
        },
        {
          label: 'Pull',
          click: () => mainWindow.webContents.send('menu-action', 'git-pull')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        {
          label: 'Toggle File Explorer',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('menu-action', 'toggle-explorer')
        },
        {
          label: 'Toggle Terminal',
          accelerator: 'CmdOrCtrl+`',
          click: () => mainWindow.webContents.send('menu-action', 'toggle-terminal')
        },
        {
          label: 'Toggle Device Panel',
          click: () => mainWindow.webContents.send('menu-action', 'toggle-devices')
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => mainWindow.webContents.send('menu-action', 'zoom-in')
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow.webContents.send('menu-action', 'zoom-out')
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow.webContents.send('menu-action', 'zoom-reset')
        },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'FTC',
      submenu: [
        {
          label: 'Build Project',
          accelerator: 'F6',
          click: () => mainWindow.webContents.send('menu-action', 'build')
        },
        {
          label: 'Build & Deploy',
          accelerator: 'F7',
          click: () => mainWindow.webContents.send('menu-action', 'build-deploy')
        },
        {
          label: 'Clean Build',
          click: () => mainWindow.webContents.send('menu-action', 'clean-build')
        },
        { type: 'separator' },
        {
          label: 'Connect to Control Hub',
          click: () => mainWindow.webContents.send('menu-action', 'connect-hub')
        },
        {
          label: 'Disconnect from Control Hub',
          click: () => mainWindow.webContents.send('menu-action', 'disconnect-hub')
        },
        { type: 'separator' },
        {
          label: 'Insert Template',
          click: () => mainWindow.webContents.send('menu-action', 'insert-template')
        },
        {
          label: 'New OpMode from Template',
          click: () => mainWindow.webContents.send('menu-action', 'new-from-template')
        },
        { type: 'separator' },
        {
          label: 'Open FTC SDK Docs',
          click: () => shell.openExternal('https://ftctechnh.github.io/ftc_app/doc/javadoc/index.html')
        },
        {
          label: 'Open FTC Forum',
          click: () => shell.openExternal('https://ftcforum.firstinspires.org/')
        }
      ]
    },
    {
      label: 'Git',
      submenu: [
        {
          label: 'Clone Repository...',
          click: () => mainWindow.webContents.send('menu-action', 'git-clone')
        },
        {
          label: 'Commit & Push...',
          click: () => mainWindow.webContents.send('menu-action', 'git-commit')
        },
        {
          label: 'Pull...',
          click: () => mainWindow.webContents.send('menu-action', 'git-pull')
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About FTC IDE',
          click: () => mainWindow.webContents.send('menu-action', 'about')
        },
        { type: 'separator' },
        {
          label: 'PedroPathing Docs',
          click: () => shell.openExternal('https://pedropathing.com/')
        },
        {
          label: 'NextFTC Docs',
          click: () => shell.openExternal('https://github.com/rowan-mcalpin/nextftc')
        },
        {
          label: 'FTC Dashboard',
          click: () => shell.openExternal('https://acmerobotics.github.io/ftc-dashboard/')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── IPC: File System ───────────────────────────────────────────────────────────

ipcMain.handle('fs:readFile', async (_, filePath) => {
  return fs.readFile(filePath, 'utf8');
});

ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
  await fs.ensureDir(path.dirname(filePath));
  return fs.writeFile(filePath, content, 'utf8');
});

ipcMain.handle('fs:readDir', async (_, dirPath) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.map(e => ({
    name: e.name,
    isDirectory: e.isDirectory(),
    path: path.join(dirPath, e.name)
  }));
});

ipcMain.handle('fs:exists', async (_, filePath) => {
  return fs.pathExists(filePath);
});

ipcMain.handle('fs:createFile', async (_, filePath, content = '') => {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
  return true;
});

ipcMain.handle('fs:createDir', async (_, dirPath) => {
  await fs.ensureDir(dirPath);
  return true;
});

ipcMain.handle('fs:deleteFile', async (_, filePath) => {
  await fs.remove(filePath);
  return true;
});

ipcMain.handle('fs:rename', async (_, oldPath, newPath) => {
  await fs.move(oldPath, newPath);
  return true;
});

ipcMain.handle('fs:openDialog', async (_, options) => {
  return dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('fs:saveDialog', async (_, options) => {
  return dialog.showSaveDialog(mainWindow, options);
});

// ── Scouting ─────────────────────────────────────────────────────────────
ipcMain.handle('scouting:setToken', (event, token) => scoutingManager.setToken(token));
ipcMain.handle('scouting:getMatches', (event, season, eventCode) => scoutingManager.getMatches(season, eventCode));
ipcMain.handle('scouting:getRankings', (event, season, eventCode) => scoutingManager.getRankings(season, eventCode));
ipcMain.handle('scouting:predictMatch', (event, red, blue) => scoutingManager.predictMatch(red, blue));
ipcMain.handle('scouting:calculateAdvancement', (event, rank, total, awards) => scoutingManager.calculateAdvancement(rank, total, awards));
ipcMain.handle('scouting:getTeamEvents', (event, season, team) => scoutingManager.getTeamEvents(season, team));
ipcMain.handle('scouting:getAutoData', (event, teamNumber) => scoutingManager.getAutoScoutingData(teamNumber));

// ── Resources ────────────────────────────────────────────────────────────
ipcMain.handle('resources:analyze', (event, query) => resourcesManager.analyzeManual(query));
ipcMain.handle('resources:getQuiz', (event) => resourcesManager.getQuizQuestion());
ipcMain.handle('resources:saveLink', (event, label, url) => resourcesManager.saveLink(label, url));
ipcMain.handle('resources:getLinks', (event) => resourcesManager.getLinks());
ipcMain.handle('resources:deleteLink', (event, id) => resourcesManager.deleteLink(id));

// ── Mechanics ────────────────────────────────────────────────────────────
ipcMain.handle('mechanics:calculateGear', (event, input) => mechanicsManager.calculateGear(input));
ipcMain.handle('mechanics:calculateBeltChain', (event, input) => mechanicsManager.calculateBeltChain(input));
ipcMain.handle('mechanics:analyzeDrivetrain', (event, rpm, wheelDiameter) => mechanicsManager.analyzeDrivetrain(rpm, wheelDiameter));
ipcMain.handle('mechanics:analyzeCadWeakPoints', (event, fileName) => mechanicsManager.analyzeCadWeakPoints(fileName));

// ── Management & Outreach ───────────────────────────────────────────────────
ipcMain.handle('management:getTasks', () => managementManager.getTasks());
ipcMain.handle('management:saveTask', (event, task) => managementManager.saveTask(task));
ipcMain.handle('management:deleteTask', (event, id) => managementManager.deleteTask(id));
ipcMain.handle('management:getTeam', () => managementManager.getTeam());
ipcMain.handle('management:getAiSuggestion', (event, taskId) => managementManager.getAiAssignmentSuggestion(taskId));
ipcMain.handle('outreach:getLog', () => managementManager.getOutreachLog());
ipcMain.handle('outreach:addEntry', (event, entry) => managementManager.addOutreachEntry(entry));

// ── IPC: ADB ──────────────────────────────────────────────────────────────────

ipcMain.handle('adb:connect', async (_, host, port) => {
  return adbManager.connect(host, port || 5555);
});

ipcMain.handle('adb:disconnect', async (_, host) => {
  return adbManager.disconnect(host);
});

ipcMain.handle('adb:listDevices', async () => {
  return adbManager.listDevices();
});

ipcMain.handle('adb:pushFile', async (_, localPath, remotePath) => {
  return adbManager.pushFile(localPath, remotePath);
});

ipcMain.handle('adb:shell', async (_, command) => {
  return adbManager.shell(command);
});

ipcMain.handle('adb:pair', async (_, host, port, code) => {
  return adbManager.pair(host, port, code);
});

ipcMain.handle('adb:getStatus', async () => {
  return adbManager.getStatus();
});

// ── IPC: Build ────────────────────────────────────────────────────────────────

function applyBuildSettings() {
  buildManager.setGradleArgs(store.get('build.gradleArgs') || '');
  buildManager.setSlothMode(store.get('build.slothMode') === true);
  const javaHome = store.get('build.javaHome');
  if (javaHome) process.env.JAVA_HOME = javaHome;
}

ipcMain.handle('build:assemble', async (_, projectPath) => {
  applyBuildSettings();
  return buildManager.assemble(projectPath, (line) => {
    mainWindow.webContents.send('build:output', line);
  });
});

ipcMain.handle('build:clean', async (_, projectPath) => {
  applyBuildSettings();
  return buildManager.clean(projectPath, (line) => {
    mainWindow.webContents.send('build:output', line);
  });
});

ipcMain.handle('build:install', async (_, projectPath) => {
  applyBuildSettings();
  return buildManager.install(projectPath, (line) => {
    mainWindow.webContents.send('build:output', line);
  });
});

ipcMain.handle('build:stop', async () => {
  return buildManager.stop();
});

// ── IPC: Project ──────────────────────────────────────────────────────────────

ipcMain.handle('project:create', async (_, options) => {
  return projectManager.createProject(options, (msg) => {
    mainWindow.webContents.send('project:progress', msg);
  });
});

ipcMain.handle('project:open', async (_, projectPath) => {
  return projectManager.openProject(projectPath);
});

ipcMain.handle('project:getInfo', async (_, projectPath) => {
  return projectManager.getProjectInfo(projectPath);
});

ipcMain.handle('project:copyTemplate', async (_, destPath) => {
  return projectManager.copyFtcTemplate(destPath);
});

// ── IPC: Templates ────────────────────────────────────────────────────────────

ipcMain.handle('templates:list', async () => {
  return templates.list();
});

ipcMain.handle('templates:get', async (_, templateId) => {
  return templates.get(templateId);
});

ipcMain.handle('templates:create', async (_, templateId, options) => {
  return templates.create(templateId, options);
});

// ── IPC: Settings ─────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', async (_, key) => {
  return store.get(key);
});

ipcMain.handle('settings:set', async (_, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('settings:getAll', async () => {
  return { ...store.store };
});

ipcMain.handle('settings:delete', async (_, key) => {
  store.delete(key);
  return true;
});

// ── IPC: Git Operations ───────────────────────────────────────────────────────

ipcMain.handle('git:clone', async (_, url, localPath) => {
  return gitApi.clone(url, localPath);
});

ipcMain.handle('git:status', async (_, repoPath) => {
  return gitApi.status(repoPath);
});

ipcMain.handle('git:init', async (_, repoPath) => {
  return gitApi.init(repoPath);
});

ipcMain.handle('git:add', async (_, repoPath, files) => {
  return gitApi.add(repoPath, files);
});

ipcMain.handle('git:commit', async (_, repoPath, message) => {
  return gitApi.commit(repoPath, message);
});

ipcMain.handle('git:push', async (_, repoPath, remote, branch) => {
  return gitApi.push(repoPath, remote, branch);
});

ipcMain.handle('git:pull', async (_, repoPath, remote, branch) => {
  return gitApi.pull(repoPath, remote, branch);
});

// ── IPC: LSP ──────────────────────────────────────────────────────────────────

ipcMain.handle('lsp:start', async (_, projectPath) => {
  return lspManager.start(projectPath);
});

ipcMain.handle('lsp:stop', async () => {
  return lspManager.stop();
});

ipcMain.handle('lsp:isRunning', async () => {
  return lspManager.isRunning();
});

ipcMain.handle('lsp:sendRequest', async (_, method, params) => {
  return lspManager.sendRequest(method, params);
});

// ── IPC: Shell/Terminal ───────────────────────────────────────────────────────

ipcMain.handle('shell:open', async (_, dirPath) => {
  shell.openPath(dirPath);
  return true;
});

ipcMain.handle('shell:openExternal', async (_, url) => {
  shell.openExternal(url);
  return true;
});

// ── IPC: Window Controls ──────────────────────────────────────────────────────

ipcMain.handle('window:minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window:close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.handle('window:isMaximized', () => mainWindow ? mainWindow.isMaximized() : false);

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  adbManager = new AdbManager();
  lspManager = new LspManager(store);
  lspManager.on('notification', (msg) => {
    if (mainWindow) mainWindow.webContents.send('lsp:notification', msg);
  });
  buildManager = new BuildManager();
  projectManager = new ProjectManager();
  gitApi = new GitAPI();
  scoutingManager = new ScoutingManager(store);
  resourcesManager = new ResourcesManager(store);
  mechanicsManager = new MechanicsManager(store);
  managementManager = new ManagementManager(store);

  // Set API token from settings
  const apiToken = store.get('scouting.apiToken');
  if (apiToken) scoutingManager.setToken(apiToken);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  lspManager && lspManager.stop();
  adbManager && adbManager.cleanup();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  lspManager && lspManager.stop();
  adbManager && adbManager.cleanup();
});
