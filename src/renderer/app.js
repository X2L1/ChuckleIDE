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
let selectedTemplateId = null;

// ── Initialization ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
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
  setupTemplatePanel();
  setupCopilotPanel();
  setupSettingsPanel();
  bindHomeScreen();

  // Wait for Monaco
  if (window.monacoReady) {
    initMonaco();
  } else {
    document.addEventListener('monaco-ready', initMonaco);
  }

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
});

// ── Monaco Initialization ─────────────────────────────────
function initMonaco() {
  const container = document.getElementById('monaco-editor-wrapper');
  const theme = state.settings['editor.theme'] || 'vs-dark';

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
    tabSize: parseInt(state.settings['editor.tabSize']) || 4,
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
      }
    }
  });

  // Auto-save on focus loss
  monacoEditor.onDidBlurEditorText(() => {
    if (state.activeFile) autoSave(state.activeFile);
  });

  window.addEventListener('resize', () => monacoEditor.layout());
  appendOutput('Monaco Editor initialized.', 'success');
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
    'find': () => monacoEditor && monacoEditor.trigger('', 'actions.find'),
    'replace': () => monacoEditor && monacoEditor.trigger('', 'editor.action.startFindReplaceAction'),
    'goto-line': () => monacoEditor && monacoEditor.trigger('', 'editor.action.gotoLine'),
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
    await refreshFileTree();
    await refreshGitStatus();
    appendOutput(`Opened project: ${projectPath}`, 'success');
    showToast(`Project opened: ${projectPath.split(/[/\\]/).pop()}`, 'success');
  } catch (e) {
    appendOutput(`Failed to open project: ${e.message}`, 'error');
  }
}

