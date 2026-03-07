'use strict';

/* ═══════════════════════════════════════════════════════════
   FTC IDE – Renderer Process (app.js)
═══════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────
const state = {
  projectPath: null,
  openFiles: new Map(),      // filePath → { content, modified, model, viewState }
  activeFile: null,
  settings: {},
  gitStatus: null,
  devices: [],
  editorFontSize: 14,
  bottomHeight: 200,
  sidebarWidth: 260
};

let monacoEditor = null;
let fallbackEditor = null;
let isSettingFallbackContent = false;
let selectedTemplateId = null;
const EDITOR_READY_TIMEOUT_MS = 15000;
const activeDiagnosticsByFile = new Map();
let diagnosticsTimer = null;
let previousActiveDiagnosticsCount = 0;

// ── Initialization ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Tag <body> with the current platform so CSS can respond
  document.body.classList.add(`platform-${window.ftcIDE.platform}`);

  loadSettings();
  bindMenuActions();
  bindSidebarNav();
  bindFileExplorer();
  bindGitPanel();
  bindDevicePanel();
  bindBottomPanel();
  bindResizeHandles();
  bindWelcomeLinks();
  bindModals();
  bindKeyboardShortcuts();
  bindWindowControls();
  setupTemplatePanel();
  setupCopilotPanel();
  setupSettingsPanel();
  bindHomeScreen();

  // Use a built-in editor backend that is always available
  initFallbackEditor();

  // Listen for main-process events
  window.ftcIDE.on('menu-action', handleMenuAction);
  window.ftcIDE.on('open-project', (p) => openProject(p));
  window.ftcIDE.on('open-file', (p) => openFile(p));
  window.ftcIDE.on('build:output', appendBuildOutput);
  window.ftcIDE.on('project:progress', (msg) => appendOutput(msg, 'info'));

  // Auto-update events pushed from the main process
  window.ftcIDE.on('update:available', (info) => showUpdateNotification(info));
  window.ftcIDE.on('update:progress', (msg) => setUpdateProgress(msg));

  initUpdateUI();
  restoreUpdateStatus();
});

// ── Monaco Initialization ─────────────────────────────────
function initMonaco() {
  if (monacoEditor) return;
  if (typeof monaco === 'undefined' || !monaco?.editor) return;
  const container = document.getElementById('monaco-editor-wrapper');
  if (!container) return;
  const theme = state.settings['editor.theme'] || 'vs-dark';

  try {
    monacoEditor = monaco.editor.create(container, {
      value: '',
      language: 'java',
      theme,
      fontSize: state.editorFontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace",
      fontLigatures: true,
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      minimap: { enabled: true, maxColumn: 80 },
      wordWrap: state.settings['editor.wordWrap'] || 'off',
      tabSize: parseInt(state.settings['editor.tabSize'], 10) || 4,
      insertSpaces: true,
      autoIndent: 'full',
      formatOnType: false,
      formatOnPaste: true,
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      contextmenu: true,
      suggest: { insertMode: 'replace', showClasses: true, showFunctions: true },
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      inlineSuggest: { enabled: true },
      padding: { top: 8, bottom: 8 }
    });
  } catch (e) {
    console.error('Failed to create Monaco editor:', e);
    monacoEditor = null;
    return;
  }

  // Register Java-specific completions
  registerJavaCompletions();

  // Track cursor position
  monacoEditor.onDidChangeCursorPosition(({ position }) => {
    document.getElementById('status-position').textContent =
      `Ln ${position.lineNumber}, Col ${position.column}`;
  });

  // Track content changes
  monacoEditor.onDidChangeModelContent(() => {
    if (state.activeFile) {
      const info = state.openFiles.get(state.activeFile);
      if (info) {
        info.modified = true;
        info.content = monacoEditor.getValue();
        updateTabModified(state.activeFile, true);
        updateOutline();
        scheduleActiveDiagnostics(state.activeFile);
      }
    }
  });

  // Auto-save on focus loss
  monacoEditor.onDidBlurEditorText(() => {
    if (state.activeFile) autoSave(state.activeFile);
  });

  window.addEventListener('resize', () => { if (monacoEditor) monacoEditor.layout(); });
  appendOutput('Monaco Editor initialized.', 'success');
}

function initFallbackEditor() {
  if (fallbackEditor) return;
  fallbackEditor = document.getElementById('fallback-editor');
  if (!fallbackEditor) return;

  applyFallbackEditorSettings();
  fallbackEditor.addEventListener('input', () => {
    if (isSettingFallbackContent || !state.activeFile) return;
    const info = state.openFiles.get(state.activeFile);
    if (!info) return;
    info.modified = true;
    info.content = fallbackEditor.value;
    updateTabModified(state.activeFile, true);
    updateOutline();
    updateFallbackCursorPosition();
    scheduleActiveDiagnostics(state.activeFile);
  });
  fallbackEditor.addEventListener('blur', () => {
    if (state.activeFile) autoSave(state.activeFile);
  });
  ['click', 'keyup', 'select'].forEach((evt) => {
    fallbackEditor.addEventListener(evt, updateFallbackCursorPosition);
  });
  appendOutput('Basic editor initialized.', 'success');
}

function applyFallbackEditorSettings() {
  if (!fallbackEditor) return;
  fallbackEditor.style.fontSize = `${state.editorFontSize}px`;
  const tabSize = parseInt(state.settings['editor.tabSize'], 10) || 4;
  fallbackEditor.style.tabSize = String(tabSize);
  fallbackEditor.style.whiteSpace = state.settings['editor.wordWrap'] === 'on' ? 'pre-wrap' : 'pre';
}

function registerJavaCompletions() {
  if (!monaco) return;

  // Register FTC-specific completion provider
  monaco.languages.registerCompletionItemProvider('java', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const suggestions = [
        // FTC hardware snippets
        { label: 'hardwareMap.get', kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'hardwareMap.get(${1:DcMotor}.class, "${2:motorName}")',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Get hardware device from hardware map', range },
        { label: 'telemetry.addData', kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'telemetry.addData("${1:Key}", ${2:value});\ntelemetry.update();',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Add telemetry data and update', range },
        { label: 'waitForStart', kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'waitForStart();\n\nif (opModeIsActive()) {\n    $0\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Wait for start with active check', range },
        { label: '@Autonomous', kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '@Autonomous(name = "${1:Autonomous Name}", group = "${2:Autonomous}")',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Autonomous OpMode annotation', range },
        { label: '@TeleOp', kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '@TeleOp(name = "${1:TeleOp Name}", group = "${2:TeleOp}")',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'TeleOp OpMode annotation', range },
        { label: 'gamepad1', kind: monaco.languages.CompletionItemKind.Property,
          insertText: 'gamepad1',
          documentation: 'First gamepad input', range },
        { label: 'gamepad1.left_stick_x', kind: monaco.languages.CompletionItemKind.Property,
          insertText: 'gamepad1.left_stick_x',
          documentation: 'Left joystick X axis', range },
        { label: 'gamepad1.left_stick_y', kind: monaco.languages.CompletionItemKind.Property,
          insertText: 'gamepad1.left_stick_y',
          documentation: 'Left joystick Y axis', range },
        { label: 'DcMotor.ZeroPowerBehavior.BRAKE', kind: monaco.languages.CompletionItemKind.EnumMember,
          insertText: 'DcMotor.ZeroPowerBehavior.BRAKE', range },
        { label: 'DcMotor.ZeroPowerBehavior.FLOAT', kind: monaco.languages.CompletionItemKind.EnumMember,
          insertText: 'DcMotor.ZeroPowerBehavior.FLOAT', range },
        { label: 'DcMotor.RunMode.RUN_TO_POSITION', kind: monaco.languages.CompletionItemKind.EnumMember,
          insertText: 'DcMotor.RunMode.RUN_TO_POSITION', range },
        { label: 'DcMotor.RunMode.STOP_AND_RESET_ENCODER', kind: monaco.languages.CompletionItemKind.EnumMember,
          insertText: 'DcMotor.RunMode.STOP_AND_RESET_ENCODER', range },
        { label: 'DcMotor.RunMode.RUN_USING_ENCODER', kind: monaco.languages.CompletionItemKind.EnumMember,
          insertText: 'DcMotor.RunMode.RUN_USING_ENCODER', range },
      ];
      return { suggestions };
    }
  });
}

// ── Settings ──────────────────────────────────────────────
async function loadSettings() {
  try {
    state.settings = (await window.ftcIDE.settings.getAll()) || {};
    state.editorFontSize = parseInt(state.settings['editor.fontSize']) || 14;

    // Populate settings UI
    setInputVal('setting-font-size', state.settings['editor.fontSize'] || 14);
    setInputVal('setting-tab-size', state.settings['editor.tabSize'] || 4);
    setInputVal('setting-word-wrap', state.settings['editor.wordWrap'] || 'off');
    setInputVal('setting-theme', state.settings['editor.theme'] || 'vs-dark');
    setInputVal('setting-color-mode', state.settings['ui.colorMode'] || 'dark');
    applyColorMode(state.settings['ui.colorMode'] || 'dark');
    setInputVal('setting-java-home', state.settings['build.javaHome'] || '');
    setInputVal('setting-gradle-args', state.settings['build.gradleArgs'] || '');
    setInputVal('setting-sloth-mode', state.settings['build.slothMode'] === true || state.settings['build.slothMode'] === 'true');
    setInputVal('setting-github-user', state.settings['git.username'] || '');
    setInputVal('setting-github-email', state.settings['git.email'] || '');
    setInputVal('setting-adb-path', state.settings['adb.path'] || '');
    applyFallbackEditorSettings();

    // Restore last project
    const lastProject = state.settings['project.lastPath'];
    if (lastProject) openProject(lastProject).catch(() => {});
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

function setupSettingsPanel() {
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
}

async function saveSettings() {
  const kvPairs = [
    ['editor.fontSize', document.getElementById('setting-font-size').value],
    ['editor.tabSize', document.getElementById('setting-tab-size').value],
    ['editor.wordWrap', document.getElementById('setting-word-wrap').value],
    ['editor.theme', document.getElementById('setting-theme').value],
    ['build.javaHome', document.getElementById('setting-java-home').value],
    ['build.gradleArgs', document.getElementById('setting-gradle-args').value],
    ['build.slothMode', document.getElementById('setting-sloth-mode').checked],
    ['git.username', document.getElementById('setting-github-user').value],
    ['git.email', document.getElementById('setting-github-email').value],
    ['git.token', document.getElementById('setting-github-token').value],
    ['adb.path', document.getElementById('setting-adb-path').value],
    ['ui.colorMode', document.getElementById('setting-color-mode').value]
  ];

  for (const [k, v] of kvPairs) {
    await window.ftcIDE.settings.set(k, v);
    state.settings[k] = v;
  }

  // Apply to Monaco
  if (monacoEditor) {
    monacoEditor.updateOptions({
      fontSize: parseInt(state.settings['editor.fontSize']),
      tabSize: parseInt(state.settings['editor.tabSize']),
      wordWrap: state.settings['editor.wordWrap']
    });
    monaco.editor.setTheme(state.settings['editor.theme']);
  }
  applyFallbackEditorSettings();

  applyColorMode(state.settings['ui.colorMode']);
  showToast('Settings saved', 'success');
}

// ── Menu Actions ──────────────────────────────────────────
function handleMenuAction(action) {
  const handlers = {
    'new-project': () => showModal('new-project'),
    'new-file': () => promptNewFile(),
    'save-file': () => saveCurrentFile(),
    'save-all': () => saveAllFiles(),
    'open-settings': () => switchPanel('settings'),
    'find': () => monacoEditor ? monacoEditor.trigger('', 'actions.find') : showToast('Find is unavailable in basic editor', 'info'),
    'replace': () => monacoEditor ? monacoEditor.trigger('', 'editor.action.startFindReplaceAction') : showToast('Replace is unavailable in basic editor', 'info'),
    'goto-line': () => monacoEditor ? monacoEditor.trigger('', 'editor.action.gotoLine') : promptGotoLine(),
    'toggle-explorer': () => switchPanel('explorer'),
    'toggle-terminal': () => toggleBottomPanel(),
    'toggle-devices': () => switchPanel('devices'),
    'zoom-in': () => changeEditorFontSize(1),
    'zoom-out': () => changeEditorFontSize(-1),
    'zoom-reset': () => changeEditorFontSize(0),
    'build': () => triggerBuild('assemble'),
    'build-deploy': () => triggerBuild('install'),
    'clean-build': () => triggerBuild('clean'),
    'connect-hub': () => switchPanel('devices'),
    'disconnect-hub': () => adbDisconnectAll(),
    'insert-template': () => showModal('template'),
    'new-from-template': () => showModal('template'),
    'git-init': () => gitInit(),
    'git-clone': () => showModal('clone'),
    'git-commit': () => showModal('commit'),
    'git-pull': () => gitPull(),
    'git-push': () => gitPush(),
    'git-status': () => { switchPanel('git'); refreshGitStatus(); },
    'about': () => showToast('FTC IDE v1.0.0 – Built for FIRST Tech Challenge', 'info'),
    'check-updates': () => manualCheckForUpdates()
  };
  (handlers[action] || (() => appendOutput(`Unknown action: ${action}`, 'warn')))();
}

// ── Sidebar Navigation ─────────────────────────────────────
function bindSidebarNav() {
  document.querySelectorAll('.activity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      if (btn.classList.contains('active') && panel !== 'settings') {
        // Toggle sidebar
        document.getElementById('sidebar').style.display =
          document.getElementById('sidebar').style.display === 'none' ? '' : 'none';
      } else {
        document.getElementById('sidebar').style.display = '';
        switchPanel(panel);
      }
    });
  });
}

function switchPanel(name) {
  document.querySelectorAll('.activity-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
}

// ── File Explorer ─────────────────────────────────────────
function bindFileExplorer() {
  document.getElementById('btn-new-file').addEventListener('click', promptNewFile);
  document.getElementById('btn-new-folder').addEventListener('click', promptNewFolder);
  document.getElementById('btn-open-project').addEventListener('click', browseForProject);
  document.getElementById('btn-refresh-tree').addEventListener('click', () => refreshFileTree());
  document.getElementById('btn-open-project-2').addEventListener('click', browseForProject);
  document.getElementById('btn-new-project').addEventListener('click', () => showModal('new-project'));

  // Dependencies button – toggles between TeamCode view and full project view
  document.getElementById('btn-view-deps').addEventListener('click', () => {
    state.showingDeps = !state.showingDeps;
    const btn = document.getElementById('btn-view-deps');
    if (state.showingDeps) {
      btn.textContent = '☕ Back to TeamCode';
    } else {
      btn.textContent = '🐘 Dependencies & Build Files';
    }
    refreshFileTree();
  });
}

async function browseForProject() {
  const result = await window.ftcIDE.fs.openDialog({ properties: ['openDirectory'], title: 'Open FTC Project' });
  if (!result.canceled && result.filePaths.length > 0) {
    openProject(result.filePaths[0]);
  }
}

async function openProject(projectPath) {
  try {
    state.projectPath = projectPath;
    document.getElementById('project-title').textContent = projectPath.split(/[/\\]/).pop();
    document.getElementById('status-project').textContent = projectPath.split(/[/\\]/).pop();
    await window.ftcIDE.settings.set('project.lastPath', projectPath);

    // Default to TeamCode folder if it exists
    const teamCodePath = await findTeamCodePath(projectPath);
    state.teamCodePath = teamCodePath;
    state.showingDeps = false;

    await refreshFileTree();
    await refreshGitStatus();

    // Show Dependencies button if project has TeamCode
    const depsSection = document.getElementById('deps-section');
    if (depsSection) depsSection.style.display = teamCodePath ? '' : 'none';

    appendOutput(`Opened project: ${projectPath}`, 'success');
    showToast(`Project opened: ${projectPath.split(/[/\\]/).pop()}`, 'success');
  } catch (e) {
    appendOutput(`Failed to open project: ${e.message}`, 'error');
  }
}

async function findTeamCodePath(projectPath) {
  // Look for the TeamCode source directory
  const candidates = [
    projectPath + '/TeamCode/src/main/java/org/firstinspires/ftc/teamcode',
    projectPath + '/TeamCode/src/main/java',
    projectPath + '/TeamCode'
  ];
  for (const p of candidates) {
    try {
      const exists = await window.ftcIDE.fs.exists(p);
      if (exists) return p;
    } catch (e) {
      appendOutput(`TeamCode detection: ${e.message}`, 'warning');
    }
  }
  return null;
}

async function refreshFileTree(dirPath, containerEl, depth) {
  // Default to TeamCode folder when showing the project tree at top level
  if (!dirPath && !state.showingDeps && state.teamCodePath) {
    dirPath = state.teamCodePath;
  } else {
    dirPath = dirPath || state.projectPath;
  }
  containerEl = containerEl || document.getElementById('file-tree');
  depth = depth || 0;

  if (!dirPath) return;

  if (depth === 0) {
    containerEl.innerHTML = '';
  }

  try {
    const entries = await window.ftcIDE.fs.readDir(dirPath);
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    }).filter(e => !['node_modules', '.git', '.gradle', 'build', 'dist'].includes(e.name) || depth === 0);

    for (const entry of sorted) {
      const item = document.createElement('div');
      item.className = 'tree-item';
      item.style.paddingLeft = `${8 + depth * 12}px`;

      if (entry.isDirectory) {
        const arrow = document.createElement('span');
        arrow.className = 'tree-arrow';
        arrow.textContent = '›';
        const icon = document.createElement('span');
        icon.className = 'tree-icon';
        icon.textContent = '📁';
        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = entry.name;
        item.append(arrow, icon, name);

        const children = document.createElement('div');
        children.className = 'tree-children';
        children.style.display = 'none';

        item.addEventListener('click', async (e) => {
          e.stopPropagation();
          const open = children.style.display !== 'none';
          children.style.display = open ? 'none' : '';
          arrow.classList.toggle('open', !open);
          icon.textContent = open ? '📁' : '📂';
          if (!open && children.children.length === 0) {
            await refreshFileTree(entry.path, children, depth + 1);
          }
        });

        item.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          showContextMenu(e, [
            { label: 'New File', action: () => promptNewFileIn(entry.path) },
            { label: 'New Folder', action: () => promptNewFolderIn(entry.path) },
            { separator: true },
            { label: 'Rename', action: () => promptRename(entry.path, entry.name) },
            { label: 'Delete', action: () => confirmDelete(entry.path) },
            { separator: true },
            { label: 'Open in File Manager', action: () => window.ftcIDE.shell.open(entry.path) }
          ]);
        });

        containerEl.appendChild(item);
        containerEl.appendChild(children);
      } else {
        const icon = document.createElement('span');
        icon.className = 'tree-icon';
        icon.textContent = getFileIcon(entry.name);
        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = entry.name;
        item.append(icon, name);

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          openFile(entry.path);
        });
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          showContextMenu(e, [
            { label: 'Open', action: () => openFile(entry.path) },
            { separator: true },
            { label: 'Rename', action: () => promptRename(entry.path, entry.name) },
            { label: 'Delete', action: () => confirmDelete(entry.path) },
            { separator: true },
            { label: 'Copy Path', action: () => navigator.clipboard.writeText(entry.path) }
          ]);
        });

        containerEl.appendChild(item);
      }
    }
  } catch (e) {
    appendOutput(`Error reading directory ${dirPath}: ${e.message}`, 'error');
  }
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    java: '☕', gradle: '🐘', xml: '📄', json: '{}',
    md: '📝', txt: '📄', kt: '🔷', py: '🐍',
    js: '📜', ts: '📘', html: '🌐', css: '🎨',
    png: '🖼', jpg: '🖼', svg: '🖼', gif: '🖼',
    zip: '📦', jar: '📦', aar: '📦'
  };
  return icons[ext] || '📄';
}

// ── File Opening / Saving ─────────────────────────────────
async function openFile(filePath) {
  if (!monacoEditor && !fallbackEditor) {
    const ready = await waitForEditorReady();
    if (!ready) { showToast('Editor not ready', 'warning'); return; }
  }

  // Save current view state
  if (monacoEditor && state.activeFile && state.openFiles.has(state.activeFile)) {
    state.openFiles.get(state.activeFile).viewState = monacoEditor.saveViewState();
  }

  if (state.openFiles.has(filePath)) {
    activateTab(filePath);
    return;
  }

  try {
    const content = await window.ftcIDE.fs.readFile(filePath);
    const lang = getLanguageForFile(filePath);
    const model = monacoEditor && monaco?.editor
      ? monaco.editor.createModel(content, lang, monaco.Uri.file(filePath))
      : null;

    state.openFiles.set(filePath, { content, modified: false, model, viewState: null });
    addTab(filePath);
    activateTab(filePath);
    appendOutput(`Opened: ${filePath.split(/[/\\]/).pop()}`, 'info');
  } catch (e) {
    showToast(`Cannot open file: ${e.message}`, 'error');
  }
}

async function waitForEditorReady(timeoutMs = EDITOR_READY_TIMEOUT_MS) {
  if (monacoEditor || fallbackEditor) return true;
  initFallbackEditor();
  if (fallbackEditor) return true;

  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    let poll = null;
    const tryInit = () => {
      initMonaco();
      if (monacoEditor) finish(true);
    };
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      resolve(ok);
    };
    if (window.monacoReady || (typeof monaco !== 'undefined' && monaco?.editor)) {
      tryInit();
      if (monacoEditor) return;
    }
    poll = setInterval(tryInit, 250);
    timer = setTimeout(() => finish(false), timeoutMs);
  });
}

function getLanguageForFile(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const map = { java: 'java', gradle: 'groovy', groovy: 'groovy', xml: 'xml',
    json: 'json', md: 'markdown', kt: 'kotlin', js: 'javascript', ts: 'typescript',
    html: 'html', css: 'css', py: 'python', sh: 'shell', bat: 'bat', txt: 'plaintext' };
  return map[ext] || 'plaintext';
}

async function saveCurrentFile() {
  if (!state.activeFile) return;
  await saveFile(state.activeFile);
}

async function saveAllFiles() {
  for (const [fp, info] of state.openFiles) {
    if (info.modified) await saveFile(fp);
  }
}

async function saveFile(filePath) {
  const info = state.openFiles.get(filePath);
  if (!info) return;
  try {
    const content = info.model
      ? info.model.getValue()
      : ((state.activeFile === filePath && fallbackEditor) ? fallbackEditor.value : info.content);
    await window.ftcIDE.fs.writeFile(filePath, content);
    info.modified = false;
    info.content = content;
    updateTabModified(filePath, false);
    appendOutput(`Saved: ${filePath.split(/[/\\]/).pop()}`, 'info');
  } catch (e) {
    showToast(`Save failed: ${e.message}`, 'error');
  }
}

async function autoSave(filePath) {
  const info = state.openFiles.get(filePath);
  if (info && info.modified) {
    await saveFile(filePath);
  }
}

// ── Tab Management ────────────────────────────────────────
function addTab(filePath) {
  const tabsList = document.getElementById('tabs-list');
  const existing = tabsList.querySelector(`[data-path="${CSS.escape(filePath)}"]`);
  if (existing) return;

  const tab = document.createElement('div');
  tab.className = 'editor-tab';
  tab.dataset.path = filePath;

  const name = filePath.split(/[/\\]/).pop();
  tab.innerHTML = `
    <span class="tab-icon">${getFileIcon(name)}</span>
    <span class="tab-name">${name}</span>
    <span class="tab-modified" style="display:none">●</span>
    <button class="tab-close" title="Close">✕</button>
  `;

  tab.querySelector('.tab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(filePath);
  });
  tab.addEventListener('click', () => activateTab(filePath));
  tab.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(filePath); });

  tabsList.appendChild(tab);
}

function activateTab(filePath) {
  // Update active file
  state.activeFile = filePath;

  // Update tab UI
  document.querySelectorAll('.editor-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.path === filePath));

  // Show editor
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('monaco-editor-wrapper').style.display = monacoEditor ? '' : 'none';
  document.getElementById('fallback-editor-wrapper').style.display = monacoEditor ? 'none' : '';

  // Switch model
  const info = state.openFiles.get(filePath);
  if (info && info.model && monacoEditor) {
    monacoEditor.setModel(info.model);
    if (info.viewState) monacoEditor.restoreViewState(info.viewState);
    monacoEditor.focus();
  } else if (info && fallbackEditor) {
    isSettingFallbackContent = true;
    fallbackEditor.value = info.content || '';
    isSettingFallbackContent = false;
    fallbackEditor.focus();
    updateFallbackCursorPosition();
  }

  // Update breadcrumb
  updateBreadcrumb(filePath);
  // Update language in status bar
  document.getElementById('status-language').textContent = getLanguageForFile(filePath).toUpperCase();
  // Update outline
  updateOutline();
  renderActiveDiagnosticsForFile(filePath);
  scheduleActiveDiagnostics(filePath);
}

function closeTab(filePath) {
  const info = state.openFiles.get(filePath);
  if (info && info.modified) {
    if (!confirm(`Save changes to ${filePath.split(/[/\\]/).pop()}?`)) {
      // Discard
    } else {
      saveFile(filePath);
    }
  }

  if (info && info.model && typeof info.model.dispose === 'function') info.model.dispose();
  state.openFiles.delete(filePath);
  activeDiagnosticsByFile.delete(filePath);

  const tab = document.querySelector(`.editor-tab[data-path="${CSS.escape(filePath)}"]`);
  if (tab) tab.remove();

  // Switch to another tab if this was active
  if (state.activeFile === filePath) {
    const tabs = document.querySelectorAll('.editor-tab');
    if (tabs.length > 0) {
      activateTab(tabs[tabs.length - 1].dataset.path);
    } else {
      state.activeFile = null;
      showWelcomeScreen();
    }
  }
}

function showWelcomeScreen() {
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.getElementById('welcome-screen').style.display = '';
  document.getElementById('monaco-editor-wrapper').style.display = 'none';
  document.getElementById('fallback-editor-wrapper').style.display = 'none';
  if (monacoEditor) monacoEditor.setModel(null);
  const problems = document.getElementById('problems-list');
  const count = document.getElementById('problem-count');
  if (problems) problems.innerHTML = '';
  if (count) count.textContent = '';
  previousActiveDiagnosticsCount = 0;
}

function updateTabModified(filePath, modified) {
  const tab = document.querySelector(`.editor-tab[data-path="${CSS.escape(filePath)}"]`);
  if (!tab) return;
  const dot = tab.querySelector('.tab-modified');
  if (dot) dot.style.display = modified ? '' : 'none';
}

function updateBreadcrumb(filePath) {
  if (!filePath) { document.getElementById('breadcrumb-content').textContent = ''; return; }
  const parts = filePath.replace(state.projectPath || '', '').split(/[/\\]/).filter(Boolean);
  document.getElementById('breadcrumb-content').innerHTML =
    parts.map((p, i) => `<span class="breadcrumb-part">${p}</span>${i < parts.length - 1 ? '<span class="breadcrumb-sep">›</span>' : ''}`).join('');
}

// ── Outline ───────────────────────────────────────────────
function updateOutline() {
  const container = document.getElementById('outline-content');
  if (!state.activeFile) {
    container.innerHTML = '<div class="hint-text">Open a file to see its outline.</div>';
    return;
  }

  const content = getCurrentEditorContent();
  const items = parseJavaOutline(content);

  if (items.length === 0) {
    container.innerHTML = '<div class="hint-text">No symbols found.</div>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="outline-item ${item.type}" data-line="${item.line}">
      <span class="outline-icon">${item.icon}</span>
      <span>${item.name}</span>
    </div>
  `).join('');

  container.querySelectorAll('.outline-item').forEach(el => {
    el.addEventListener('click', () => {
      const line = parseInt(el.dataset.line);
      if (monacoEditor) {
        monacoEditor.revealLineInCenter(line);
      } else {
        goToLineInFallbackEditor(line);
      }
    });
  });
}

function parseJavaOutline(code) {
  const items = [];
  const lines = code.split('\n');
  const classRe = /(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+(\w+)/;
  const methodRe = /(?:public|private|protected)\s+(?:static\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/;
  const fieldRe = /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*[=;]/;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    let m;
    if ((m = trimmed.match(classRe))) {
      items.push({ type: 'class', name: m[1], icon: '○', line: idx + 1 });
    } else if ((m = trimmed.match(methodRe))) {
      if (m[1] !== 'return' && m[1] !== 'class') {
        items.push({ type: 'method', name: m[1] + '()', icon: '⚡', line: idx + 1 });
      }
    } else if ((m = trimmed.match(fieldRe))) {
      items.push({ type: 'field', name: m[2], icon: '◆', line: idx + 1 });
    }
  });
  return items;
}

function getCurrentEditorContent() {
  if (!state.activeFile) return '';
  const info = state.openFiles.get(state.activeFile);
  if (!info) return '';
  if (info.model) return info.model.getValue();
  if (fallbackEditor) return fallbackEditor.value;
  return info.content || '';
}

function updateFallbackCursorPosition() {
  if (!fallbackEditor) return;
  const pos = fallbackEditor.selectionStart || 0;
  const before = fallbackEditor.value.slice(0, pos);
  const lines = before.split('\n');
  const lineNumber = lines.length;
  const column = lines[lines.length - 1].length + 1;
  document.getElementById('status-position').textContent = `Ln ${lineNumber}, Col ${column}`;
}

function goToLineInFallbackEditor(line) {
  if (!fallbackEditor) return;
  const numericLine = Number(line);
  if (!Number.isFinite(numericLine)) return;
  const safeLine = Math.max(1, Math.floor(numericLine));
  const lines = fallbackEditor.value.split('\n');
  const targetLine = Math.min(safeLine, lines.length);
  let offset = 0;
  for (let i = 0; i < targetLine - 1; i++) offset += lines[i].length + 1;
  fallbackEditor.focus();
  fallbackEditor.setSelectionRange(offset, offset);
  updateFallbackCursorPosition();
}

async function promptGotoLine() {
  const value = await showInputPrompt('Go to line');
  if (!value) return;
  const line = parseInt(value, 10);
  if (!Number.isInteger(line) || line < 1) {
    showToast('Enter a valid line number', 'warning');
    return;
  }
  goToLineInFallbackEditor(line);
}

// ── Git Panel ─────────────────────────────────────────────
function bindGitPanel() {
  document.getElementById('btn-git-refresh').addEventListener('click', refreshGitStatus);
  document.getElementById('btn-git-commit-shortcut').addEventListener('click', () => showModal('commit'));
  document.getElementById('btn-git-stage-all').addEventListener('click', gitStageAll);
  document.getElementById('btn-git-commit').addEventListener('click', () => {
    const msg = document.getElementById('git-commit-message').value;
    if (msg) gitCommit(msg);
    else showModal('commit');
  });
  document.getElementById('btn-git-pull').addEventListener('click', gitPull);
  document.getElementById('btn-git-push').addEventListener('click', gitPush);
  document.getElementById('btn-do-commit').addEventListener('click', async () => {
    const msg = document.getElementById('modal-commit-message').value;
    if (!msg) { showToast('Please enter a commit message', 'warning'); return; }
    await gitCommit(msg);
    closeModal('commit');
  });
}

async function refreshGitStatus() {
  if (!state.projectPath) return;
  try {
    const status = await window.ftcIDE.git.status(state.projectPath);
    state.gitStatus = status;
    renderGitChanges(status);
    renderGitBranches();
    renderGitLog();
    document.getElementById('branch-name').textContent = status.current || 'unknown';
  } catch (e) {
    document.getElementById('branch-name').textContent = 'No repo';
  }
}

function renderGitChanges(status) {
  const list = document.getElementById('git-changes-list');
  if (!status || (!status.modified.length && !status.not_added.length && !status.deleted.length)) {
    list.innerHTML = '<div class="git-change-item"><span style="color:var(--fg-dim);font-size:11px">No changes</span></div>';
    return;
  }

  const items = [
    ...status.modified.map(f => ({ file: f, type: 'M' })),
    ...status.not_added.map(f => ({ file: f, type: 'A' })),
    ...status.deleted.map(f => ({ file: f, type: 'D' })),
    ...((status.renamed || []).map(f => ({ file: f.to, type: 'R' })))
  ];

  list.innerHTML = items.map(({ file, type }) => `
    <div class="git-change-item" title="${file}">
      <span class="change-letter ${type}">${type}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${file.split('/').pop()}</span>
    </div>
  `).join('');
}

async function renderGitBranches() {
  if (!state.projectPath) return;
  try {
    const branches = await window.ftcIDE.git.branches(state.projectPath);
    const list = document.getElementById('git-branches-list');
    const all = branches.all || [];
    list.innerHTML = all.map(b => `
      <div class="git-branch-item ${b === branches.current ? 'current' : ''}">
        <span class="branch-icon">⎇</span> ${b}
      </div>
    `).join('');
    list.querySelectorAll('.git-branch-item').forEach((el, i) => {
      el.addEventListener('click', () => gitCheckout(all[i]));
    });
  } catch (e) {}
}

async function renderGitLog() {
  if (!state.projectPath) return;
  try {
    const log = await window.ftcIDE.git.log(state.projectPath, 10);
    const list = document.getElementById('git-log-list');
    if (!log || !log.all) return;
    list.innerHTML = log.all.slice(0, 8).map(c => `
      <div class="git-log-item" title="${c.message}">
        <span class="git-log-hash">${c.hash.substring(0, 7)}</span>
        <span class="git-log-msg">${c.message.substring(0, 40)}</span>
        <div class="git-log-author">${c.author_name} · ${new Date(c.date).toLocaleDateString()}</div>
      </div>
    `).join('');
  } catch (e) {}
}

async function gitStageAll() {
  if (!state.projectPath) return;
  try {
    await window.ftcIDE.git.add(state.projectPath, ['.']);
    showToast('All changes staged', 'success');
    refreshGitStatus();
  } catch (e) {
    showToast(`Stage failed: ${e.message}`, 'error');
  }
}

async function gitCommit(message) {
  if (!state.projectPath || !message) return;
  try {
    await window.ftcIDE.git.add(state.projectPath, ['.']);
    await window.ftcIDE.git.commit(state.projectPath, message);
    document.getElementById('git-commit-message').value = '';
    showToast('Committed successfully', 'success');
    refreshGitStatus();
  } catch (e) {
    showToast(`Commit failed: ${e.message}`, 'error');
  }
}

async function gitPull() {
  if (!state.projectPath) return;
  try {
    showToast('Pulling...', 'info');
    const token = state.settings['git.token'];
    await window.ftcIDE.git.pull(state.projectPath, 'origin', '', token);
    showToast('Pull complete', 'success');
    refreshGitStatus();
  } catch (e) {
    showToast(`Pull failed: ${e.message}`, 'error');
  }
}

async function gitPush() {
  if (!state.projectPath) return;
  try {
    showToast('Pushing...', 'info');
    const token = state.settings['git.token'];
    await window.ftcIDE.git.push(state.projectPath, 'origin', '', token);
    showToast('Push complete', 'success');
  } catch (e) {
    showToast(`Push failed: ${e.message}`, 'error');
  }
}

async function gitInit() {
  if (!state.projectPath) { showToast('Open a project first', 'warning'); return; }
  try {
    await window.ftcIDE.git.init(state.projectPath);
    showToast('Git repository initialized', 'success');
    refreshGitStatus();
  } catch (e) {
    showToast(`Git init failed: ${e.message}`, 'error');
  }
}

async function gitCheckout(branch) {
  if (!state.projectPath) return;
  try {
    await window.ftcIDE.git.checkout(state.projectPath, branch);
    refreshGitStatus();
    showToast(`Switched to ${branch}`, 'success');
  } catch (e) {
    showToast(`Checkout failed: ${e.message}`, 'error');
  }
}

// ── Device Panel ──────────────────────────────────────────
function bindDevicePanel() {
  document.getElementById('btn-refresh-devices').addEventListener('click', refreshDevices);
  document.getElementById('btn-connect-hub').addEventListener('click', connectToHub);
  document.getElementById('btn-pair-hub').addEventListener('click', pairHub);
}

async function connectToHub() {
  const ip = document.getElementById('hub-ip-input').value.trim() || '192.168.43.1';
  const port = parseInt(document.getElementById('hub-port-input').value) || 5555;
  try {
    showToast(`Connecting to ${ip}:${port}...`, 'info');
    await window.ftcIDE.adb.connect(ip, port);
    showToast(`Connected to ${ip}:${port}`, 'success');
    updateHubStatus(true);
    refreshDevices();
  } catch (e) {
    showToast(`Connection failed: ${e.message}`, 'error');
    updateHubStatus(false);
  }
}

async function pairHub() {
  const ip = document.getElementById('hub-ip-input').value.trim() || '192.168.43.1';
  const pairPort = parseInt(document.getElementById('pair-port-input').value);
  const code = document.getElementById('pair-code-input').value.trim();
  if (!pairPort || !code) { showToast('Enter pair port and code', 'warning'); return; }
  try {
    await window.ftcIDE.adb.pair(ip, pairPort, code);
    showToast('Pairing successful', 'success');
  } catch (e) {
    showToast(`Pairing failed: ${e.message}`, 'error');
  }
}

async function refreshDevices() {
  try {
    const devices = await window.ftcIDE.adb.listDevices();
    state.devices = devices;
    renderDeviceList(devices);
    updateHubStatus(devices.some(d => d.type === 'device'));
  } catch (e) {
    document.getElementById('device-list').innerHTML =
      '<div class="no-devices">ADB not available</div>';
  }
}

function renderDeviceList(devices) {
  const list = document.getElementById('device-list');
  if (!devices || devices.length === 0) {
    list.innerHTML = '<div class="no-devices">No devices connected</div>';
    return;
  }
  list.innerHTML = devices.map(d => `
    <div class="device-item">
      <span class="device-icon">📱</span>
      <div class="device-info">
        <div class="device-name">${d.id || 'Unknown Device'}</div>
        <div class="device-serial">${d.id}</div>
        <div class="device-status ${d.type === 'device' ? 'online' : 'offline'}">${d.type}</div>
      </div>
      <div class="device-actions">
        <button class="btn-danger" onclick="adbDisconnect('${d.id}')">Disconnect</button>
      </div>
    </div>
  `).join('');
}

function updateHubStatus(connected) {
  const badge = document.getElementById('hub-status');
  badge.className = `status-badge ${connected ? 'connected' : 'disconnected'}`;
  const hubStatus = document.getElementById('status-hub');
  const dot = hubStatus.querySelector('.dot');
  dot.className = `dot ${connected ? 'green' : 'red'}`;
}

async function adbDisconnectAll() {
  try {
    for (const d of state.devices) await window.ftcIDE.adb.disconnect(d.id);
    updateHubStatus(false);
    refreshDevices();
    showToast('Disconnected from all devices', 'info');
  } catch (e) {}
}

window.adbDisconnect = async (id) => {
  try {
    await window.ftcIDE.adb.disconnect(id);
    refreshDevices();
    showToast(`Disconnected ${id}`, 'info');
  } catch (e) {}
};

// ── Templates ─────────────────────────────────────────────
async function setupTemplatePanel() {
  const templates = await window.ftcIDE.templates.list();
  renderTemplateList(templates, document.getElementById('template-list'));
  renderTemplateList(templates, document.getElementById('modal-template-list'));

  document.getElementById('template-search').addEventListener('input', async (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = templates.filter(t =>
      t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    renderTemplateList(filtered, document.getElementById('template-list'));
  });
  document.getElementById('modal-template-search').addEventListener('input', async (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = templates.filter(t =>
      t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    renderTemplateList(filtered, document.getElementById('modal-template-list'));
  });

  document.getElementById('btn-insert-template').addEventListener('click', insertSelectedTemplate);
}

function renderTemplateList(templates, container) {
  const groups = {};
  for (const t of templates) {
    (groups[t.category] = groups[t.category] || []).push(t);
  }

  container.innerHTML = '';
  for (const [cat, items] of Object.entries(groups)) {
    const title = document.createElement('div');
    title.className = 'template-group-title';
    title.textContent = cat;
    container.appendChild(title);

    for (const t of items) {
      const item = document.createElement('div');
      item.className = 'template-item';
      item.dataset.id = t.id;
      item.innerHTML = `
        <span class="template-icon">${t.icon || '📄'}</span>
        <div class="template-info">
          <div class="template-name">${t.name}</div>
          <div class="template-desc">${t.description}</div>
        </div>
      `;
      item.addEventListener('click', async () => {
        selectedTemplateId = t.id;
        container.querySelectorAll('.template-item').forEach(el =>
          el.style.background = el.dataset.id === t.id ? 'var(--bg-selected)' : '');
        // Preview
        try {
          const content = await window.ftcIDE.templates.get(t.id);
          document.getElementById('modal-template-preview').textContent = content.substring(0, 800) + (content.length > 800 ? '\n...' : '');
        } catch (e) {}
        // If click in sidebar, open template modal
        if (container.id === 'template-list') showModal('template');
      });
      container.appendChild(item);
    }
  }
}

async function insertSelectedTemplate() {
  if (!selectedTemplateId) { showToast('Select a template first', 'warning'); return; }
  const className = document.getElementById('template-class-name').value.trim() || 'MyOpMode';
  const pkg = document.getElementById('template-package').value.trim() || 'org.firstinspires.ftc.teamcode';

  try {
    const content = await window.ftcIDE.templates.create(selectedTemplateId, { className, packageName: pkg });
    if (monacoEditor && state.activeFile) {
      const position = monacoEditor.getPosition();
      monacoEditor.executeEdits('insert-template', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: content
      }]);
      showToast('Template inserted', 'success');
    } else if (fallbackEditor && state.activeFile) {
      const start = fallbackEditor.selectionStart ?? fallbackEditor.value.length;
      const end = fallbackEditor.selectionEnd ?? start;
      fallbackEditor.setRangeText(content, start, end, 'end');
      const info = state.openFiles.get(state.activeFile);
      if (info) {
        info.modified = true;
        info.content = fallbackEditor.value;
        updateTabModified(state.activeFile, true);
      }
      updateOutline();
      showToast('Template inserted', 'success');
    } else {
      // Create a new file
      const fileName = `${className}.java`;
      const filePath = state.projectPath
        ? `${state.projectPath}/TeamCode/src/main/java/${pkg.replace(/\./g, '/')}/${fileName}`
        : null;
      if (filePath) {
        await window.ftcIDE.fs.createFile(filePath, content);
        await openFile(filePath);
        showToast(`Created ${fileName}`, 'success');
      } else {
        showToast('Open a project first', 'warning');
      }
    }
    closeModal('template');
  } catch (e) {
    showToast(`Template error: ${e.message}`, 'error');
  }
}

// ── Build ─────────────────────────────────────────────────
async function triggerBuild(type) {
  if (!state.projectPath) { showToast('Open a project first', 'warning'); return; }
  switchBottomTab('build');
  document.getElementById('build-output').innerHTML = '';
  appendBuildOutput(`\n═══ Build ${type.toUpperCase()} ═══\n`);
  showToast(`Build started: ${type}`, 'info');

  try {
    let result;
    if (type === 'clean') result = await window.ftcIDE.build.clean(state.projectPath);
    else if (type === 'install') result = await window.ftcIDE.build.install(state.projectPath);
    else result = await window.ftcIDE.build.assemble(state.projectPath);

    if (result && result.success) {
      appendBuildOutput('\nBUILD SUCCESSFUL', 'success');
      showToast('Build successful!', 'success');
    } else {
      appendBuildOutput('\nBUILD FAILED', 'error');
      showToast('Build failed. Check output.', 'error');
    }
  } catch (e) {
    appendBuildOutput(`\nBuild error: ${e.message}`, 'error');
    showToast(`Build error: ${e.message}`, 'error');
  }
}

function appendBuildOutput(line, type) {
  const el = document.getElementById('build-output');
  const div = document.createElement('div');
  div.className = `log-line ${type || ''}`;
  div.textContent = line;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function scheduleActiveDiagnostics(filePath) {
  if (!filePath) return;
  if (diagnosticsTimer) clearTimeout(diagnosticsTimer);
  diagnosticsTimer = setTimeout(() => runActiveDiagnostics(filePath), 220);
}

function runActiveDiagnostics(filePath) {
  const info = state.openFiles.get(filePath);
  if (!info) return;
  const content = info.model
    ? info.model.getValue()
    : ((state.activeFile === filePath && fallbackEditor) ? fallbackEditor.value : info.content || '');
  const language = getLanguageForFile(filePath);
  const diagnostics = findApparentCodeIssues(content, language);
  activeDiagnosticsByFile.set(filePath, diagnostics);
  if (state.activeFile === filePath) renderActiveDiagnosticsForFile(filePath);
}

function renderActiveDiagnosticsForFile(filePath) {
  const diagnostics = activeDiagnosticsByFile.get(filePath) || [];
  const list = document.getElementById('problems-list');
  const count = document.getElementById('problem-count');
  if (list) list.innerHTML = '';

  if (count) {
    count.textContent = diagnostics.length > 0 ? String(diagnostics.length) : '';
  }

  diagnostics.forEach((diag) => {
    if (!list) return;
    const item = document.createElement('div');
    item.className = 'problem-item';
    item.innerHTML = `
      <span class="problem-icon ${diag.severity}">${diag.severity === 'error' ? '⨯' : '⚠'}</span>
      <div class="problem-info">
        <div class="problem-message">${escapeHtml(diag.message)}</div>
        <div class="problem-location">${escapeHtml(diag.location)}</div>
      </div>
    `;
    item.addEventListener('click', () => focusProblemLocation(diag));
    list.appendChild(item);
  });

  if (monacoEditor) {
    const info = state.openFiles.get(filePath);
    if (info?.model && monaco?.editor && monaco?.MarkerSeverity) {
      const markers = diagnostics.map((diag) => ({
        startLineNumber: diag.startLineNumber,
        startColumn: diag.startColumn,
        endLineNumber: diag.endLineNumber,
        endColumn: diag.endColumn,
        message: diag.message,
        severity: diag.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning
      }));
      monaco.editor.setModelMarkers(info.model, 'active-issues', markers);
    }
  }

  if (state.activeFile) {
    if (previousActiveDiagnosticsCount === 0 && diagnostics.length > 0) {
      showToast('Apparent code issue detected. See Problems tab.', diagnostics[0].severity === 'error' ? 'error' : 'warning');
    }
    previousActiveDiagnosticsCount = diagnostics.length;
  }
}

function focusProblemLocation(diag) {
  if (!diag) return;
  if (monacoEditor) {
    monacoEditor.focus();
    monacoEditor.revealLineInCenter(diag.startLineNumber);
    monacoEditor.setPosition({ lineNumber: diag.startLineNumber, column: diag.startColumn });
    return;
  }
  if (fallbackEditor) {
    fallbackEditor.focus();
    const index = getOffsetForLineColumn(fallbackEditor.value || '', diag.startLineNumber, diag.startColumn);
    fallbackEditor.setSelectionRange(index, index);
    updateFallbackCursorPosition();
  }
}

function findApparentCodeIssues(content, language) {
  const diagnostics = [];
  const stack = [];
  const lines = String(content || '').split('\n');
  let line = 1;
  let column = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;
  let blockCommentStart = null;
  let escaping = false;

  const openingBrackets = { '(': ')', '[': ']', '{': '}' };
  const closingBrackets = { ')': '(', ']': '[', '}': '{' };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1] || '';

    if (ch === '\n') {
      inLineComment = false;
      line += 1;
      column = 1;
      escaping = false;
      continue;
    }

    if (inLineComment) {
      column += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        blockCommentStart = null;
        i += 1;
        column += 2;
        continue;
      }
      column += 1;
      continue;
    }

    if (inSingleQuote || inDoubleQuote || inBacktick) {
      if (escaping) {
        escaping = false;
      } else if (ch === '\\') {
        escaping = true;
      } else if ((inSingleQuote && ch === '\'') || (inDoubleQuote && ch === '"') || (inBacktick && ch === '`')) {
        inSingleQuote = false;
        inDoubleQuote = false;
        inBacktick = false;
      }
      column += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      column += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      blockCommentStart = { line, column };
      i += 1;
      column += 2;
      continue;
    }

    if (ch === '\'') {
      inSingleQuote = true;
      column += 1;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      column += 1;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      column += 1;
      continue;
    }

    if (openingBrackets[ch]) {
      stack.push({ bracket: ch, line, column });
    } else if (closingBrackets[ch]) {
      const top = stack[stack.length - 1];
      if (!top || top.bracket !== closingBrackets[ch]) {
        diagnostics.push({
          severity: 'error',
          message: `Unexpected "${ch}"`,
          location: `Line ${line}, Col ${column}`,
          startLineNumber: line,
          startColumn: column,
          endLineNumber: line,
          endColumn: column + 1
        });
      } else {
        stack.pop();
      }
    }

    column += 1;
  }

  while (stack.length > 0) {
    const open = stack.pop();
    diagnostics.push({
      severity: 'error',
      message: `Missing closing "${openingBrackets[open.bracket]}"`,
      location: `Line ${open.line}, Col ${open.column}`,
      startLineNumber: open.line,
      startColumn: open.column,
      endLineNumber: open.line,
      endColumn: open.column + 1
    });
  }

  if (inBlockComment && blockCommentStart) {
    diagnostics.push({
      severity: 'warn',
      message: 'Unclosed block comment',
      location: `Line ${blockCommentStart.line}, Col ${blockCommentStart.column}`,
      startLineNumber: blockCommentStart.line,
      startColumn: blockCommentStart.column,
      endLineNumber: blockCommentStart.line,
      endColumn: blockCommentStart.column + 2
    });
  }

  if (inSingleQuote || inDoubleQuote || inBacktick) {
    const lastLineText = lines[lines.length - 1] || '';
    const endColumn = Math.max(1, lastLineText.length + 1);
    diagnostics.push({
      severity: 'error',
      message: 'Unclosed string literal',
      location: `Line ${lines.length}, Col ${endColumn}`,
      startLineNumber: lines.length,
      startColumn: endColumn,
      endLineNumber: lines.length,
      endColumn: endColumn + 1
    });
  }

  if (language === 'python' && content.includes('\t')) {
    diagnostics.push({
      severity: 'warn',
      message: 'Mixed indentation may cause errors in Python.',
      location: 'Detected tab characters in file',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2
    });
  }

  return diagnostics.slice(0, 100);
}

function getOffsetForLineColumn(text, lineNumber, columnNumber) {
  const lines = String(text || '').split('\n');
  let offset = 0;
  for (let i = 1; i < lineNumber && i <= lines.length; i++) {
    offset += lines[i - 1].length + 1;
  }
  return Math.max(0, Math.min(offset + Math.max(0, columnNumber - 1), text.length));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Copilot ───────────────────────────────────────────────
function setupCopilotPanel() {
  document.getElementById('btn-copilot-auth').addEventListener('click', async () => {
    const token = document.getElementById('copilot-token-input').value.trim();
    if (!token) { showToast('Enter a GitHub token', 'warning'); return; }
    try {
      await window.ftcIDE.copilot.setToken(token);
      await window.ftcIDE.settings.set('copilot.token', token);
      const ok = await window.ftcIDE.copilot.isAuthenticated();
      const msg = document.getElementById('copilot-status-msg');
      msg.className = `status-msg ${ok ? 'success' : 'error'}`;
      msg.textContent = ok ? '✓ Authenticated with GitHub Copilot' : '✗ Authentication failed';
      if (ok) showToast('Copilot authenticated!', 'success');
    } catch (e) {
      document.getElementById('copilot-status-msg').className = 'status-msg error';
      document.getElementById('copilot-status-msg').textContent = `Error: ${e.message}`;
    }
  });
}

// ── Bottom Panel ──────────────────────────────────────────
function bindBottomPanel() {
  document.querySelectorAll('.bottom-tab').forEach(tab => {
    tab.addEventListener('click', () => switchBottomTab(tab.dataset.tab));
  });
  document.getElementById('btn-clear-output').addEventListener('click', () => {
    const active = document.querySelector('.bottom-tab-content.active');
    if (active) {
      const logArea = active.querySelector('.log-area, .terminal-output, .problems-list');
      if (logArea) logArea.innerHTML = '';
      if (active.id === 'tab-problems' && state.activeFile) {
        activeDiagnosticsByFile.set(state.activeFile, []);
        previousActiveDiagnosticsCount = 0;
        if (monacoEditor) {
          const info = state.openFiles.get(state.activeFile);
          if (info?.model && monaco?.editor) {
            monaco.editor.setModelMarkers(info.model, 'active-issues', []);
          }
        }
        const count = document.getElementById('problem-count');
        if (count) count.textContent = '';
      }
    }
  });
  document.getElementById('btn-toggle-bottom').addEventListener('click', toggleBottomPanel);
}

function switchBottomTab(name) {
  document.querySelectorAll('.bottom-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.bottom-tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
}

function toggleBottomPanel() {
  const panel = document.getElementById('bottom-panel');
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? '' : 'none';
  document.body.classList.toggle('bottom-panel-hidden', !isHidden);
  const toggleBtn = document.getElementById('btn-toggle-bottom');
  if (toggleBtn) toggleBtn.textContent = isHidden ? '▼' : '▲';
  if (monacoEditor) setTimeout(() => monacoEditor.layout(), 50);
}

function appendOutput(msg, type) {
  const el = document.getElementById('output-log');
  const div = document.createElement('div');
  div.className = `log-line ${type || ''}`;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

// ── Modals ────────────────────────────────────────────────
function bindModals() {
  // Close buttons
  document.querySelectorAll('.modal-close, [data-modal-close]').forEach(btn => {
    const modal = btn.dataset.modal || btn.dataset.modalClose;
    btn.addEventListener('click', () => closeModal(modal));
  });

  // Click overlay to close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id.replace('modal-', ''));
    });
  });

  // New Project
  document.getElementById('btn-browse-project-path').addEventListener('click', async () => {
    const r = await window.ftcIDE.fs.openDialog({ properties: ['openDirectory'] });
    if (!r.canceled) document.getElementById('new-project-path').value = r.filePaths[0];
  });
  document.getElementById('btn-create-project').addEventListener('click', createNewProject);

  // Clone
  document.getElementById('btn-clone-browse').addEventListener('click', async () => {
    const r = await window.ftcIDE.fs.openDialog({ properties: ['openDirectory'] });
    if (!r.canceled) document.getElementById('clone-dest').value = r.filePaths[0];
  });
  document.getElementById('btn-do-clone').addEventListener('click', doClone);
}

function showModal(name) {
  const modal = document.getElementById(`modal-${name}`);
  if (modal) modal.style.display = 'flex';
}

function closeModal(name) {
  const modal = document.getElementById(`modal-${name}`);
  if (modal) modal.style.display = 'none';
}

async function createNewProject() {
  const name = document.getElementById('new-project-name').value.trim();
  const basePath = document.getElementById('new-project-path').value.trim();
  const pkg = document.getElementById('new-project-package').value.trim() || 'org.firstinspires.ftc.teamcode';

  if (!name) { showToast('Enter project name', 'warning'); return; }
  if (!basePath) { showToast('Choose project location', 'warning'); return; }

  const libs = {
    pedro: document.getElementById('lib-pedro').checked,
    nextftc: document.getElementById('lib-nextftc').checked,
    dashboard: document.getElementById('lib-dashboard').checked,
    solverslib: document.getElementById('lib-solverslib').checked,
    panels: document.getElementById('lib-panels').checked
  };

  closeModal('new-project');
  showToast('Creating project...', 'info');

  try {
    const result = await window.ftcIDE.project.create({ name, basePath, packageName: pkg, libs });
    await openProject(result.path);
    showToast(`Project "${name}" created!`, 'success');
  } catch (e) {
    showToast(`Failed: ${e.message}`, 'error');
  }
}

async function doClone() {
  const url = document.getElementById('clone-url').value.trim();
  const dest = document.getElementById('clone-dest').value.trim();
  const token = document.getElementById('clone-token').value.trim();

  if (!url || !dest) { showToast('Enter URL and destination', 'warning'); return; }

  closeModal('clone');
  showToast('Cloning...', 'info');

  try {
    await window.ftcIDE.git.clone(url, dest, token);
    const repoName = url.split('/').pop().replace('.git', '');
    await openProject(`${dest}/${repoName}`);
    showToast('Clone complete!', 'success');
  } catch (e) {
    showToast(`Clone failed: ${e.message}`, 'error');
  }
}

// ── Context Menu ──────────────────────────────────────────
function showContextMenu(event, items) {
  const menu = document.getElementById('context-menu');
  const list = document.getElementById('context-menu-list');
  list.innerHTML = '';

  for (const item of items) {
    const li = document.createElement('li');
    if (item.separator) {
      li.className = 'separator';
    } else {
      li.textContent = item.label;
      if (item.key) {
        const key = document.createElement('span');
        key.className = 'menu-key';
        key.textContent = item.key;
        li.appendChild(key);
      }
      li.addEventListener('click', () => {
        hideContextMenu();
        item.action && item.action();
      });
    }
    list.appendChild(li);
  }

  menu.style.display = 'block';
  menu.style.left = Math.min(event.clientX, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(event.clientY, window.innerHeight - 200) + 'px';
}

function hideContextMenu() {
  document.getElementById('context-menu').style.display = 'none';
}
document.addEventListener('click', hideContextMenu);
document.addEventListener('contextmenu', (e) => {
  // Only hide if not on a tree item (those handle their own)
  if (!e.target.closest('.tree-item')) hideContextMenu();
});

// ── Resize Handles ────────────────────────────────────────
function bindResizeHandles() {
  const handle = document.getElementById('sidebar-resize');
  let dragging = false, startX = 0, startWidth = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = document.getElementById('sidebar').offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const newWidth = Math.max(160, Math.min(480, startWidth + delta));
    document.getElementById('sidebar').style.width = newWidth + 'px';
    if (monacoEditor) monacoEditor.layout();
  });

  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// ── Keyboard Shortcuts ────────────────────────────────────
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 's') { e.preventDefault(); saveCurrentFile(); }
    if (ctrl && e.shiftKey && e.key === 'S') { e.preventDefault(); saveAllFiles(); }
    if (ctrl && e.key === 'w') { e.preventDefault(); if (state.activeFile) closeTab(state.activeFile); }
    if (ctrl && e.key === 'n') { e.preventDefault(); promptNewFile(); }
    if (ctrl && e.shiftKey && e.key === 'N') { e.preventDefault(); showModal('new-project'); }
    if (ctrl && e.key === 'b') { e.preventDefault(); document.getElementById('sidebar').style.display = document.getElementById('sidebar').style.display === 'none' ? '' : 'none'; }
    if (e.key === 'F6') { e.preventDefault(); triggerBuild('assemble'); }
    if (e.key === 'F7') { e.preventDefault(); triggerBuild('install'); }
    if (e.key === 'Escape') { hideContextMenu(); }
    // Tab switching
    if (ctrl && e.key === 'Tab') {
      e.preventDefault();
      const tabs = [...document.querySelectorAll('.editor-tab')];
      const idx = tabs.findIndex(t => t.dataset.path === state.activeFile);
      const nextIdx = (idx + 1) % tabs.length;
      if (tabs[nextIdx]) activateTab(tabs[nextIdx].dataset.path);
    }
  });
}

// ── Welcome Links ─────────────────────────────────────────
function bindWelcomeLinks() {
  const ids = ['wl-new-project','wl-open-project','wl-clone','wl-template-auto','wl-template-teleop','wl-template-pedro','wl-ftc-docs','wl-pedro-docs','wl-nextftc-docs'];
  const handlers = {
    'wl-new-project': (e) => { e.preventDefault(); showModal('new-project'); },
    'wl-open-project': (e) => { e.preventDefault(); browseForProject(); },
    'wl-clone': (e) => { e.preventDefault(); showModal('clone'); },
    'wl-template-auto': async (e) => { e.preventDefault(); selectedTemplateId = 'basic-autonomous'; showModal('template'); },
    'wl-template-teleop': async (e) => { e.preventDefault(); selectedTemplateId = 'basic-teleop'; showModal('template'); },
    'wl-template-pedro': async (e) => { e.preventDefault(); selectedTemplateId = 'pedro-autonomous'; showModal('template'); },
    'wl-ftc-docs': (e) => { e.preventDefault(); window.ftcIDE.shell.openExternal('https://ftctechnh.github.io/ftc_app/doc/javadoc/index.html'); },
    'wl-pedro-docs': (e) => { e.preventDefault(); window.ftcIDE.shell.openExternal('https://pedropathing.com/'); },
    'wl-nextftc-docs': (e) => { e.preventDefault(); window.ftcIDE.shell.openExternal('https://github.com/rowan-mcalpin/nextftc'); }
  };
  for (const [id, fn] of Object.entries(handlers)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }
}

function bindMenuActions() {
  document.getElementById('btn-build').addEventListener('click', () => triggerBuild('assemble'));
  document.getElementById('btn-deploy').addEventListener('click', () => triggerBuild('install'));
  document.getElementById('btn-check-updates').addEventListener('click', () => manualCheckForUpdates());
  document.querySelectorAll('.top-menu-item[data-menu-action]').forEach((item) => {
    item.addEventListener('click', () => {
      handleMenuAction(item.dataset.menuAction);
      const parentMenu = item.closest('.top-menu-group');
      if (parentMenu) parentMenu.open = false;
    });
  });
  document.querySelectorAll('.top-menu-group').forEach((group) => {
    group.addEventListener('toggle', () => {
      if (!group.open) return;
      document.querySelectorAll('.top-menu-group').forEach((otherGroup) => {
        if (otherGroup !== group) otherGroup.open = false;
      });
    });
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('.top-menu-group')) return;
    document.querySelectorAll('.top-menu-group').forEach((group) => {
      group.open = false;
    });
  });
  document.getElementById('btn-split-editor').addEventListener('click', () => {
    showToast('Split editor view is not yet available', 'info');
  });
  document.getElementById('btn-close-all-tabs').addEventListener('click', () => {
    const paths = [...state.openFiles.keys()];
    paths.forEach(p => closeTab(p));
  });
}

// ── Window Controls (Linux frameless) ─────────────────────
function bindWindowControls() {
  const min = document.getElementById('btn-win-minimize');
  const max = document.getElementById('btn-win-maximize');
  const cls = document.getElementById('btn-win-close');
  if (min) min.addEventListener('click', () => window.ftcIDE.window.minimize());
  if (max) max.addEventListener('click', () => window.ftcIDE.window.maximize());
  if (cls) cls.addEventListener('click', () => window.ftcIDE.window.close());
}

// ── Input Prompt (replaces native prompt()) ───────────────
function showInputPrompt(title, defaultValue) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-input-prompt');
    const input   = document.getElementById('input-prompt-value');
    const btnOk   = document.getElementById('btn-input-prompt-ok');
    const btnCancel = document.getElementById('btn-input-prompt-cancel');
    const closeBtn  = overlay.querySelector('.modal-close');

    document.getElementById('input-prompt-title').textContent = title || 'Input';
    input.value = defaultValue || '';
    overlay.style.display = 'flex';
    input.focus();
    input.select();

    function finish(value) {
      overlay.style.display = 'none';
      cleanup();
      resolve(value);
    }
    function onOk() {
      const val = input.value.trim();
      finish(val || null);
    }
    function onCancel() { finish(null); }
    function onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    }
    function onOverlay(e) { if (e.target === overlay) onCancel(); }
    function cleanup() {
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      overlay.removeEventListener('click', onOverlay);
    }

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    overlay.addEventListener('click', onOverlay);
  });
}

function applyColorMode(mode) {
  if (mode === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

// ── File Operations Helpers ───────────────────────────────
async function promptNewFile() {
  if (!state.teamCodePath && !state.projectPath) {
    showToast('Open a project first', 'warning');
    return;
  }
  const name = await showInputPrompt('New File Name');
  if (!name) return;
  const dir = state.teamCodePath || state.projectPath;
  const filePath = `${dir}/${name}`;
  try {
    await window.ftcIDE.fs.createFile(filePath, '');
    await refreshFileTree();
    await openFile(filePath);
  } catch (err) {
    showToast(`Failed to create file: ${err.message}`);
  }
}

async function promptNewFileIn(dir) {
  const name = await showInputPrompt('New File Name');
  if (!name) return;
  const filePath = `${dir}/${name}`;
  try {
    await window.ftcIDE.fs.createFile(filePath, '');
    await refreshFileTree();
    await openFile(filePath);
  } catch (err) {
    showToast(`Failed to create file: ${err.message}`);
  }
}

async function promptNewFolder() {
  if (!state.teamCodePath && !state.projectPath) {
    showToast('Open a project first', 'warning');
    return;
  }
  const name = await showInputPrompt('New Folder Name');
  if (!name) return;
  const dir = state.teamCodePath || state.projectPath;
  try {
    await window.ftcIDE.fs.createDir(`${dir}/${name}`);
    await refreshFileTree();
  } catch (err) {
    showToast(`Failed to create folder: ${err.message}`);
  }
}

async function promptNewFolderIn(dir) {
  const name = await showInputPrompt('New Folder Name');
  if (!name) return;
  try {
    await window.ftcIDE.fs.createDir(`${dir}/${name}`);
    await refreshFileTree();
  } catch (err) {
    showToast(`Failed to create folder: ${err.message}`);
  }
}

async function promptRename(filePath, oldName) {
  const newName = await showInputPrompt('Rename', oldName);
  if (!newName || newName === oldName) return;
  const newPath = filePath.replace(oldName, newName);
  try {
    await window.ftcIDE.fs.rename(filePath, newPath);
    if (state.openFiles.has(filePath)) {
      closeTab(filePath);
      await openFile(newPath);
    }
    await refreshFileTree();
  } catch (err) {
    showToast(`Rename failed: ${err.message}`, 'error');
  }
}

async function confirmDelete(filePath) {
  if (!confirm(`Delete ${filePath.split(/[/\\]/).pop()}?`)) return;
  await window.ftcIDE.fs.deleteFile(filePath);
  if (state.openFiles.has(filePath)) closeTab(filePath);
  refreshFileTree();
}

// ── Font Size ─────────────────────────────────────────────
function changeEditorFontSize(delta) {
  if (delta === 0) { state.editorFontSize = 14; }
  else { state.editorFontSize = Math.max(10, Math.min(28, state.editorFontSize + delta)); }
  if (monacoEditor) monacoEditor.updateOptions({ fontSize: state.editorFontSize });
  applyFallbackEditorSettings();
}

// ── Toast ─────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ'}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// ── Utility ───────────────────────────────────────────────
function setInputVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.type === 'checkbox') el.checked = Boolean(val);
  else el.value = val;
}

// ── Auto-Update UI ────────────────────────────────────────────────────────────

/** Wire up the update modal buttons once the DOM is ready. */
function initUpdateUI() {
  const installBtn = document.getElementById('btn-update-install');
  const statusBadge = document.getElementById('status-update');

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      installBtn.disabled = true;
      document.getElementById('btn-update-later').disabled = true;
      const progressArea = document.getElementById('update-progress-area');
      if (progressArea) progressArea.classList.remove('hidden');
      setUpdateProgress('Starting update…');

      const result = await window.ftcIDE.update.install();
      if (result && !result.success) {
        showToast(`Update failed: ${result.error}`, 'error');
        installBtn.disabled = false;
        document.getElementById('btn-update-later').disabled = false;
        if (progressArea) progressArea.classList.add('hidden');
      }
      // On success the app relaunches, so nothing more to do here.
    });
  }

  // Status-bar badge also opens the update modal.
  if (statusBadge) {
    statusBadge.addEventListener('click', () => showModal('update'));
  }
}

