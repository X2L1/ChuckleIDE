'use strict';

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const Store = require('electron-store');

const AdbManager = require('./src/main/adb-manager');
const LspManager = require('./src/main/lsp-manager');
const BuildManager = require('./src/main/build-manager');
const ProjectManager = require('./src/main/project-manager');
const Updater = require('./src/main/updater');
const GitHubAPI = require('./src/main/github-api');
const templates = require('./src/templates/index');

const store = new Store();

let mainWindow;
let adbManager;
let updater;
let lspManager;
let buildManager;
let projectManager;
let githubApi;

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
      label: 'Help',
      submenu: [
        {
          label: 'About FTC IDE',
          click: () => mainWindow.webContents.send('menu-action', 'about')
        },
        {
          label: 'Check for Updates…',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: () => mainWindow.webContents.send('menu-action', 'check-updates')
        },
        {
          label: 'FTC IDE Documentation',
          click: () => shell.openExternal('https://github.com/ftc-ide/ftc-ide')
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

// ── IPC: GitHub REST API ──────────────────────────────────────────────────────

ipcMain.handle('auth:startDeviceFlow', async () => {
  const configuredClientId = store.get('github.clientId');
  githubApi.setClientId(configuredClientId);
  const activeClientId = githubApi.getClientId();
  console.info('[github-auth] startDeviceFlow clientId source=settings value=' + maskClientIdForLog(activeClientId));
  const flowInfo = await githubApi.startDeviceFlow();
  shell.openExternal(flowInfo.verificationUri);

  githubApi.pollForToken(flowInfo.deviceCode, flowInfo.interval)
    .then(async () => {
      try { await githubApi.fetchAndStoreUser(); } catch { /* best-effort */ }
      if (mainWindow) mainWindow.webContents.send('auth:deviceFlowSuccess');
    })
    .catch((err) => {
      if (mainWindow) mainWindow.webContents.send('auth:deviceFlowError', err.message);
    });

  return { userCode: flowInfo.userCode, verificationUri: flowInfo.verificationUri };
});

ipcMain.handle('auth:cancelDeviceFlow', async () => {
  githubApi.cancelDeviceFlow();
  return true;
});

ipcMain.handle('auth:getUser', async () => {
  return githubApi.getUserProfile();
});

ipcMain.handle('auth:signOut', async () => {
  githubApi.signOut();
  return true;
});

ipcMain.handle('auth:setClientId', async (_, clientId) => {
  githubApi.setClientId(clientId);
  return true;
});

function maskClientIdForLog(clientId) {
  if (!clientId || typeof clientId !== 'string') return '<missing>';
  if (clientId.length <= 8) return `${clientId[0]}***${clientId.slice(-1)}`;
  return `${clientId.slice(0, 4)}***${clientId.slice(-4)}`;
}

// ── GitHub Repos ──────────────────────────────────────────────────────────────

ipcMain.handle('github:listRepos', async (_, opts) => {
  return githubApi.listRepos(opts);
});

ipcMain.handle('github:getRepo', async (_, owner, repo) => {
  return githubApi.getRepo(owner, repo);
});

ipcMain.handle('github:createRepo', async (_, name, options) => {
  return githubApi.createRepo(name, options);
});

ipcMain.handle('github:deleteRepo', async (_, owner, repo) => {
  return githubApi.deleteRepo(owner, repo);
});

ipcMain.handle('github:forkRepo', async (_, owner, repo) => {
  return githubApi.forkRepo(owner, repo);
});

ipcMain.handle('github:searchRepos', async (_, query) => {
  return githubApi.searchRepos(query);
});

// ── GitHub Contents ───────────────────────────────────────────────────────────

ipcMain.handle('github:getContents', async (_, owner, repo, path, ref) => {
  return githubApi.getContents(owner, repo, path || '', ref);
});

ipcMain.handle('github:createOrUpdateFile', async (_, owner, repo, path, content, message, sha) => {
  return githubApi.createOrUpdateFile(owner, repo, path, content, message, sha);
});

ipcMain.handle('github:deleteFile', async (_, owner, repo, path, sha, message) => {
  return githubApi.deleteFile(owner, repo, path, sha, message);
});

// ── GitHub Branches ───────────────────────────────────────────────────────────

ipcMain.handle('github:listBranches', async (_, owner, repo) => {
  return githubApi.listBranches(owner, repo);
});

ipcMain.handle('github:createBranch', async (_, owner, repo, branchName, sha) => {
  return githubApi.createBranch(owner, repo, branchName, sha);
});

// ── GitHub Commits ────────────────────────────────────────────────────────────

ipcMain.handle('github:listCommits', async (_, owner, repo, opts) => {
  return githubApi.listCommits(owner, repo, opts);
});

ipcMain.handle('github:getCommit', async (_, owner, repo, ref) => {
  return githubApi.getCommit(owner, repo, ref);
});

// ── GitHub Issues ─────────────────────────────────────────────────────────────

ipcMain.handle('github:listIssues', async (_, owner, repo, opts) => {
  return githubApi.listIssues(owner, repo, opts);
});

ipcMain.handle('github:createIssue', async (_, owner, repo, title, body) => {
  return githubApi.createIssue(owner, repo, title, body);
});

ipcMain.handle('github:updateIssue', async (_, owner, repo, issueNumber, data) => {
  return githubApi.updateIssue(owner, repo, issueNumber, data);
});

// ── GitHub Pull Requests ──────────────────────────────────────────────────────

ipcMain.handle('github:listPullRequests', async (_, owner, repo, opts) => {
  return githubApi.listPullRequests(owner, repo, opts);
});

ipcMain.handle('github:createPullRequest', async (_, owner, repo, title, head, base, body) => {
  return githubApi.createPullRequest(owner, repo, title, head, base, body);
});

// ── GitHub Releases ───────────────────────────────────────────────────────────

ipcMain.handle('github:listReleases', async (_, owner, repo) => {
  return githubApi.listReleases(owner, repo);
});

// ── GitHub Git operations (clone/push via REST) ───────────────────────────────

ipcMain.handle('github:downloadRepo', async (_, owner, repo, branch, destPath) => {
  const files = await githubApi.downloadRepo(owner, repo, branch);
  // Write files to destPath
  for (const file of files) {
    const filePath = path.join(destPath, file.path);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, file.content, 'utf-8');
  }
  return { filesWritten: files.length, destPath };
});

ipcMain.handle('github:pushProject', async (_, owner, repo, branch, projectPath) => {
  // Read all project files and push them
  const files = [];
  async function walkDir(dir, base) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(base, fullPath).replace(/\\/g, '/');
      // Skip common non-essential directories
      const SKIP_DIRS = ['.git', 'node_modules', 'build', '.gradle', '.idea', '__pycache__'];
      if (entry.isDirectory() && SKIP_DIRS.includes(entry.name)) continue;
      if (entry.isDirectory()) {
        await walkDir(fullPath, base);
      } else {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          files.push({ path: relPath, content });
        } catch {
          // Skip binary files or files that can't be read as UTF-8
        }
      }
    }
  }
  await walkDir(projectPath, projectPath);
  const commit = await githubApi.pushFiles(owner, repo, branch || 'main', files, 'Push from ChuckleIDE');
  return { sha: commit.sha, filesCount: files.length };
});