async function refreshFileTree(dirPath, containerEl, depth) {
  dirPath = dirPath || state.projectPath;
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
  if (!monacoEditor) { showToast('Editor not ready', 'warning'); return; }

  // Save current view state
  if (state.activeFile && state.openFiles.has(state.activeFile)) {
    state.openFiles.get(state.activeFile).viewState = monacoEditor.saveViewState();
  }

  if (state.openFiles.has(filePath)) {
    activateTab(filePath);
    return;
  }

  try {
    const content = await window.ftcIDE.fs.readFile(filePath);
    const lang = getLanguageForFile(filePath);
    const model = monaco.editor.createModel(content, lang, monaco.Uri.file(filePath));

    state.openFiles.set(filePath, { content, modified: false, model, viewState: null });
    addTab(filePath);
    activateTab(filePath);
    appendOutput(`Opened: ${filePath.split(/[/\\]/).pop()}`, 'info');
  } catch (e) {
    showToast(`Cannot open file: ${e.message}`, 'error');
  }
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
    const content = info.model ? info.model.getValue() : info.content;
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
  document.getElementById('monaco-editor-wrapper').style.display = '';

  // Switch model
  const info = state.openFiles.get(filePath);
  if (info && info.model) {
    monacoEditor.setModel(info.model);
    if (info.viewState) monacoEditor.restoreViewState(info.viewState);
    monacoEditor.focus();
  }

  // Update breadcrumb
  updateBreadcrumb(filePath);
  // Update language in status bar
  document.getElementById('status-language').textContent = getLanguageForFile(filePath).toUpperCase();
  // Update outline
  updateOutline();
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

  if (info && info.model) info.model.dispose();
  state.openFiles.delete(filePath);

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
  if (monacoEditor) monacoEditor.setModel(null);
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
  if (!state.activeFile || !monacoEditor) {
    container.innerHTML = '<div class="hint-text">Open a file to see its outline.</div>';
    return;
  }

  const content = monacoEditor.getValue();
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
      if (monacoEditor) monacoEditor.revealLineInCenter(line);
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
    roadrunner: document.getElementById('lib-roadrunner').checked
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
  document.getElementById('btn-split-editor').addEventListener('click', () => {
    showToast('Split editor view is not yet available', 'info');
  });
  document.getElementById('btn-close-all-tabs').addEventListener('click', () => {
    const paths = [...state.openFiles.keys()];
    paths.forEach(p => closeTab(p));
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
  const name = prompt('File name:');
  if (!name) return;
  const dir = state.projectPath || '.';
  const filePath = `${dir}/${name}`;
  await window.ftcIDE.fs.createFile(filePath, '');
  refreshFileTree();
  openFile(filePath);
}

async function promptNewFileIn(dir) {
  const name = prompt('File name:');
  if (!name) return;
  const filePath = `${dir}/${name}`;
  await window.ftcIDE.fs.createFile(filePath, '');
  refreshFileTree();
  openFile(filePath);
}

async function promptNewFolder() {
  const name = prompt('Folder name:');
  if (!name) return;
  const dir = state.projectPath || '.';
  await window.ftcIDE.fs.createDir(`${dir}/${name}`);
  refreshFileTree();
}

async function promptNewFolderIn(dir) {
  const name = prompt('Folder name:');
  if (!name) return;
  await window.ftcIDE.fs.createDir(`${dir}/${name}`);
  refreshFileTree();
}

async function promptRename(filePath, oldName) {
  const newName = prompt('New name:', oldName);
  if (!newName || newName === oldName) return;
  const newPath = filePath.replace(oldName, newName);
  await window.ftcIDE.fs.rename(filePath, newPath);
  if (state.openFiles.has(filePath)) {
    closeTab(filePath);
    openFile(newPath);
  }
  refreshFileTree();
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
function showUpdateNotification(info) {
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
  showToastWithAction(
    '↑ FTC IDE update available',
    'Update now',
    () => showModal('update'),
    'info'
  );
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
    'app-code-builder':    () => openAppView('code-builder'),
    'app-pedro-visualizer':() => openAppView('path-visualizer'),
    'app-template-gallery':() => { switchPanel('templates'); showModal('template'); },
    'app-open-editor':     () => browseForProject(),
    'app-device-manager':  () => switchPanel('devices'),
    'app-git-manager':     () => switchPanel('git'),
    'app-new-project':     () => showModal('new-project'),
    'app-learn':           () => window.ftcIDE.shell.openExternal('https://ftctechnh.github.io/ftc_app/doc/javadoc/index.html'),
    'home-open-project':   () => browseForProject(),
    'home-clone-repo':     () => showModal('clone')
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
  // Hide all app views
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  // Show target
  const view = document.getElementById(`app-view-${name}`);
  if (view) view.classList.add('active');

  if (name === 'code-builder') initCodeBuilder();
  if (name === 'path-visualizer') initPathVisualizer();
}

function closeAppView() {
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  if (state.activeFile) {
    document.getElementById('monaco-editor-wrapper').style.display = '';
  } else {
    document.getElementById('welcome-screen').style.display = '';
  }
}

// ── Code Builder (Drag & Drop) ────────────────────────────
const codeBlocks = [
  { cat: 'motor', label: 'Set Motor Power', code: '{{name}}.setPower({{value}});', defaults: { name: 'motor', value: '1.0' } },
  { cat: 'motor', label: 'Get Motor (Hardware Map)', code: '{{name}} = hardwareMap.get(DcMotor.class, "{{hwName}}");', defaults: { name: 'motor', hwName: 'motor0' } },
  { cat: 'motor', label: 'Set Motor Direction', code: '{{name}}.setDirection(DcMotor.Direction.{{dir}});', defaults: { name: 'motor', dir: 'FORWARD' } },
  { cat: 'motor', label: 'Set Zero Power Behavior', code: '{{name}}.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.{{mode}});', defaults: { name: 'motor', mode: 'BRAKE' } },
  { cat: 'motor', label: 'Set Motor Run Mode', code: '{{name}}.setMode(DcMotor.RunMode.{{mode}});', defaults: { name: 'motor', mode: 'RUN_USING_ENCODER' } },
  { cat: 'motor', label: 'Set Target Position', code: '{{name}}.setTargetPosition({{pos}});', defaults: { name: 'motor', pos: '0' } },
  { cat: 'servo', label: 'Set Servo Position', code: '{{name}}.setPosition({{pos}});', defaults: { name: 'servo', pos: '0.5' } },
  { cat: 'servo', label: 'Get Servo (Hardware Map)', code: '{{name}} = hardwareMap.get(Servo.class, "{{hwName}}");', defaults: { name: 'servo', hwName: 'servo0' } },
  { cat: 'sensor', label: 'Read Distance (cm)', code: 'double {{var}} = {{name}}.getDistance(DistanceUnit.CM);', defaults: { var: 'distance', name: 'distSensor' } },
  { cat: 'sensor', label: 'Read Color Sensor', code: 'int {{var}} = {{name}}.argb();', defaults: { var: 'color', name: 'colorSensor' } },
  { cat: 'sensor', label: 'Is Touch Pressed', code: 'boolean {{var}} = {{name}}.isPressed();', defaults: { var: 'pressed', name: 'touchSensor' } },
  { cat: 'control', label: 'If / Else', code: 'if ({{condition}}) {\n    {{body}}\n} else {\n    {{elseBody}}\n}', defaults: { condition: 'gamepad1.a', body: '// do something', elseBody: '// do something else' } },
  { cat: 'control', label: 'While Loop', code: 'while ({{condition}}) {\n    {{body}}\n}', defaults: { condition: 'opModeIsActive()', body: '// loop body' } },
  { cat: 'control', label: 'For Loop', code: 'for (int {{var}} = 0; {{var}} < {{count}}; {{var}}++) {\n    {{body}}\n}', defaults: { var: 'i', count: '10', body: '// loop body' } },
  { cat: 'control', label: 'Wait For Start', code: 'waitForStart();', defaults: {} },
  { cat: 'timing', label: 'Sleep (ms)', code: 'sleep({{ms}});', defaults: { ms: '1000' } },
  { cat: 'timing', label: 'Reset Runtime', code: 'resetRuntime();', defaults: {} },
  { cat: 'telemetry', label: 'Telemetry Add Data', code: 'telemetry.addData("{{key}}", {{value}});', defaults: { key: 'Status', value: '"Running"' } },
  { cat: 'telemetry', label: 'Telemetry Update', code: 'telemetry.update();', defaults: {} },
  { cat: 'telemetry', label: 'Telemetry Add Line', code: 'telemetry.addLine("{{text}}");', defaults: { text: 'Hello FTC!' } },
];

let placedBlocks = [];
let blockIdCounter = 0;

function initCodeBuilder() {
  const palette = document.getElementById('block-palette');
  const workspace = document.getElementById('block-workspace');

  // Build palette
  palette.innerHTML = '';
  const categories = [...new Set(codeBlocks.map(b => b.cat))];
  for (const cat of categories) {
    const title = document.createElement('div');
    title.className = 'block-palette-title';
    title.textContent = cat.toUpperCase();
    palette.appendChild(title);

    for (const block of codeBlocks.filter(b => b.cat === cat)) {
      const el = document.createElement('div');
      el.className = 'block-item';
      el.setAttribute('data-category', block.cat);
      el.draggable = true;
      el.innerHTML = `<div class="block-label">${escapeHtml(block.label)}</div>`;
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify(block));
        e.dataTransfer.effectAllowed = 'copy';
      });
      // Also allow click to add
      el.addEventListener('dblclick', () => addBlockToWorkspace(block));
      palette.appendChild(el);
    }
  }

  // Workspace drop zone
  workspace.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; workspace.classList.add('drag-over'); });
  workspace.addEventListener('dragleave', () => workspace.classList.remove('drag-over'));
  workspace.addEventListener('drop', (e) => {
    e.preventDefault();
    workspace.classList.remove('drag-over');
    try {
      const block = JSON.parse(e.dataTransfer.getData('text/plain'));
      addBlockToWorkspace(block);
    } catch(err) {}
  });

  // Buttons
  document.getElementById('cb-close').addEventListener('click', closeAppView);
  document.getElementById('cb-copy-code').addEventListener('click', () => {
    const code = generateCodeFromBlocks();
    navigator.clipboard.writeText(code);
    showToast('Code copied to clipboard', 'success');
  });
  document.getElementById('cb-insert-code').addEventListener('click', () => {
    const code = generateCodeFromBlocks();
    if (monacoEditor && state.activeFile) {
      const pos = monacoEditor.getPosition();
      monacoEditor.executeEdits('code-builder', [{
        range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
        text: code
      }]);
      closeAppView();
      showToast('Code inserted into editor', 'success');
    } else {
      navigator.clipboard.writeText(code);
      showToast('No file open — code copied to clipboard instead', 'info');
    }
  });
  document.getElementById('cb-refresh-preview').addEventListener('click', updateCodePreview);

  renderWorkspace();
  updateCodePreview();
}