/**
 * Called when the main process detects a new commit on origin.
 * @param {{ hasUpdate, currentCommit, latestCommit, changelog }} info
 */
function showUpdateNotification(info, { silent = false } = {}) {
  if (!info || !info.hasUpdate) return;

  // Populate modal content.
  const versionInfo = document.getElementById('update-version-info');
  if (versionInfo) {
    versionInfo.textContent =
      `Current: ${info.currentCommit || 'unknown'}  →  Latest: ${info.latestCommit || 'unknown'}`;
  }

  const changelogEl = document.getElementById('update-changelog');
  if (changelogEl) {
    changelogEl.innerHTML = '';
    const entries = Array.isArray(info.changelog) ? info.changelog : [];
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'New commits available.';
      changelogEl.appendChild(li);
    } else {
      entries.forEach(({ hash, subject, author, date }) => {
        const li = document.createElement('li');
        li.style.marginBottom = '4px';
        li.innerHTML = `<span style="font-family:monospace;color:var(--accent-blue)">${hash}</span> `
          + `<span>${escapeHtml(subject)}</span> `
          + `<span style="color:var(--fg-dim);font-size:11px">(${escapeHtml(author)}, ${date})</span>`;
        changelogEl.appendChild(li);
      });
    }
  }

  // Show badge in status bar.
  const badge = document.getElementById('status-update');
  if (badge) badge.classList.remove('hidden');

  // Show toast with action button.
  if (!silent) {
    showToastWithAction(
      '↑ FTC IDE update available',
      'Update now',
      () => showModal('update'),
      'info'
    );
  }
}