// ── GitHub Copilot ────────────────────────────────────────────────────────────

ipcMain.handle('github:copilotSuggest', async (_, prompt, language, filename) => {
  return githubApi.copilotSuggest(prompt, language, filename);
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

// ── IPC: Updater ──────────────────────────────────────────────────────────────

ipcMain.handle('update:check', async () => {
  return updater.checkForUpdates();
});

ipcMain.handle('update:install', async () => {
  return updater.installUpdate((msg) => {
    if (mainWindow) mainWindow.webContents.send('update:progress', msg);
  });
});

ipcMain.handle('update:status', async () => {
  return {
    updateAvailable: updater.updateAvailable,
    currentCommit: updater.currentCommit,
    latestCommit: updater.latestCommit,
    changelog: updater.changelog
  };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  adbManager = new AdbManager();
  lspManager = new LspManager(store);
  buildManager = new BuildManager();
  projectManager = new ProjectManager();
  updater = new Updater(store);
  githubApi = new GitHubAPI(store);

  createWindow();

  // Start background update checks; notify the renderer when an update lands.
  updater.startAutoCheck((updateInfo) => {
    if (mainWindow) mainWindow.webContents.send('update:available', updateInfo);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  lspManager && lspManager.stop();
  adbManager && adbManager.cleanup();
  updater && updater.stopAutoCheck();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  lspManager && lspManager.stop();
  adbManager && adbManager.cleanup();
  updater && updater.stopAutoCheck();
});