function addBlockToWorkspace(block) {
  const instance = {
    ...block,
    id: ++blockIdCounter,
    params: { ...block.defaults }
  };
  placedBlocks.push(instance);
  renderWorkspace();
  updateCodePreview();
}

function renderWorkspace() {
  const workspace = document.getElementById('block-workspace');
  const hint = document.getElementById('workspace-hint');

  // Remove existing placed blocks
  workspace.querySelectorAll('.placed-block').forEach(el => el.remove());

  if (placedBlocks.length === 0) {
    hint.classList.remove('hidden');
    return;
  }
  hint.classList.add('hidden');

  placedBlocks.forEach((block, index) => {
    const el = document.createElement('div');
    el.className = 'placed-block';
    el.setAttribute('data-category', block.cat);
    el.draggable = true;

    // Build editable params
    let paramHtml = '';
    for (const [key, val] of Object.entries(block.params)) {
      paramHtml += ` <input type="text" value="${escapeHtml(val)}" data-param="${key}" title="${key}" />`;
    }

    el.innerHTML = `
      <span class="block-text"><strong>${escapeHtml(block.label)}</strong>${paramHtml}</span>
      <button class="remove-block" title="Remove">✕</button>
    `;

    // Param changes
    el.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        block.params[input.dataset.param] = input.value;
        updateCodePreview();
      });
    });

    // Remove
    el.querySelector('.remove-block').addEventListener('click', () => {
      const idx = placedBlocks.findIndex(b => b.id === block.id);
      if (idx !== -1) placedBlocks.splice(idx, 1);
      renderWorkspace();
      updateCodePreview();
    });

    // Drag to reorder
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(index));
      e.dataTransfer.effectAllowed = 'move';
    });

    workspace.appendChild(el);
  });
}