/** Update the progress message inside the update modal. */
function setUpdateProgress(msg) {
  const el = document.getElementById('update-progress-msg');
  if (el) el.textContent = msg;
}

/** Triggered by Help → Check for Updates menu item. */
async function manualCheckForUpdates() {
  showToast('Checking for updates…', 'info');
  const result = await window.ftcIDE.update.check();
  if (result.error) {
    showToast(`Update check failed: ${result.error}`, 'error');
    return;
  }
  if (result.hasUpdate) {
    showUpdateNotification(result);
    showModal('update');
  } else {
    showToast('FTC IDE is up to date ✓', 'success');
  }
}

async function restoreUpdateStatus() {
  try {
    const status = await window.ftcIDE.update.status();
    if (status && status.updateAvailable) {
      showUpdateNotification({
        hasUpdate: true,
        currentCommit: status.currentCommit,
        latestCommit: status.latestCommit,
        changelog: status.changelog
      }, { silent: true });
    }
  } catch (_) {
    // Best-effort restore; ignore errors.
  }
}

/** Show a toast that includes a clickable action label. */
function showToastWithAction(message, actionLabel, onAction, type = 'info') {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ'}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    <button class="toast-action btn-link" style="background:none;border:none;color:var(--accent-blue);cursor:pointer;font-size:12px;padding:0 6px;text-decoration:underline">${escapeHtml(actionLabel)}</button>
    <button class="toast-close">✕</button>`;

  toast.querySelector('.toast-action').addEventListener('click', () => {
    toast.remove();
    onAction();
  });
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 12000);
}

/** Minimal HTML-escape used when setting innerHTML. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Home Screen App Launcher ──────────────────────────────
function bindHomeScreen() {
  const handlers = {
    'app-subsystem-builder': () => openAppView('subsystem-builder'),
    'app-command-builder':   () => openAppView('command-builder'),
    'app-opmode-builder':    () => openAppView('opmode-builder'),
    'app-pedro-visualizer':  () => openAppView('path-visualizer'),
    'app-ftc-dashboard':     () => openAppView('ftc-dashboard'),
    'app-panels-view':       () => openAppView('panels'),
    'app-template-gallery':  () => { switchPanel('templates'); showModal('template'); },
    'app-open-editor':       () => browseForProject(),
    'app-device-manager':    () => switchPanel('devices'),
    'app-git-manager':       () => switchPanel('git'),
    'app-new-project':       () => showModal('new-project'),
    'app-learn':             () => window.ftcIDE.shell.openExternal('https://ftctechnh.github.io/ftc_app/doc/javadoc/index.html'),
    'app-pedro-constants':   () => openAppView('pedro-constants'),
    'app-lut-manager':       () => openAppView('lut-manager'),
    'app-interplut-manager': () => openAppView('interplut-manager'),
    'app-enum-manager':      () => openAppView('enum-manager'),
    'app-object-manager':    () => openAppView('object-manager'),
    'home-open-project':     () => browseForProject(),
    'home-clone-repo':       () => showModal('clone')
  };
  for (const [id, fn] of Object.entries(handlers)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }
}

function openAppView(name) {
  // Hide welcome & editor
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('monaco-editor-wrapper').style.display = 'none';
  document.getElementById('fallback-editor-wrapper').style.display = 'none';
  // Hide all app views
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  // Show target
  const view = document.getElementById(`app-view-${name}`);
  if (view) view.classList.add('active');

  if (name === 'subsystem-builder') initSubsystemBuilder();
  if (name === 'command-builder') initCommandBuilder();
  if (name === 'opmode-builder') initOpModeBuilder();
  if (name === 'path-visualizer') initPathVisualizer();
  if (name === 'ftc-dashboard') initDashboardView();
  if (name === 'panels') initPanelsView();
  if (name === 'pedro-constants') initPedroConstantsManager();
  if (name === 'lut-manager') initLUTManager();
  if (name === 'interplut-manager') initInterpLUTManager();
  if (name === 'enum-manager') initEnumManager();
  if (name === 'object-manager') initObjectManager();
}

function closeAppView() {
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  if (state.activeFile) {
    document.getElementById('monaco-editor-wrapper').style.display = monacoEditor ? '' : 'none';
    document.getElementById('fallback-editor-wrapper').style.display = monacoEditor ? 'none' : '';
  } else {
    document.getElementById('welcome-screen').style.display = '';
  }
}

// ── Subsystem Builder ─────────────────────────────────────
const subsystemBlocks = [
  { cat: 'hardware', label: 'DcMotor', code: 'private DcMotor {{name}};', init: '{{name}} = hardwareMap.get(DcMotor.class, "{{hwName}}");', defaults: { name: 'motor', hwName: 'motor0' } },
  { cat: 'hardware', label: 'Servo', code: 'private Servo {{name}};', init: '{{name}} = hardwareMap.get(Servo.class, "{{hwName}}");', defaults: { name: 'servo', hwName: 'servo0' } },
  { cat: 'hardware', label: 'CRServo', code: 'private CRServo {{name}};', init: '{{name}} = hardwareMap.get(CRServo.class, "{{hwName}}");', defaults: { name: 'crServo', hwName: 'crServo0' } },
  { cat: 'hardware', label: 'Distance Sensor', code: 'private DistanceSensor {{name}};', init: '{{name}} = hardwareMap.get(DistanceSensor.class, "{{hwName}}");', defaults: { name: 'distSensor', hwName: 'distSensor0' } },
  { cat: 'hardware', label: 'Touch Sensor', code: 'private TouchSensor {{name}};', init: '{{name}} = hardwareMap.get(TouchSensor.class, "{{hwName}}");', defaults: { name: 'touchSensor', hwName: 'touchSensor0' } },
  { cat: 'hardware', label: 'Color Sensor', code: 'private ColorSensor {{name}};', init: '{{name}} = hardwareMap.get(ColorSensor.class, "{{hwName}}");', defaults: { name: 'colorSensor', hwName: 'colorSensor0' } },
  { cat: 'method', label: 'Set Motor Power', code: 'public void {{methodName}}(double power) {\n    {{motor}}.setPower(power);\n}', defaults: { methodName: 'setDrivePower', motor: 'motor' } },
  { cat: 'method', label: 'Set Servo Position', code: 'public void {{methodName}}(double pos) {\n    {{servo}}.setPosition(pos);\n}', defaults: { methodName: 'setArmPosition', servo: 'servo' } },
  { cat: 'method', label: 'Get Distance', code: 'public double {{methodName}}() {\n    return {{sensor}}.getDistance(DistanceUnit.CM);\n}', defaults: { methodName: 'getDistance', sensor: 'distSensor' } },
  { cat: 'method', label: 'Is Pressed', code: 'public boolean {{methodName}}() {\n    return {{sensor}}.isPressed();\n}', defaults: { methodName: 'isLimitReached', sensor: 'touchSensor' } },
  { cat: 'method', label: 'Stop All', code: 'public void stop() {\n    {{body}}\n}', defaults: { body: '// Stop all motors' } },
  { cat: 'method', label: 'Custom Method', code: 'public {{returnType}} {{methodName}}({{params}}) {\n    {{body}}\n}', defaults: { returnType: 'void', methodName: 'doSomething', params: '', body: '// TODO' } },
];

let sbBlocks = [];
let sbIdCounter = 0;
let sbInitialized = false;

function initSubsystemBuilder() {
  if (sbInitialized) { updateSBPreview(); return; }
  sbInitialized = true;

  const palette = document.getElementById('sb-palette');
  palette.innerHTML = '';
  const categories = [...new Set(subsystemBlocks.map(b => b.cat))];
  for (const cat of categories) {
    const title = document.createElement('div');
    title.className = 'block-palette-title';
    title.textContent = cat.toUpperCase();
    palette.appendChild(title);

    for (const block of subsystemBlocks.filter(b => b.cat === cat)) {
      const el = document.createElement('div');
      el.className = 'block-item';
      el.setAttribute('data-category', block.cat);
      el.innerHTML = `<div class="block-label">${escapeHtml(block.label)}</div>`;
      el.addEventListener('dblclick', () => addSBBlock(block));
      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify(block));
        e.dataTransfer.effectAllowed = 'copy';
      });
      palette.appendChild(el);
    }
  }

  const workspace = document.getElementById('sb-workspace');
  workspace.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; workspace.classList.add('drag-over'); });
  workspace.addEventListener('dragleave', () => workspace.classList.remove('drag-over'));
  workspace.addEventListener('drop', (e) => {
    e.preventDefault();
    workspace.classList.remove('drag-over');
    try { addSBBlock(JSON.parse(e.dataTransfer.getData('text/plain'))); } catch(err) {}
  });

  document.getElementById('sb-close').addEventListener('click', closeAppView);
  document.getElementById('sb-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(generateSubsystemCode());
    showToast('Subsystem code copied', 'success');
  });
  document.getElementById('sb-insert-code').addEventListener('click', () => {
    insertGeneratedCode(generateSubsystemCode());
  });
  document.getElementById('sb-refresh').addEventListener('click', updateSBPreview);
  document.getElementById('sb-class-name').addEventListener('input', updateSBPreview);

  renderSBWorkspace();
  updateSBPreview();
}

function addSBBlock(block) {
  sbBlocks.push({ ...block, id: ++sbIdCounter, params: { ...block.defaults } });
  renderSBWorkspace();
  updateSBPreview();
}

function renderSBWorkspace() {
  const workspace = document.getElementById('sb-workspace');
  const hint = document.getElementById('sb-hint');
  workspace.querySelectorAll('.placed-block').forEach(el => el.remove());

  if (sbBlocks.length === 0) { hint.classList.remove('hidden'); return; }
  hint.classList.add('hidden');

  sbBlocks.forEach((block) => {
    const el = document.createElement('div');
    el.className = 'placed-block';
    el.setAttribute('data-category', block.cat);

    let paramHtml = '';
    for (const [key, val] of Object.entries(block.params)) {
      paramHtml += ` <input type="text" value="${escapeHtml(val)}" data-param="${key}" title="${key}" />`;
    }

    el.innerHTML = `
      <span class="block-text"><strong>${escapeHtml(block.label)}</strong>${paramHtml}</span>
      <button class="remove-block" title="Remove">✕</button>
    `;

    el.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => { block.params[input.dataset.param] = input.value; updateSBPreview(); });
    });
    el.querySelector('.remove-block').addEventListener('click', () => {
      sbBlocks = sbBlocks.filter(b => b.id !== block.id);
      renderSBWorkspace();
      updateSBPreview();
    });
    workspace.appendChild(el);
  });
}

function updateSBPreview() {
  const el = document.getElementById('sb-preview');
  if (el) el.textContent = generateSubsystemCode();
}

function generateSubsystemCode() {
  const className = document.getElementById('sb-class-name').value || 'MySubsystem';
  const hardware = sbBlocks.filter(b => b.cat === 'hardware');
  const methods = sbBlocks.filter(b => b.cat === 'method');

  let code = '// Generated by ChuckleIDE Subsystem Builder\n';
  code += 'package org.firstinspires.ftc.teamcode;\n\n';
  code += 'import com.qualcomm.robotcore.hardware.*;\n';
  code += 'import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;\n\n';
  code += `public class ${className} {\n`;

  // Hardware fields
  for (const h of hardware) {
    let decl = h.code;
    for (const [k, v] of Object.entries(h.params)) decl = decl.replaceAll(`{{${k}}}`, v);
    code += `    ${decl}\n`;
  }

  // Constructor
  code += `\n    public ${className}(HardwareMap hardwareMap) {\n`;
  for (const h of hardware) {
    if (h.init) {
      let init = h.init;
      for (const [k, v] of Object.entries(h.params)) init = init.replaceAll(`{{${k}}}`, v);
      code += `        ${init}\n`;
    }
  }
  code += '    }\n';

  // Methods
  for (const m of methods) {
    let body = m.code;
    for (const [k, v] of Object.entries(m.params)) body = body.replaceAll(`{{${k}}}`, v);
    code += `\n    ${body.split('\n').join('\n    ')}\n`;
  }

  code += '}\n';
  return code;
}

// ── Command Builder ──────────────────────────────────────
const commandBlocks = [
  { cat: 'action', label: 'Call Subsystem Method', code: '{{subsystem}}.{{method}}({{args}});', defaults: { subsystem: 'subsystem', method: 'doSomething', args: '' } },
  { cat: 'action', label: 'Set Motor Power', code: '{{subsystem}}.setPower({{value}});', defaults: { subsystem: 'subsystem', value: '1.0' } },
  { cat: 'action', label: 'Set Servo Position', code: '{{subsystem}}.setPosition({{value}});', defaults: { subsystem: 'subsystem', value: '0.5' } },
  { cat: 'control', label: 'Wait (ms)', code: 'sleep({{ms}});', defaults: { ms: '1000' } },
  { cat: 'control', label: 'While Condition', code: 'while ({{condition}}) {\n    {{body}}\n}', defaults: { condition: '!isStopRequested()', body: '// loop' } },
  { cat: 'control', label: 'If Condition', code: 'if ({{condition}}) {\n    {{body}}\n}', defaults: { condition: 'true', body: '// action' } },
  { cat: 'finish', label: 'Set Finished Condition', code: '// Finished when: {{condition}}', defaults: { condition: 'timer.seconds() > 2.0' } },
  { cat: 'telemetry', label: 'Telemetry Add', code: 'telemetry.addData("{{key}}", {{value}});', defaults: { key: 'Status', value: '"Running"' } },
  { cat: 'telemetry', label: 'Telemetry Update', code: 'telemetry.update();', defaults: {} },
];

let cmbBlocks = [];
let cmbIdCounter = 0;
let cmbInitialized = false;

function initCommandBuilder() {
  if (cmbInitialized) { updateCMBPreview(); return; }
  cmbInitialized = true;

  const palette = document.getElementById('cmb-palette');
  palette.innerHTML = '';
  const categories = [...new Set(commandBlocks.map(b => b.cat))];
  for (const cat of categories) {
    const title = document.createElement('div');
    title.className = 'block-palette-title';
    title.textContent = cat.toUpperCase();
    palette.appendChild(title);

    for (const block of commandBlocks.filter(b => b.cat === cat)) {
      const el = document.createElement('div');
      el.className = 'block-item';
      el.setAttribute('data-category', block.cat);
      el.innerHTML = `<div class="block-label">${escapeHtml(block.label)}</div>`;
      el.addEventListener('dblclick', () => addCMBBlock(block));
      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify(block));
        e.dataTransfer.effectAllowed = 'copy';
      });
      palette.appendChild(el);
    }
  }

  const workspace = document.getElementById('cmb-workspace');
  workspace.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; workspace.classList.add('drag-over'); });
  workspace.addEventListener('dragleave', () => workspace.classList.remove('drag-over'));
  workspace.addEventListener('drop', (e) => {
    e.preventDefault();
    workspace.classList.remove('drag-over');
    try { addCMBBlock(JSON.parse(e.dataTransfer.getData('text/plain'))); } catch(err) {}
  });

  document.getElementById('cmb-close').addEventListener('click', closeAppView);
  document.getElementById('cmb-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(generateCommandCode());
    showToast('Command code copied', 'success');
  });
  document.getElementById('cmb-insert-code').addEventListener('click', () => {
    insertGeneratedCode(generateCommandCode());
  });
  document.getElementById('cmb-refresh').addEventListener('click', updateCMBPreview);
  document.getElementById('cmb-class-name').addEventListener('input', updateCMBPreview);
  document.getElementById('cmb-subsystem').addEventListener('input', updateCMBPreview);

  renderCMBWorkspace();
  updateCMBPreview();
}

function addCMBBlock(block) {
  cmbBlocks.push({ ...block, id: ++cmbIdCounter, params: { ...block.defaults } });
  renderCMBWorkspace();
  updateCMBPreview();
}

function renderCMBWorkspace() {
  const workspace = document.getElementById('cmb-workspace');
  const hint = document.getElementById('cmb-hint');
  workspace.querySelectorAll('.placed-block').forEach(el => el.remove());

  if (cmbBlocks.length === 0) { hint.classList.remove('hidden'); return; }
  hint.classList.add('hidden');

  cmbBlocks.forEach((block) => {
    const el = document.createElement('div');
    el.className = 'placed-block';
    el.setAttribute('data-category', block.cat);

    let paramHtml = '';
    for (const [key, val] of Object.entries(block.params)) {
      paramHtml += ` <input type="text" value="${escapeHtml(val)}" data-param="${key}" title="${key}" />`;
    }

    el.innerHTML = `
      <span class="block-text"><strong>${escapeHtml(block.label)}</strong>${paramHtml}</span>
      <button class="remove-block" title="Remove">✕</button>
    `;

    el.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => { block.params[input.dataset.param] = input.value; updateCMBPreview(); });
    });
    el.querySelector('.remove-block').addEventListener('click', () => {
      cmbBlocks = cmbBlocks.filter(b => b.id !== block.id);
      renderCMBWorkspace();
      updateCMBPreview();
    });
    workspace.appendChild(el);
  });
}

function updateCMBPreview() {
  const el = document.getElementById('cmb-preview');
  if (el) el.textContent = generateCommandCode();
}

function generateCommandCode() {
  const className = document.getElementById('cmb-class-name').value || 'MyCommand';
  const subsystem = document.getElementById('cmb-subsystem').value || 'MySubsystem';

  const actions = cmbBlocks.filter(b => b.cat === 'action' || b.cat === 'control' || b.cat === 'telemetry');
  const finishBlocks = cmbBlocks.filter(b => b.cat === 'finish');

  let code = '// Generated by ChuckleIDE Command Builder\n';
  code += 'package org.firstinspires.ftc.teamcode;\n\n';
  code += 'import com.qualcomm.robotcore.util.ElapsedTime;\n\n';
  code += `public class ${className} {\n`;
  code += `    private ${subsystem} subsystem;\n`;
  code += '    private ElapsedTime timer = new ElapsedTime();\n\n';
  code += `    public ${className}(${subsystem} subsystem) {\n`;
  code += '        this.subsystem = subsystem;\n';
  code += '    }\n\n';

  // initialize
  code += '    public void initialize() {\n';
  code += '        timer.reset();\n';
  code += '    }\n\n';

  // execute
  code += '    public void execute() {\n';
  for (const block of actions) {
    let line = block.code;
    for (const [k, v] of Object.entries(block.params)) line = line.replaceAll(`{{${k}}}`, v);
    for (const l of line.split('\n')) code += `        ${l}\n`;
  }
  code += '    }\n\n';

  // isFinished
  code += '    public boolean isFinished() {\n';
  if (finishBlocks.length > 0) {
    const cond = finishBlocks[0].params.condition || 'false';
    code += `        return ${cond};\n`;
  } else {
    code += '        return false;\n';
  }
  code += '    }\n\n';

  // end
  code += '    public void end() {\n';
  code += '        // Clean up when command finishes\n';
  code += '    }\n';
  code += '}\n';
  return code;
}

// ── OpMode Builder (Paths + Commands) ─────────────────────
let obSteps = [];
let obIdCounter = 0;
let obInitialized = false;

function initOpModeBuilder() {
  if (obInitialized) { updateOBPreview(); return; }
  obInitialized = true;

  document.getElementById('ob-close').addEventListener('click', closeAppView);
  document.getElementById('ob-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(generateOpModeCode());
    showToast('OpMode code copied', 'success');
  });
  document.getElementById('ob-insert-code').addEventListener('click', () => {
    insertGeneratedCode(generateOpModeCode());
  });
  document.getElementById('ob-refresh').addEventListener('click', updateOBPreview);
  document.getElementById('ob-class-name').addEventListener('input', updateOBPreview);
  document.getElementById('ob-start-x').addEventListener('input', updateOBPreview);
  document.getElementById('ob-start-y').addEventListener('input', updateOBPreview);
  document.getElementById('ob-start-heading').addEventListener('input', updateOBPreview);

  document.getElementById('ob-add-path').addEventListener('click', () => {
    obSteps.push({
      id: ++obIdCounter,
      type: 'path',
      interpolation: 'linear',
      waypoints: [
        { x: 0, y: 0, heading: 0 },
        { x: 24, y: 0, heading: 0 }
      ],
      controlPoints: []
    });
    renderOBSequence();
    updateOBPreview();
  });

  document.getElementById('ob-add-command').addEventListener('click', () => {
    obSteps.push({
      id: ++obIdCounter,
      type: 'command',
      commandName: 'MyCommand',
      subsystemName: 'MySubsystem'
    });
    renderOBSequence();
    updateOBPreview();
  });

  document.getElementById('ob-add-parallel').addEventListener('click', () => {
    obSteps.push({
      id: ++obIdCounter,
      type: 'parallel',
      commands: ['CommandA', 'CommandB']
    });
    renderOBSequence();
    updateOBPreview();
  });

  document.getElementById('ob-add-wait').addEventListener('click', () => {
    obSteps.push({
      id: ++obIdCounter,
      type: 'wait',
      ms: 1000
    });
    renderOBSequence();
    updateOBPreview();
  });

  renderOBSequence();
  updateOBPreview();
}

function renderOBSequence() {
  const container = document.getElementById('ob-sequence');
  const hint = document.getElementById('ob-hint');
  container.querySelectorAll('.ob-step').forEach(el => el.remove());

  if (obSteps.length === 0) { hint.classList.remove('hidden'); return; }
  hint.classList.add('hidden');

  obSteps.forEach((step, index) => {
    const el = document.createElement('div');
    el.className = 'ob-step';

    if (step.type === 'path') {
      if (!step.controlPoints) step.controlPoints = [];
      if (!step.interpolation) step.interpolation = 'linear';
      el.innerHTML = `
        <div class="ob-step-header">
          <span class="ob-step-icon">🗺️</span>
          <strong>Follow Path</strong>
          <span class="ob-step-num">#${index + 1}</span>
          <button class="remove-block" title="Remove">✕</button>
        </div>
        <div class="ob-step-body">
          <div class="ob-step-row">
            <label>Heading Interpolation:</label>
            <select class="text-input ob-interp-select">
              <option value="linear" ${step.interpolation === 'linear' ? 'selected' : ''}>Linear</option>
              <option value="constant" ${step.interpolation === 'constant' ? 'selected' : ''}>Constant</option>
              <option value="tangential" ${step.interpolation === 'tangential' ? 'selected' : ''}>Tangential</option>
            </select>
          </div>
          <div class="ob-path-section-label">Waypoints</div>
          ${step.waypoints.map((wp, wi) => `
            <div class="ob-waypoint">
              <span>P${wi}:</span>
              <input type="number" value="${wp.x}" data-wi="${wi}" data-field="x" title="X" class="text-input tiny" />
              <input type="number" value="${wp.y}" data-wi="${wi}" data-field="y" title="Y" class="text-input tiny" />
              <input type="number" value="${wp.heading}" data-wi="${wi}" data-field="heading" title="Heading°" class="text-input tiny" />
              <button class="remove-block tiny" data-remove-wp="${wi}">✕</button>
            </div>
          `).join('')}
          <button class="btn-secondary tiny ob-add-wp">+ Waypoint</button>
          <div class="ob-path-section-label">Control Points (for Bézier curves)</div>
          ${step.controlPoints.map((cp, ci) => `
            <div class="ob-waypoint ob-control-point">
              <span>C${ci}:</span>
              <input type="number" value="${cp.x}" data-ci="${ci}" data-field="x" title="X" class="text-input tiny" />
              <input type="number" value="${cp.y}" data-ci="${ci}" data-field="y" title="Y" class="text-input tiny" />
              <button class="remove-block tiny" data-remove-cp="${ci}">✕</button>
            </div>
          `).join('')}
          <button class="btn-secondary tiny ob-add-cp">+ Control Point</button>
        </div>
      `;

      el.querySelector('.ob-interp-select').addEventListener('change', (e) => {
        step.interpolation = e.target.value;
        updateOBPreview();
      });
      el.querySelectorAll('.ob-waypoint:not(.ob-control-point) input').forEach(input => {
        input.addEventListener('input', () => {
          const wi = parseInt(input.dataset.wi);
          step.waypoints[wi][input.dataset.field] = parseFloat(input.value) || 0;
          updateOBPreview();
        });
      });
      el.querySelectorAll('.ob-control-point input').forEach(input => {
        input.addEventListener('input', () => {
          const ci = parseInt(input.dataset.ci);
          step.controlPoints[ci][input.dataset.field] = parseFloat(input.value) || 0;
          updateOBPreview();
        });
      });
      el.querySelectorAll('[data-remove-wp]').forEach(btn => {
        btn.addEventListener('click', () => {
          step.waypoints.splice(parseInt(btn.dataset.removeWp), 1);
          renderOBSequence();
          updateOBPreview();
        });
      });
      el.querySelectorAll('[data-remove-cp]').forEach(btn => {
        btn.addEventListener('click', () => {
          step.controlPoints.splice(parseInt(btn.dataset.removeCp), 1);
          renderOBSequence();
          updateOBPreview();
        });
      });
      el.querySelector('.ob-add-wp').addEventListener('click', () => {
        const last = step.waypoints[step.waypoints.length - 1] || { x: 0, y: 0, heading: 0 };
        step.waypoints.push({ x: last.x + 12, y: last.y, heading: last.heading });
        renderOBSequence();
        updateOBPreview();
      });
      el.querySelector('.ob-add-cp').addEventListener('click', () => {
        const first = step.waypoints[0] || { x: 0, y: 0 };
        const last = step.waypoints[step.waypoints.length - 1] || { x: 24, y: 0 };
        step.controlPoints.push({ x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 + 12 });
        renderOBSequence();
        updateOBPreview();
      });
    } else if (step.type === 'command') {
      el.innerHTML = `
        <div class="ob-step-header">
          <span class="ob-step-icon">📦</span>
          <strong>Run Command</strong>
          <span class="ob-step-num">#${index + 1}</span>
          <button class="remove-block" title="Remove">✕</button>
        </div>
        <div class="ob-step-body">
          <div class="ob-step-row">
            <label>Command:</label>
            <input type="text" value="${escapeHtml(step.commandName)}" data-field="commandName" class="text-input" />
          </div>
          <div class="ob-step-row">
            <label>Subsystem:</label>
            <input type="text" value="${escapeHtml(step.subsystemName)}" data-field="subsystemName" class="text-input" />
          </div>
        </div>
      `;
      el.querySelectorAll('.ob-step-body input').forEach(input => {
        input.addEventListener('input', () => { step[input.dataset.field] = input.value; updateOBPreview(); });
      });
    } else if (step.type === 'parallel') {
      el.innerHTML = `
        <div class="ob-step-header">
          <span class="ob-step-icon">⏩</span>
          <strong>Parallel Commands</strong>
          <span class="ob-step-num">#${index + 1}</span>
          <button class="remove-block" title="Remove">✕</button>
        </div>
        <div class="ob-step-body">
          <div class="ob-step-row">
            <label>Commands (comma-separated):</label>
            <input type="text" value="${escapeHtml(step.commands.join(', '))}" data-field="commands" class="text-input" />
          </div>
        </div>
      `;
      el.querySelector('[data-field="commands"]').addEventListener('input', (e) => {
        step.commands = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
        updateOBPreview();
      });
    } else if (step.type === 'wait') {
      el.innerHTML = `
        <div class="ob-step-header">
          <span class="ob-step-icon">⏱️</span>
          <strong>Wait</strong>
          <span class="ob-step-num">#${index + 1}</span>
          <button class="remove-block" title="Remove">✕</button>
        </div>
        <div class="ob-step-body">
          <div class="ob-step-row">
            <label>Duration (ms):</label>
            <input type="number" value="${step.ms}" data-field="ms" class="text-input small" />
          </div>
        </div>
      `;
      el.querySelector('[data-field="ms"]').addEventListener('input', (e) => {
        step.ms = parseInt(e.target.value) || 0;
        updateOBPreview();
      });
    }

    // Remove step button
    el.querySelector('.ob-step-header .remove-block').addEventListener('click', () => {
      obSteps = obSteps.filter(s => s.id !== step.id);
      renderOBSequence();
      updateOBPreview();
    });

    container.appendChild(el);
  });
}

function updateOBPreview() {
  const el = document.getElementById('ob-preview');
  if (el) el.textContent = generateOpModeCode();
}

function generateOpModeCode() {
  const className = document.getElementById('ob-class-name').value || 'MyAutonomous';
  const startX = document.getElementById('ob-start-x').value || '0';
  const startY = document.getElementById('ob-start-y').value || '0';
  const startHeading = document.getElementById('ob-start-heading').value || '0';

  // Collect unique subsystems and commands
  const subsystems = new Set();
  const commands = new Set();
  for (const step of obSteps) {
    if (step.type === 'command') {
      subsystems.add(step.subsystemName);
      commands.add(step.commandName);
    }
    if (step.type === 'parallel') {
      step.commands.forEach(c => commands.add(c));
    }
  }

  // Check if any path has control points (needs BezierCurve import)
  const hasControlPoints = obSteps.some(s => s.type === 'path' && s.controlPoints && s.controlPoints.length > 0);

  let code = '// Generated by ChuckleIDE OpMode Builder\n';
  code += 'package org.firstinspires.ftc.teamcode;\n\n';
  code += 'import com.qualcomm.robotcore.eventloop.opmode.Autonomous;\n';
  code += 'import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;\n';
  code += 'import com.pedropathing.follower.Follower;\n';
  code += 'import com.pedropathing.localization.Pose;\n';
  code += 'import com.pedropathing.pathgen.BezierLine;\n';
  if (hasControlPoints) {
    code += 'import com.pedropathing.pathgen.BezierCurve;\n';
  }
  code += 'import com.pedropathing.pathgen.Path;\n';
  code += 'import com.pedropathing.pathgen.Point;\n\n';
  code += `@Autonomous(name = "${className}")\n`;
  code += `public class ${className} extends LinearOpMode {\n\n`;

  // Fields
  code += '    private Follower follower;\n';
  for (const sub of subsystems) {
    code += `    private ${sub} ${sub.charAt(0).toLowerCase() + sub.slice(1)};\n`;
  }
  code += '\n';

  // runOpMode
  code += '    @Override\n';
  code += '    public void runOpMode() {\n';
  code += `        follower = new Follower(hardwareMap);\n`;
  code += `        follower.setStartingPose(new Pose(${startX}, ${startY}, Math.toRadians(${startHeading})));\n\n`;

  for (const sub of subsystems) {
    const varName = sub.charAt(0).toLowerCase() + sub.slice(1);
    code += `        ${varName} = new ${sub}(hardwareMap);\n`;
  }
  code += '\n';

  // Build paths
  let pathIndex = 0;
  for (const step of obSteps) {
    if (step.type === 'path' && step.waypoints.length >= 2) {
      const cps = step.controlPoints || [];
      const first = step.waypoints[0];
      const last = step.waypoints[step.waypoints.length - 1];
      const interp = step.interpolation || 'linear';

      if (cps.length > 0) {
        // BezierCurve: start, control points..., end
        code += `        Path path${pathIndex} = new Path(\n`;
        code += `            new BezierCurve(\n`;
        code += `                new Point(${first.x}, ${first.y}, Point.CARTESIAN),\n`;
        for (const cp of cps) {
          code += `                new Point(${cp.x}, ${cp.y}, Point.CARTESIAN),\n`;
        }
        code += `                new Point(${last.x}, ${last.y}, Point.CARTESIAN)\n`;
        code += `            )\n`;
        code += `        );\n`;
      } else if (step.waypoints.length > 2) {
        // Multiple waypoints without explicit control points → use intermediate as control points in BezierCurve
        code += `        Path path${pathIndex} = new Path(\n`;
        code += `            new BezierCurve(\n`;
        for (let wi = 0; wi < step.waypoints.length; wi++) {
          const wp = step.waypoints[wi];
          code += `                new Point(${wp.x}, ${wp.y}, Point.CARTESIAN)${wi < step.waypoints.length - 1 ? ',' : ''}\n`;
        }
        code += `            )\n`;
        code += `        );\n`;
      } else {
        // Simple BezierLine for two waypoints
        code += `        Path path${pathIndex} = new Path(\n`;
        code += `            new BezierLine(\n`;
        code += `                new Point(${first.x}, ${first.y}, Point.CARTESIAN),\n`;
        code += `                new Point(${last.x}, ${last.y}, Point.CARTESIAN)\n`;
        code += `            )\n`;
        code += `        );\n`;
      }

      // Heading interpolation
      if (interp === 'constant') {
        code += `        path${pathIndex}.setConstantHeadingInterpolation(Math.toRadians(${first.heading}));\n\n`;
      } else if (interp === 'tangential') {
        code += `        path${pathIndex}.setTangentialHeadingInterpolation();\n\n`;
      } else {
        code += `        path${pathIndex}.setLinearHeadingInterpolation(Math.toRadians(${first.heading}), Math.toRadians(${last.heading}));\n\n`;
      }
      pathIndex++;
    }
  }

  code += '        waitForStart();\n\n';

  // Execute sequence
  pathIndex = 0;
  for (const step of obSteps) {
    if (step.type === 'path') {
      code += `        // Follow path ${pathIndex}\n`;
      code += `        follower.followPath(path${pathIndex});\n`;
      code += `        while (!isStopRequested() && follower.isBusy()) {\n`;
      code += `            follower.update();\n`;
      code += `        }\n\n`;
      pathIndex++;
    } else if (step.type === 'command') {
      const varName = step.subsystemName.charAt(0).toLowerCase() + step.subsystemName.slice(1);
      code += `        // Run command: ${step.commandName}\n`;
      code += `        ${step.commandName} cmd${step.id} = new ${step.commandName}(${varName});\n`;
      code += `        cmd${step.id}.initialize();\n`;
      code += `        while (!isStopRequested() && !cmd${step.id}.isFinished()) {\n`;
      code += `            cmd${step.id}.execute();\n`;
      code += `        }\n`;
      code += `        cmd${step.id}.end();\n\n`;
    } else if (step.type === 'parallel') {
      code += `        // Run parallel commands: ${step.commands.join(', ')}\n`;
      for (const cmd of step.commands) {
        code += `        // TODO: run ${cmd} in parallel\n`;
      }
      code += '\n';
    } else if (step.type === 'wait') {
      code += `        // Wait ${step.ms}ms\n`;
      code += `        sleep(${step.ms});\n\n`;
    }
  }

  code += '    }\n';
  code += '}\n';
  return code;
}

// ── Shared helper to insert generated code into editor ────
function insertGeneratedCode(code) {
  if (monacoEditor && state.activeFile) {
    const pos = monacoEditor.getPosition();
    monacoEditor.executeEdits('builder', [{
      range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
      text: code
    }]);
    closeAppView();
    showToast('Code inserted into editor', 'success');
  } else if (fallbackEditor && state.activeFile) {
    const start = fallbackEditor.selectionStart ?? fallbackEditor.value.length;
    const end = fallbackEditor.selectionEnd ?? start;
    fallbackEditor.setRangeText(code, start, end, 'end');
    const info = state.openFiles.get(state.activeFile);
    if (info) {
      info.modified = true;
      info.content = fallbackEditor.value;
      updateTabModified(state.activeFile, true);
    }
    updateOutline();
    closeAppView();
    showToast('Code inserted into editor', 'success');
  } else {
    navigator.clipboard.writeText(code);
    showToast('No file open — code copied to clipboard instead', 'info');
  }
}

// ── Path Visualizer (embedded pedropathing.com) ───────────
function initPathVisualizer() {
  document.getElementById('pv-close').addEventListener('click', closeAppView);
  document.getElementById('pv-open-external').addEventListener('click', () => {
    window.ftcIDE.shell.openExternal('https://visualizer.pedropathing.com');
  });
}

// ── FTC Dashboard View ────────────────────────────────────
let dashInitialized = false;

function isValidEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function initDashboardView() {
  if (dashInitialized) return;
  dashInitialized = true;

  document.getElementById('dash-close').addEventListener('click', closeAppView);
  document.getElementById('dash-connect').addEventListener('click', () => {
    const url = document.getElementById('dash-url').value.trim();
    if (!url) { showToast('Enter a dashboard URL', 'warning'); return; }
    if (!isValidEmbedUrl(url)) { showToast('Enter a valid HTTP/HTTPS URL', 'warning'); return; }
    const iframe = document.getElementById('dash-iframe');
    const placeholder = document.getElementById('dash-placeholder');
    iframe.src = url;
    iframe.style.display = '';
    placeholder.style.display = 'none';
    showToast('Connecting to FTC Dashboard...', 'info');
  });
}

// ── Panels View ───────────────────────────────────────────
let panelsInitialized = false;

function initPanelsView() {
  if (panelsInitialized) return;
  panelsInitialized = true;

  document.getElementById('panels-close').addEventListener('click', closeAppView);
  document.getElementById('panels-connect').addEventListener('click', () => {
    const url = document.getElementById('panels-url').value.trim();
    if (!url) { showToast('Enter a Panels URL', 'warning'); return; }
    if (!isValidEmbedUrl(url)) { showToast('Enter a valid HTTP/HTTPS URL', 'warning'); return; }
    const iframe = document.getElementById('panels-iframe');
    const placeholder = document.getElementById('panels-placeholder');
    iframe.src = url;
    iframe.style.display = '';
    placeholder.style.display = 'none';
    showToast('Connecting to Panels...', 'info');
  });
}

// ── Pedro Constants Manager ───────────────────────────────
let pcInitialized = false;

function initPedroConstantsManager() {
  if (pcInitialized) { updatePCPreview(); return; }
  pcInitialized = true;

  document.getElementById('pc-close').addEventListener('click', closeAppView);
  document.getElementById('pc-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(generatePedroConstantsCode());
    showToast('Pedro constants code copied', 'success');
  });
  document.getElementById('pc-insert-code').addEventListener('click', () => {
    insertGeneratedCode(generatePedroConstantsCode());
  });
  document.getElementById('pc-refresh').addEventListener('click', updatePCPreview);

  // Bind all inputs to update preview
  document.getElementById('pc-form').querySelectorAll('input').forEach(input => {
    input.addEventListener('input', updatePCPreview);
  });

  updatePCPreview();
}

function updatePCPreview() {
  const el = document.getElementById('pc-preview');
  if (el) el.textContent = generatePedroConstantsCode();
}

function generatePedroConstantsCode() {
  const v = (id) => document.getElementById(id).value || '0';

  let code = '// Generated by ChuckleIDE Pedro Constants Manager\n';
  code += 'package org.firstinspires.ftc.teamcode;\n\n';
  code += 'import com.pedropathing.localization.constants.ThreeWheelConstants;\n';
  code += 'import com.pedropathing.follower.FollowerConstants;\n\n';

  // FConstants
  code += '/**\n * PedroPathing follower constants.\n * Tune these values using the PedroPathing tuning OpModes.\n */\n';
  code += 'public class FConstants {\n';
  code += '    static {\n';
  code += `        FollowerConstants.xMovement = ${v('pc-xMovement')};\n`;
  code += `        FollowerConstants.yMovement = ${v('pc-yMovement')};\n`;
  code += `        FollowerConstants.forwardZeroPowerAcceleration = ${v('pc-fwdZeroAccel')};\n`;
  code += `        FollowerConstants.lateralZeroPowerAcceleration = ${v('pc-latZeroAccel')};\n\n`;
  code += `        FollowerConstants.translationalPIDFCoefficients.setCoefficients(${v('pc-transP')}, ${v('pc-transI')}, ${v('pc-transD')}, ${v('pc-transF')});\n`;
  code += `        FollowerConstants.headingPIDFCoefficients.setCoefficients(${v('pc-headP')}, ${v('pc-headI')}, ${v('pc-headD')}, ${v('pc-headF')});\n`;
  code += `        FollowerConstants.drivePIDFCoefficients.setCoefficients(${v('pc-driveP')}, ${v('pc-driveI')}, ${v('pc-driveD')}, ${v('pc-driveF')});\n`;
  code += '    }\n';
  code += '}\n\n';

  // LConstants
  const ticksPerRev = v('pc-ticksPerRev');
  const wheelRadius = v('pc-wheelRadius');
  code += '/**\n * PedroPathing localization constants for three dead-wheel odometry.\n */\n';
  code += 'public class LConstants {\n';
  code += '    static {\n';
  code += `        ThreeWheelConstants.forwardTicksToInches = ${ticksPerRev} / (2 * Math.PI * ${wheelRadius});\n`;
  code += `        ThreeWheelConstants.strafeTicksToInches = ${ticksPerRev} / (2 * Math.PI * ${wheelRadius});\n`;
  code += `        ThreeWheelConstants.turnTicksToInches = ${ticksPerRev} / (2 * Math.PI * ${wheelRadius});\n`;
  code += `        ThreeWheelConstants.leftY = ${v('pc-leftY')};\n`;
  code += `        ThreeWheelConstants.rightY = ${v('pc-rightY')};\n`;
  code += `        ThreeWheelConstants.strafeX = ${v('pc-strafeX')};\n`;
  code += '    }\n';
  code += '}\n';

  return code;
}

// ── LUT Manager ───────────────────────────────────────────
let lutInitialized = false;
let lutEntries = [];

function initLUTManager() {
  if (lutInitialized) { updateLUTPreview(); return; }
  lutInitialized = true;

  lutEntries = [
    { key: '0', value: '0' },
    { key: '100', value: '1.0' }
  ];

  document.getElementById('lut-close').addEventListener('click', closeAppView);
  document.getElementById('lut-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(generateLUTCode());
    showToast('LUT code copied', 'success');
  });
  document.getElementById('lut-insert-code').addEventListener('click', () => {
    insertGeneratedCode(generateLUTCode());
  });
  document.getElementById('lut-refresh').addEventListener('click', updateLUTPreview);
  document.getElementById('lut-class-name').addEventListener('input', updateLUTPreview);
  document.getElementById('lut-key-type').addEventListener('change', updateLUTPreview);
  document.getElementById('lut-value-type').addEventListener('change', updateLUTPreview);
  document.getElementById('lut-add-row').addEventListener('click', () => {
    lutEntries.push({ key: '', value: '' });
    renderLUTTable();
    updateLUTPreview();
  });

  renderLUTTable();
  updateLUTPreview();
}

function renderLUTTable() {
  const tbody = document.getElementById('lut-table-body');
  tbody.innerHTML = '';
  lutEntries.forEach((entry, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(entry.key)}" data-idx="${i}" data-field="key" class="text-input" /></td>
      <td><input type="text" value="${escapeHtml(entry.value)}" data-idx="${i}" data-field="value" class="text-input" /></td>
      <td><button class="remove-block tiny" data-remove-lut="${i}">✕</button></td>
    `;
    tr.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        lutEntries[parseInt(input.dataset.idx)][input.dataset.field] = input.value;
        updateLUTPreview();
      });
    });
    tr.querySelector('[data-remove-lut]').addEventListener('click', () => {
      lutEntries.splice(i, 1);
      renderLUTTable();
      updateLUTPreview();
    });
    tbody.appendChild(tr);
  });
}

function updateLUTPreview() {
  const el = document.getElementById('lut-preview');
  if (el) el.textContent = generateLUTCode();
}

function generateLUTCode() {
  const className = document.getElementById('lut-class-name').value || 'MyLookupTable';
  const keyType = document.getElementById('lut-key-type').value;
  const valueType = document.getElementById('lut-value-type').value;

  const boxedKey = keyType === 'int' ? 'Integer' : keyType === 'double' ? 'Double' : 'String';
  const boxedVal = valueType === 'int' ? 'Integer' : valueType === 'double' ? 'Double' : 'String';

  let code = '// Generated by ChuckleIDE LUT Manager\n';
  code += 'package org.firstinspires.ftc.teamcode;\n\n';
  code += 'import java.util.HashMap;\n';
  code += 'import java.util.Map;\n\n';
  code += `public class ${className} {\n\n`;
  code += `    private static final Map<${boxedKey}, ${boxedVal}> TABLE = new HashMap<>();\n\n`;
  code += '    static {\n';
  for (const entry of lutEntries) {
    if (entry.key !== '') {
      const k = keyType === 'String' ? `"${entry.key}"` : entry.key;
      const v = valueType === 'String' ? `"${entry.value}"` : entry.value;
      code += `        TABLE.put(${k}, ${v});\n`;
    }
  }
  code += '    }\n\n';
  code += `    public static ${valueType} get(${keyType} key) {\n`;
  code += '        return TABLE.get(key);\n';
  code += '    }\n\n';
  code += `    public static ${valueType} getOrDefault(${keyType} key, ${valueType} defaultValue) {\n`;
  code += '        return TABLE.getOrDefault(key, defaultValue);\n';
  code += '    }\n\n';
  code += `    public static boolean containsKey(${keyType} key) {\n`;
  code += '        return TABLE.containsKey(key);\n';
  code += '    }\n';
  code += '}\n';
  return code;
}

// ── Interpolated LUT Manager ──────────────────────────────
let ilutInitialized = false;
let ilutEntries = [];

function initInterpLUTManager() {
  if (ilutInitialized) { updateILUTPreview(); return; }
  ilutInitialized = true;

  ilutEntries = [
    { input: '0', output: '0' },
    { input: '50', output: '0.5' },
    { input: '100', output: '1.0' }
  ];

  document.getElementById('ilut-close').addEventListener('click', closeAppView);
  document.getElementById('ilut-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(generateILUTCode());
    showToast('InterpLUT code copied', 'success');
  });
  document.getElementById('ilut-insert-code').addEventListener('click', () => {
    insertGeneratedCode(generateILUTCode());
  });
  document.getElementById('ilut-refresh').addEventListener('click', updateILUTPreview);
  document.getElementById('ilut-class-name').addEventListener('input', updateILUTPreview);
  document.getElementById('ilut-description').addEventListener('input', updateILUTPreview);
  document.getElementById('ilut-add-row').addEventListener('click', () => {
    ilutEntries.push({ input: '', output: '' });
    renderILUTTable();
    updateILUTPreview();
  });

  renderILUTTable();
  updateILUTPreview();
}

function renderILUTTable() {
  const tbody = document.getElementById('ilut-table-body');
  tbody.innerHTML = '';
  ilutEntries.forEach((entry, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" step="any" value="${entry.input}" data-idx="${i}" data-field="input" class="text-input" /></td>
      <td><input type="number" step="any" value="${entry.output}" data-idx="${i}" data-field="output" class="text-input" /></td>
      <td><button class="remove-block tiny" data-remove-ilut="${i}">✕</button></td>
    `;
    tr.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        ilutEntries[parseInt(input.dataset.idx)][input.dataset.field] = input.value;
        updateILUTPreview();
      });
    });
    tr.querySelector('[data-remove-ilut]').addEventListener('click', () => {
      ilutEntries.splice(i, 1);
      renderILUTTable();
      updateILUTPreview();
    });
    tbody.appendChild(tr);
  });
}

function updateILUTPreview() {
  const el = document.getElementById('ilut-preview');
  if (el) el.textContent = generateILUTCode();
}

function generateILUTCode() {
  const className = document.getElementById('ilut-class-name').value || 'MyInterpLUT';
  const desc = document.getElementById('ilut-description').value || '';

  let code = '// Generated by ChuckleIDE Interpolated LUT Manager\n';
  code += 'package org.firstinspires.ftc.teamcode;\n\n';
  code += 'import java.util.TreeMap;\n';
  code += 'import java.util.Map;\n\n';
  if (desc) code += `/** ${desc} */\n`;
  code += `public class ${className} {\n\n`;
  code += '    private static final TreeMap<Double, Double> TABLE = new TreeMap<>();\n\n';
  code += '    static {\n';
  for (const entry of ilutEntries) {
    if (entry.input !== '') {
      code += `        TABLE.put(${entry.input}, ${entry.output});\n`;
    }
  }
  code += '    }\n\n';

  code += '    /**\n';
  code += '     * Get the interpolated value for the given input.\n';
  code += '     * If the input is between two known points, linearly interpolates.\n';
  code += '     * If outside the range, returns the nearest boundary value.\n';
  code += '     */\n';
  code += '    public static double get(double input) {\n';
  code += '        if (TABLE.containsKey(input)) return TABLE.get(input);\n';
  code += '        Map.Entry<Double, Double> floor = TABLE.floorEntry(input);\n';
  code += '        Map.Entry<Double, Double> ceil = TABLE.ceilingEntry(input);\n';
  code += '        if (floor == null) return ceil.getValue();\n';
  code += '        if (ceil == null) return floor.getValue();\n';
  code += '        double t = (input - floor.getKey()) / (ceil.getKey() - floor.getKey());\n';
  code += '        return floor.getValue() + t * (ceil.getValue() - floor.getValue());\n';
  code += '    }\n';
  code += '}\n';
  return code;
}