function updateCodePreview() {
  const el = document.getElementById('code-preview');
  if (el) el.textContent = generateCodeFromBlocks();
}

function generateCodeFromBlocks() {
  if (placedBlocks.length === 0) return '// Drag blocks from the palette to build code';

  let lines = [];
  lines.push('// Generated by ChuckleIDE Code Builder');
  lines.push('');

  for (const block of placedBlocks) {
    let code = block.code;
    for (const [key, val] of Object.entries(block.params)) {
      code = code.replaceAll(`{{${key}}}`, val);
    }
    // Indent multi-line code
    const codeLines = code.split('\n');
    for (const line of codeLines) {
      lines.push('    ' + line);
    }
  }

  return lines.join('\n');
}

// ── Path Visualizer ───────────────────────────────────────
let pathPoints = [];
let pvCanvas = null;
let pvCtx = null;

function initPathVisualizer() {
  pvCanvas = document.getElementById('pv-canvas');
  pvCtx = pvCanvas.getContext('2d');
  pathPoints = [];

  drawField();

  pvCanvas.addEventListener('click', (e) => {
    const rect = pvCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const fieldSize = parseFloat(document.getElementById('pv-field-size').value) || 144;
    const scale = pvCanvas.width / fieldSize;
    const fieldX = (x / scale).toFixed(1);
    const fieldY = (fieldSize - y / scale).toFixed(1);
    pathPoints.push({ x: parseFloat(fieldX), y: parseFloat(fieldY), heading: parseFloat(document.getElementById('pv-heading').value) || 0 });
    drawField();
    renderPointList();
  });

  pvCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // Remove nearest point
    if (pathPoints.length === 0) return;
    const rect = pvCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const fieldSize = parseFloat(document.getElementById('pv-field-size').value) || 144;
    const scale = pvCanvas.width / fieldSize;

    let minDist = Infinity, minIdx = -1;
    pathPoints.forEach((p, i) => {
      const px = p.x * scale;
      const py = (fieldSize - p.y) * scale;
      const d = Math.hypot(mx - px, my - py);
      if (d < minDist) { minDist = d; minIdx = i; }
    });
    if (minIdx >= 0 && minDist < 20) {
      pathPoints.splice(minIdx, 1);
      drawField();
      renderPointList();
    }
  });

  // Buttons
  document.getElementById('pv-close').addEventListener('click', closeAppView);
  document.getElementById('pv-clear').addEventListener('click', () => {
    pathPoints = [];
    drawField();
    renderPointList();
  });
  document.getElementById('pv-export').addEventListener('click', () => {
    const code = generatePathCode();
    navigator.clipboard.writeText(code);
    showToast('PedroPathing code copied to clipboard', 'success');
  });
  document.getElementById('pv-generate').addEventListener('click', () => {
    const code = generatePathCode();
    navigator.clipboard.writeText(code);
    showToast('PedroPathing code copied to clipboard', 'success');
  });
}