// ── Enum Manager ──────────────────────────────────────────
let enumInitialized = false;
let enumEntries = [];

function initEnumManager() {
  if (enumInitialized) { updateEnumPreview(); return; }
  enumInitialized = true;

  enumEntries = [
    { name: 'IDLE', value: '' },
    { name: 'RUNNING', value: '' },
    { name: 'DONE', value: '' }
  ];

  document.getElementById('enum-close').addEventListener('click', closeAppView);
  document.getElementById('enum-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(generateEnumCode());
    showToast('Enum code copied', 'success');
  });
  document.getElementById('enum-insert-code').addEventListener('click', () => {
    insertGeneratedCode(generateEnumCode());
  });
  document.getElementById('enum-refresh').addEventListener('click', updateEnumPreview);
  document.getElementById('enum-class-name').addEventListener('input', updateEnumPreview);
  document.getElementById('enum-has-value').addEventListener('change', () => {
    renderEnumTable();
    updateEnumPreview();
  });
  document.getElementById('enum-add-row').addEventListener('click', () => {
    enumEntries.push({ name: '', value: '' });
    renderEnumTable();
    updateEnumPreview();
  });

  renderEnumTable();
  updateEnumPreview();
}

function renderEnumTable() {
  const hasValue = document.getElementById('enum-has-value').value;
  const valueHeader = document.getElementById('enum-value-header');
  valueHeader.style.display = hasValue !== 'none' ? '' : 'none';

  const tbody = document.getElementById('enum-table-body');
  tbody.innerHTML = '';
  enumEntries.forEach((entry, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(entry.name)}" data-idx="${i}" data-field="name" class="text-input" /></td>
      ${hasValue !== 'none' ? `<td><input type="text" value="${escapeHtml(entry.value)}" data-idx="${i}" data-field="value" class="text-input" /></td>` : ''}
      <td><button class="remove-block tiny" data-remove-enum="${i}">✕</button></td>
    `;
    tr.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        enumEntries[parseInt(input.dataset.idx)][input.dataset.field] = input.value;
        updateEnumPreview();
      });
    });
    tr.querySelector('[data-remove-enum]').addEventListener('click', () => {
      enumEntries.splice(i, 1);
      renderEnumTable();
      updateEnumPreview();
    });
    tbody.appendChild(tr);
  });
}

function updateEnumPreview() {
  const el = document.getElementById('enum-preview');
  if (el) el.textContent = generateEnumCode();
}

function generateEnumCode() {
  const className = document.getElementById('enum-class-name').value || 'RobotState';
  const hasValue = document.getElementById('enum-has-value').value;

  let code = '// Generated by ChuckleIDE Enum Manager\n';
  code += 'package org.firstinspires.ftc.teamcode;\n\n';
  code += `public enum ${className} {\n`;

  const validEntries = enumEntries.filter(e => e.name.trim());
  if (hasValue === 'none') {
    code += validEntries.map(e => `    ${e.name}`).join(',\n');
    if (validEntries.length > 0) code += ';\n';
  } else {
    code += validEntries.map(e => {
      const val = hasValue === 'String' ? `"${e.value}"` : (e.value || '0');
      return `    ${e.name}(${val})`;
    }).join(',\n');
    if (validEntries.length > 0) code += ';\n';

    code += `\n    private final ${hasValue} value;\n\n`;
    code += `    ${className}(${hasValue} value) {\n`;
    code += '        this.value = value;\n';
    code += '    }\n\n';
    code += `    public ${hasValue} getValue() {\n`;
    code += '        return value;\n';
    code += '    }\n';
  }

  code += '}\n';
  return code;
}

// ── Object Manager ────────────────────────────────────────
let objInitialized = false;
let objFields = [];

function initObjectManager() {
  if (objInitialized) { updateObjPreview(); return; }
  objInitialized = true;

  objFields = [
    { type: 'double', name: 'speed', defaultValue: '1.0' },
    { type: 'double', name: 'turnSpeed', defaultValue: '0.5' },
    { type: 'boolean', name: 'isEnabled', defaultValue: 'true' }
  ];

  document.getElementById('obj-close').addEventListener('click', closeAppView);
  document.getElementById('obj-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(generateObjectCode());
    showToast('Object code copied', 'success');
  });
  document.getElementById('obj-insert-code').addEventListener('click', () => {
    insertGeneratedCode(generateObjectCode());
  });
  document.getElementById('obj-refresh').addEventListener('click', updateObjPreview);
  document.getElementById('obj-class-name').addEventListener('input', updateObjPreview);
  document.getElementById('obj-static').addEventListener('change', updateObjPreview);
  document.getElementById('obj-add-row').addEventListener('click', () => {
    objFields.push({ type: 'double', name: '', defaultValue: '' });
    renderObjTable();
    updateObjPreview();
  });

  renderObjTable();
  updateObjPreview();
}

function renderObjTable() {
  const tbody = document.getElementById('obj-table-body');
  tbody.innerHTML = '';
  objFields.forEach((field, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <select data-idx="${i}" data-field="type" class="text-input">
          <option value="double" ${field.type === 'double' ? 'selected' : ''}>double</option>
          <option value="int" ${field.type === 'int' ? 'selected' : ''}>int</option>
          <option value="boolean" ${field.type === 'boolean' ? 'selected' : ''}>boolean</option>
          <option value="String" ${field.type === 'String' ? 'selected' : ''}>String</option>
          <option value="long" ${field.type === 'long' ? 'selected' : ''}>long</option>
          <option value="float" ${field.type === 'float' ? 'selected' : ''}>float</option>
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(field.name)}" data-idx="${i}" data-field="name" class="text-input" /></td>
      <td><input type="text" value="${escapeHtml(field.defaultValue)}" data-idx="${i}" data-field="defaultValue" class="text-input" /></td>
      <td><button class="remove-block tiny" data-remove-obj="${i}">✕</button></td>
    `;
    tr.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('input', () => {
        objFields[parseInt(input.dataset.idx)][input.dataset.field] = input.value;
        updateObjPreview();
      });
      input.addEventListener('change', () => {
        objFields[parseInt(input.dataset.idx)][input.dataset.field] = input.value;
        updateObjPreview();
      });
    });
    tr.querySelector('[data-remove-obj]').addEventListener('click', () => {
      objFields.splice(i, 1);
      renderObjTable();
      updateObjPreview();
    });
    tbody.appendChild(tr);
  });
}

function updateObjPreview() {
  const el = document.getElementById('obj-preview');
  if (el) el.textContent = generateObjectCode();
}

function generateObjectCode() {
  const className = document.getElementById('obj-class-name').value || 'RobotConfig';
  const isStatic = document.getElementById('obj-static').value === 'yes';

  let code = '// Generated by ChuckleIDE Object Manager\n';
  code += 'package org.firstinspires.ftc.teamcode;\n\n';
  code += `public class ${className} {\n\n`;

  const validFields = objFields.filter(f => f.name.trim());
  const staticMod = isStatic ? 'static ' : '';

  // Fields
  for (const f of validFields) {
    if (f.defaultValue) {
      const val = f.type === 'String' ? `"${f.defaultValue}"` : f.defaultValue;
      code += `    public ${staticMod}${f.type} ${f.name} = ${val};\n`;
    } else {
      code += `    public ${staticMod}${f.type} ${f.name};\n`;
    }
  }

  if (!isStatic && validFields.length > 0) {
    // Constructor
    code += `\n    public ${className}() {\n`;
    code += '        // Default constructor\n';
    code += '    }\n';

    // Parameterized constructor
    const params = validFields.map(f => `${f.type} ${f.name}`).join(', ');
    code += `\n    public ${className}(${params}) {\n`;
    for (const f of validFields) {
      code += `        this.${f.name} = ${f.name};\n`;
    }
    code += '    }\n';
  }

  code += '}\n';
  return code;
}