function drawField() {
  if (!pvCtx) return;
  const w = pvCanvas.width;
  const h = pvCanvas.height;
  const fieldSize = parseFloat(document.getElementById('pv-field-size').value) || 144;
  const scale = w / fieldSize;

  // Background
  const isDark = !document.documentElement.hasAttribute('data-theme');
  pvCtx.fillStyle = isDark ? '#1a1a1a' : '#f0f0e8';
  pvCtx.fillRect(0, 0, w, h);

  // Grid
  pvCtx.strokeStyle = isDark ? '#2a2020' : '#e0d0d0';
  pvCtx.lineWidth = 0.5;
  for (let i = 0; i <= fieldSize; i += 12) {
    const pos = i * scale;
    pvCtx.beginPath(); pvCtx.moveTo(pos, 0); pvCtx.lineTo(pos, h); pvCtx.stroke();
    pvCtx.beginPath(); pvCtx.moveTo(0, pos); pvCtx.lineTo(w, pos); pvCtx.stroke();
  }

  // Center lines
  pvCtx.strokeStyle = isDark ? '#3a2030' : '#d0b0b8';
  pvCtx.lineWidth = 1;
  pvCtx.beginPath(); pvCtx.moveTo(w/2, 0); pvCtx.lineTo(w/2, h); pvCtx.stroke();
  pvCtx.beginPath(); pvCtx.moveTo(0, h/2); pvCtx.lineTo(w, h/2); pvCtx.stroke();

  // Axis labels
  pvCtx.fillStyle = isDark ? '#5a4050' : '#8a6070';
  pvCtx.font = '10px sans-serif';
  pvCtx.fillText('0', 2, h - 2);
  pvCtx.fillText(String(fieldSize), w - 24, h - 2);
  pvCtx.fillText(String(fieldSize), 2, 12);

  if (pathPoints.length === 0) return;

  // Draw path lines
  pvCtx.strokeStyle = '#ff69b4';
  pvCtx.lineWidth = 2;
  pvCtx.beginPath();
  pathPoints.forEach((p, i) => {
    const px = p.x * scale;
    const py = (fieldSize - p.y) * scale;
    if (i === 0) pvCtx.moveTo(px, py);
    else pvCtx.lineTo(px, py);
  });
  pvCtx.stroke();

  // Draw points
  pathPoints.forEach((p, i) => {
    const px = p.x * scale;
    const py = (fieldSize - p.y) * scale;

    // Point circle
    pvCtx.beginPath();
    pvCtx.arc(px, py, 6, 0, Math.PI * 2);
    pvCtx.fillStyle = i === 0 ? '#4ec9b0' : '#ff69b4';
    pvCtx.fill();
    pvCtx.strokeStyle = '#fff';
    pvCtx.lineWidth = 1.5;
    pvCtx.stroke();

    // Heading arrow
    const headRad = (p.heading || 0) * Math.PI / 180;
    const arrowLen = 14;
    pvCtx.strokeStyle = '#ffe4b5';
    pvCtx.lineWidth = 2;
    pvCtx.beginPath();
    pvCtx.moveTo(px, py);
    pvCtx.lineTo(px + Math.cos(headRad) * arrowLen, py - Math.sin(headRad) * arrowLen);
    pvCtx.stroke();

    // Label
    pvCtx.fillStyle = isDark ? '#e0d0d8' : '#4a2030';
    pvCtx.font = '10px monospace';
    pvCtx.fillText(`P${i}`, px + 8, py - 8);
  });
}

function renderPointList() {
  const list = document.getElementById('pv-point-list');
  if (pathPoints.length === 0) {
    list.innerHTML = '<div style="padding:12px;color:var(--fg-dim);font-size:11px;text-align:center">No waypoints yet</div>';
    return;
  }
  list.innerHTML = pathPoints.map((p, i) => `
    <div class="path-point-item">
      <span style="color:${i === 0 ? '#4ec9b0' : 'var(--accent)'}">P${i}</span>
      <span>(${p.x}, ${p.y})</span>
      <span style="color:var(--fg-dim)">${p.heading}°</span>
      <button class="remove-point" data-idx="${i}">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.remove-point').forEach(btn => {
    btn.addEventListener('click', () => {
      pathPoints.splice(parseInt(btn.dataset.idx), 1);
      drawField();
      renderPointList();
    });
  });
}

function generatePathCode() {
  if (pathPoints.length < 2) return '// Add at least 2 waypoints to generate a path';

  let code = '// Generated by ChuckleIDE Path Visualizer\n';
  code += '// PedroPathing autonomous path\n\n';
  code += 'PathBuilder path = new PathBuilder()\n';

  for (let i = 0; i < pathPoints.length; i++) {
    const p = pathPoints[i];
    if (i === 0) {
      code += `    .setStartPose(new Pose(${p.x}, ${p.y}, Math.toRadians(${p.heading})))\n`;
    } else {
      code += `    .addWaypoint(new Pose(${p.x}, ${p.y}, Math.toRadians(${p.heading})))\n`;
    }
  }

  code += '    .build();\n';
  return code;
}
