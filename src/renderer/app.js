'use strict';

/* ═══════════════════════════════════════════════════════════
   FTC IDE – Renderer Process (app.js)
═══════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────
const state = {
  projectPath: null,
  openFiles: new Map(),      // filePath → { content, modified, model, viewState }
  activeFile: null,
  activeTab: null,           // current tab id (filePath or 'app:<name>')
  settings: {},
  devices: [],
  editorFontSize: 14,
  bottomHeight: 200,
  sidebarWidth: 260,
  pendingPathForOpMode: null
};

const DEFAULT_HOME_LAYOUT = [
  { type: 'app', id: 'app-subsystem-builder', visible: true },
  { type: 'app', id: 'app-command-builder', visible: true },
  { type: 'app', id: 'app-opmode-builder', visible: true },
  { type: 'app', id: 'app-pedro-visualizer', visible: true },
  { type: 'app', id: 'app-ftc-dashboard', visible: true },
  { type: 'app', id: 'app-panels-view', visible: true },
  { type: 'app', id: 'app-template-gallery', visible: true },
  { type: 'app', id: 'app-open-editor', visible: true },
  { type: 'app', id: 'app-device-manager', visible: true },
  { type: 'app', id: 'app-learn', visible: true },
  { type: 'app', id: 'app-git', visible: true },
  { type: 'app', id: 'app-pedro-constants', visible: true },
  { type: 'app', id: 'app-lut-manager', visible: true },
  { type: 'app', id: 'app-interplut-manager', visible: true },
  { type: 'app', id: 'app-enum-manager', visible: true },
  { type: 'app', id: 'app-object-manager', visible: true },
  { type: 'app', id: 'app-util-builder', visible: true },
  { type: 'app', id: 'app-vision-builder', visible: true }
];

async function getHomeLayout() {
  try {
    const saved = await window.ftcIDE.settings.get('home.layout');
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch { /* ignore */ }
  return JSON.parse(JSON.stringify(DEFAULT_HOME_LAYOUT));
}

async function saveHomeLayout(layout) {
  await window.ftcIDE.settings.set('home.layout', layout);
}

function applyHomeLayout(layout) {
  const grid = document.querySelector('.home-apps-grid');
  if (!grid) return;

  // Collect all app cards for re-insertion
  const allCards = {};
  grid.querySelectorAll('.home-app-card').forEach(card => {
    allCards[card.id] = card;
    card.style.display = 'none';
    card.remove();
  });

  // Remove any existing folder elements
  grid.querySelectorAll('.home-folder').forEach(f => f.remove());

  // Apply layout: show visible apps in order, create folders
  let currentFolderGrid = null;

  for (const item of layout) {
    if (item.type === 'folder') {
      const folderEl = document.createElement('div');
      folderEl.className = 'home-folder';
      folderEl.dataset.folderId = item.id || '';
      const titleEl = document.createElement('div');
      titleEl.className = 'home-folder-title';
      titleEl.innerHTML = `<span class="folder-icon">📁</span> ${escapeHtml(item.name || 'Folder')}`;
      // Allow collapsing folders
      titleEl.style.cursor = 'pointer';
      const folderGrid = document.createElement('div');
      folderGrid.className = 'home-folder-grid';
      titleEl.addEventListener('click', () => {
        folderGrid.style.display = folderGrid.style.display === 'none' ? '' : 'none';
        folderEl.classList.toggle('collapsed');
      });
      folderEl.appendChild(titleEl);
      folderEl.appendChild(folderGrid);
      grid.appendChild(folderEl);
      currentFolderGrid = folderGrid;
    } else if (item.type === 'folder-end') {
      currentFolderGrid = null;
    } else if (item.type === 'app') {
      const card = allCards[item.id];
      if (card) {
        card.style.display = item.visible ? '' : 'none';
        if (item.visible) {
          if (currentFolderGrid) {
            currentFolderGrid.appendChild(card);
          } else {
            grid.appendChild(card);
          }
        } else {
          // Keep hidden cards in grid so they remain accessible
          grid.appendChild(card);
        }
      }
    }
  }

  // Append any cards not mentioned in layout (e.g. newly added)
  for (const [id, card] of Object.entries(allCards)) {
    if (!card.parentElement) {
      card.style.display = '';
      grid.appendChild(card);
    }
  }
}

async function renderCustomizeList() {
  const list = document.getElementById('home-customize-list');
  const layout = await getHomeLayout();

  list.innerHTML = '';

  // Map app IDs to their display names
  const appNames = {};
  document.querySelectorAll('.home-app-card').forEach(card => {
    const nameEl = card.querySelector('.app-name');
    if (nameEl) appNames[card.id] = nameEl.textContent;
  });

  // Track folder nesting
  let inFolder = false;
  let folderStartIdx = -1;

  layout.forEach((item, idx) => {
    if (item.type === 'folder') {
      inFolder = true;
      folderStartIdx = idx;
      const folderEl = document.createElement('div');
      folderEl.className = 'home-customize-folder';
      folderEl.dataset.idx = idx;
      const headerEl = document.createElement('div');
      headerEl.className = 'home-customize-folder-header';
      headerEl.innerHTML = '<span style="margin-right:4px">📁</span>';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = item.name || 'Folder';
      nameInput.className = 'folder-name-input';
      headerEl.appendChild(nameInput);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'icon-btn remove-folder';
      removeBtn.title = 'Remove folder (keeps apps)';
      removeBtn.style.fontSize = '12px';
      removeBtn.textContent = '✕';
      headerEl.appendChild(removeBtn);
      folderEl.appendChild(headerEl);

      nameInput.addEventListener('input', async (e) => {
        const currentLayout = await getHomeLayout();
        if (currentLayout[idx] && currentLayout[idx].type === 'folder') {
          currentLayout[idx].name = e.target.value;
          await saveHomeLayout(currentLayout);
        }
      });

      removeBtn.addEventListener('click', async () => {
        const currentLayout = await getHomeLayout();
        // Find folder-end for this folder
        let endIdx = -1;
        for (let i = idx + 1; i < currentLayout.length; i++) {
          if (currentLayout[i].type === 'folder-end') { endIdx = i; break; }
        }
        if (endIdx !== -1) {
          currentLayout.splice(endIdx, 1); // remove folder-end
        }
        currentLayout.splice(idx, 1); // remove folder start
        await saveHomeLayout(currentLayout);
        await renderCustomizeList();
        applyHomeLayout(await getHomeLayout());
      });

      list.appendChild(folderEl);
    } else if (item.type === 'folder-end') {
      inFolder = false;
      const sep = document.createElement('div');
      sep.className = 'home-customize-folder-end';
      sep.dataset.idx = idx;
      sep.style.cssText = 'height:3px;background:var(--accent);margin:2px 0 8px;border-radius:2px;opacity:0.4;';
      list.appendChild(sep);
    } else if (item.type === 'app') {
      const el = document.createElement('div');
      el.className = 'home-customize-item' + (inFolder ? ' in-folder' : '');
      el.draggable = true;
      el.dataset.idx = idx;
      const name = appNames[item.id] || item.id;
      el.innerHTML = `
        <span class="item-grip">⠿</span>
        <span class="item-name">${escapeHtml(name)}</span>
        <input type="checkbox" class="item-toggle" ${item.visible ? 'checked' : ''} />
      `;

      // Toggle visibility
      el.querySelector('.item-toggle').addEventListener('change', async (e) => {
        const currentLayout = await getHomeLayout();
        if (currentLayout[idx]) {
          currentLayout[idx].visible = e.target.checked;
          await saveHomeLayout(currentLayout);
          applyHomeLayout(currentLayout);
        }
      });

      // Drag and drop reordering
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', idx.toString());
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.style.borderTop = '2px solid var(--accent)';
      });
      el.addEventListener('dragleave', () => {
        el.style.borderTop = '';
      });
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        el.style.borderTop = '';
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
        const toIdx = parseInt(el.dataset.idx);
        if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;
        const currentLayout = await getHomeLayout();
        // Only move app items, not folder markers
        if (!currentLayout[fromIdx] || currentLayout[fromIdx].type !== 'app') return;
        const [moved] = currentLayout.splice(fromIdx, 1);
        const adjustedToIdx = toIdx > fromIdx ? toIdx - 1 : toIdx;
        currentLayout.splice(adjustedToIdx, 0, moved);
        await saveHomeLayout(currentLayout);
        await renderCustomizeList();
        applyHomeLayout(currentLayout);
      });

      list.appendChild(el);
    }
  });
}

function bindHomeCustomization() {
  document.getElementById('home-customize-btn').addEventListener('click', async () => {
    const panel = document.getElementById('home-customize-panel');
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
    if (panel.style.display !== 'none') {
      await renderCustomizeList();
    }
  });

  document.getElementById('home-customize-close').addEventListener('click', () => {
    document.getElementById('home-customize-panel').style.display = 'none';
  });

  document.getElementById('home-customize-done').addEventListener('click', async () => {
    document.getElementById('home-customize-panel').style.display = 'none';
    const layout = await getHomeLayout();
    applyHomeLayout(layout);
  });

  document.getElementById('home-reset-layout').addEventListener('click', async () => {
    await saveHomeLayout(JSON.parse(JSON.stringify(DEFAULT_HOME_LAYOUT)));
    await renderCustomizeList();
    applyHomeLayout(await getHomeLayout());
    showToast('Home screen reset to default', 'info');
  });

  document.getElementById('home-add-folder').addEventListener('click', async () => {
    const folderName = prompt('Folder name:', 'New Folder');
    if (!folderName) return;
    const layout = await getHomeLayout();
    layout.push({ type: 'folder', name: folderName, id: 'folder-' + Date.now() });
    layout.push({ type: 'folder-end' });
    await saveHomeLayout(layout);
    await renderCustomizeList();
    applyHomeLayout(layout);
  });
}

let monacoEditor = null;
let fallbackEditor = null;
let fallbackHighlight = null;
let fallbackHighlightFrame = null;
let isSettingFallbackContent = false;
let selectedTemplateId = null;
const EDITOR_READY_TIMEOUT_MS = 15000;
const FALLBACK_AUTOCOMPLETE_ITEMS = [
  '@Autonomous',
  '@TeleOp',
  'hardwareMap.get',
  'telemetry.addData',
  'telemetry.update',
  'waitForStart',
  'opModeIsActive',
  'idle',
  'sleep',
  'gamepad1',
  'gamepad2',
  'left_stick_x',
  'left_stick_y',
  'right_stick_x',
  'right_stick_y',
  'DcMotor',
  'Servo',
  'ElapsedTime',
  'RUN_TO_POSITION',
  'STOP_AND_RESET_ENCODER',
  'RUN_USING_ENCODER',
  'BRAKE',
  'FLOAT',
  'public',
  'private',
  'protected',
  'class',
  'extends',
  'implements',
  'new',
  'return',
  'if',
  'else',
  'for',
  'while',
  'switch',
  'case',
  'try',
  'catch'
];
const FALLBACK_JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while'
]);
const FALLBACK_JAVA_TYPES = new Set([
  'String', 'Integer', 'Boolean', 'Double', 'Float', 'Long', 'Short', 'Byte', 'Character'
]);
const FALLBACK_JAVA_FTC_TERMS = new Set([
  'DcMotor', 'Servo', 'ElapsedTime', 'hardwareMap', 'telemetry', 'waitForStart',
  'opModeIsActive', 'gamepad1', 'gamepad2'
]);

// ── Initialization ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Tag <body> with the current platform so CSS can respond
  document.body.classList.add(`platform-${window.ftcIDE.platform}`);

  loadSettings();
  bindMenuActions();
  bindSidebarNav();
  bindFileExplorer();
  bindDevicePanel();
  bindBottomPanel();
  bindResizeHandles();
  bindWelcomeLinks();
  bindModals();
  bindKeyboardShortcuts();
  bindWindowControls();
  setupTemplatePanel();
  setupSettingsPanel();
  bindHomeScreen();
  initSuiteDashboard();
  initAiAssistant();
  initSettingsView();
  bindPhase8Nav();

  // Logo click → return to welcome/home screen
  document.getElementById('app-logo').addEventListener('click', () => {
    state.activeFile = null;
    state.activeTab = null;
    document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
    showWelcomeScreen();
  });

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

  // Register Java-specific completions and AI completions
  registerJavaCompletions();
  registerAiCompletions();

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
  fallbackHighlight = document.getElementById('fallback-highlight');
  if (!fallbackEditor) return;

  applyFallbackEditorSettings();
  requestFallbackHighlightUpdate();
  fallbackEditor.addEventListener('keydown', handleFallbackEditorKeydown);
  fallbackEditor.addEventListener('input', () => {
    if (isSettingFallbackContent || !state.activeFile) return;
    const info = state.openFiles.get(state.activeFile);
    if (!info) return;
    info.modified = true;
    info.content = fallbackEditor.value;
    updateTabModified(state.activeFile, true);
    updateOutline();
    updateFallbackCursorPosition();
    requestFallbackHighlightUpdate();
    scheduleActiveDiagnostics(state.activeFile);
  });
  fallbackEditor.addEventListener('scroll', syncFallbackHighlightScroll);
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
  if (fallbackHighlight) {
    fallbackHighlight.style.fontSize = `${state.editorFontSize}px`;
    fallbackHighlight.style.tabSize = String(tabSize);
    fallbackHighlight.style.whiteSpace = state.settings['editor.wordWrap'] === 'on' ? 'pre-wrap' : 'pre';
  }
}

function handleFallbackEditorKeydown(e) {
  if (!fallbackEditor || !state.activeFile) return;
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    if (tryApplyFallbackAutocomplete()) return;
    const tabSize = parseInt(state.settings['editor.tabSize'], 10) || 4;
    const insertion = ' '.repeat(tabSize);
    const start = fallbackEditor.selectionStart ?? 0;
    const end = fallbackEditor.selectionEnd ?? start;
    isSettingFallbackContent = true;
    fallbackEditor.setRangeText(insertion, start, end, 'end');
    isSettingFallbackContent = false;
    syncFallbackEditorContent();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
    e.preventDefault();
    if (!tryApplyFallbackAutocomplete()) {
      showToast('No autocomplete suggestions found', 'info');
    }
  }
}

function tryApplyFallbackAutocomplete() {
  if (!fallbackEditor || fallbackEditor.selectionStart !== fallbackEditor.selectionEnd) return false;
  const context = getFallbackAutocompleteContext();
  if (!context) return false;
  const suggestion = getFallbackAutocompleteSuggestion(context.prefix);
  if (!suggestion) return false;
  isSettingFallbackContent = true;
  fallbackEditor.setRangeText(suggestion, context.start, context.end, 'end');
  isSettingFallbackContent = false;
  syncFallbackEditorContent();
  return true;
}

function getFallbackAutocompleteContext() {
  if (!fallbackEditor) return null;
  const cursor = fallbackEditor.selectionStart ?? 0;
  const before = fallbackEditor.value.slice(0, cursor);
  const match = before.match(/[@\w.]+$/);
  if (!match || !match[0]) return null;
  return { prefix: match[0], start: cursor - match[0].length, end: cursor };
}

function getFallbackAutocompleteSuggestion(prefix) {
  const language = getLanguageForFile(state.activeFile || '');
  const items = language === 'java'
    ? FALLBACK_AUTOCOMPLETE_ITEMS
    : ['function', 'const', 'let', 'class', 'return', 'if', 'else', 'for', 'while'];
  const lowerPrefix = prefix.toLowerCase();
  return items.find((item) => {
    const lowerItem = item.toLowerCase();
    return lowerItem.startsWith(lowerPrefix) && lowerItem !== lowerPrefix;
  }) || null;
}

function syncFallbackEditorContent() {
  if (!fallbackEditor || !state.activeFile) return;
  const info = state.openFiles.get(state.activeFile);
  if (!info) return;
  info.modified = true;
  info.content = fallbackEditor.value;
  updateTabModified(state.activeFile, true);
  updateOutline();
  updateFallbackCursorPosition();
  requestFallbackHighlightUpdate();
}

function requestFallbackHighlightUpdate() {
  if (fallbackHighlightFrame !== null) return;
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    updateFallbackHighlight();
    return;
  }
  fallbackHighlightFrame = window.requestAnimationFrame(() => {
    fallbackHighlightFrame = null;
    updateFallbackHighlight();
  });
}

function updateFallbackHighlight() {
  if (!fallbackEditor || !fallbackHighlight) return;
  const code = fallbackEditor.value || '';
  const language = getLanguageForFile(state.activeFile || '');
  if (language !== 'java') {
    fallbackHighlight.textContent = code || ' ';
    syncFallbackHighlightScroll();
    return;
  }
  const highlighted = highlightFallbackJavaCode(code);
  fallbackHighlight.innerHTML = highlighted || '&nbsp;';
  syncFallbackHighlightScroll();
}

function syncFallbackHighlightScroll() {
  if (!fallbackEditor || !fallbackHighlight) return;
  fallbackHighlight.scrollTop = fallbackEditor.scrollTop;
  fallbackHighlight.scrollLeft = fallbackEditor.scrollLeft;
}

function highlightFallbackJavaCode(code) {
  const tokenPattern = /\/\/.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@[A-Za-z_]\w*|\b[A-Za-z_]\w*\b/gm;
  let html = '';
  let cursor = 0;
  for (const match of code.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    const token = match[0];
    html += escapeFallbackHtml(code.slice(cursor, index));
    html += `<span class="${getFallbackJavaTokenClass(token)}">${escapeFallbackHtml(token)}</span>`;
    cursor = index + token.length;
  }
  html += escapeFallbackHtml(code.slice(cursor));
  return html;
}

function getFallbackJavaTokenClass(token) {
  if (token.startsWith('//') || token.startsWith('/*')) return 'token-comment';
  if (token.startsWith('"') || token.startsWith('\'')) return 'token-string';
  if (token.startsWith('@')) return 'token-annotation';
  if (FALLBACK_JAVA_KEYWORDS.has(token)) return 'token-keyword';
  if (FALLBACK_JAVA_TYPES.has(token)) return 'token-type';
  if (FALLBACK_JAVA_FTC_TERMS.has(token)) return 'token-ftc';
  return 'token-plain';
}

function escapeFallbackHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const saveBtn = document.getElementById('btn-save-settings-sidebar');
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);
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
    'trigger-completion': () => triggerEditorCompletion(),
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
    'about': () => showToast('FTC IDE v1.0.0 – Built for FIRST Tech Challenge', 'info'),
    'check-updates': () => manualCheckForUpdates(),
    'git-clone': () => openGitTab('Enter a repository URL to clone.'),
    'git-commit': () => triggerGitPushFromMenu(),
    'git-pull': () => triggerGitPullFromMenu()
  };
  (handlers[action] || (() => appendOutput(`Unknown action: ${action}`, 'warn')))();
}

function triggerEditorCompletion() {
  if (monacoEditor) {
    monacoEditor.focus();
    monacoEditor.trigger('', 'editor.action.triggerSuggest');
    return;
  }
  if (!tryApplyFallbackAutocomplete()) {
    showToast('Autocomplete unavailable or no suggestions found', 'info');
  }
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
    }).filter(e => e.name !== '.gitkeep' && (!['node_modules', '.git', '.gradle', 'build', 'dist'].includes(e.name) || depth === 0));

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
const APP_TAB_PREFIX = 'app:';
const appTabMeta = {
  'subsystem-builder': { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="5"/><path d="M16 3v3M16 26v3M3 16h3M26 16h3M6.3 6.3l2.1 2.1M23.6 23.6l2.1 2.1M6.3 25.7l2.1-2.1M23.6 8.4l2.1-2.1"/></svg>', label: 'Subsystem Builder' },
  'command-builder':   { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="10" height="10" rx="2"/><rect x="18" y="4" width="10" height="10" rx="2"/><rect x="4" y="18" width="10" height="10" rx="2"/><path d="M18 22h10M23 18v8"/></svg>', label: 'Command Builder' },
  'opmode-builder':    { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="16" height="8" rx="2"/><rect x="8" y="22" width="16" height="8" rx="2"/><line x1="16" y1="10" x2="16" y2="22"/><polyline points="12 18 16 22 20 18"/></svg>', label: 'OpMode Builder' },
  'path-visualizer':   { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="26" r="3"/><circle cx="26" cy="6" r="3"/><path d="M8 24C12 20 14 10 26 8"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg>', label: 'Path Visualizer' },
  'ftc-dashboard':     { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="18" width="5" height="10" rx="1"/><rect x="13" y="10" width="5" height="18" rx="1"/><rect x="22" y="4" width="5" height="24" rx="1"/></svg>', label: 'FTC Dashboard' },
  'panels':            { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="12" height="12" rx="2"/><rect x="17" y="3" width="12" height="6" rx="2"/><rect x="17" y="11" width="12" height="4" rx="1"/><rect x="3" y="17" width="12" height="4" rx="1"/><rect x="3" y="23" width="12" height="6" rx="2"/><rect x="17" y="17" width="12" height="12" rx="2"/></svg>', label: 'Panels' },
  'pedro-constants':   { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4a6 6 0 0 0-5 9.2L6 24.4 7.6 26l11.2-11A6 6 0 0 0 22 4z"/><circle cx="22" cy="10" r="2"/></svg>', label: 'Pedro Constants' },
  'lut-manager':       { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="26" height="22" rx="2"/><line x1="3" y1="11" x2="29" y2="11"/><line x1="3" y1="18" x2="29" y2="18"/><line x1="12" y1="5" x2="12" y2="27"/></svg>', label: 'Lookup Tables' },
  'interplut-manager': { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 28 4 4"/><polyline points="4 28 28 28"/><path d="M6 24C10 24 12 8 20 8c4 0 6 6 8 6"/><circle cx="6" cy="24" r="2" fill="currentColor"/><circle cx="20" cy="8" r="2" fill="currentColor"/><circle cx="28" cy="14" r="2" fill="currentColor"/></svg>', label: 'Interpolated LUTs' },
  'enum-manager':      { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12l12 12-10 10L4 16z"/><circle cx="11" cy="11" r="2" fill="currentColor"/></svg>', label: 'Global Enums' },
  'object-manager':    { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 2L4 9v14l12 7 12-7V9z"/><path d="M16 16L4 9"/><path d="M16 16l12-7"/><path d="M16 16v14"/></svg>', label: 'Global Objects' },
  'util-builder':      { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14L4 24l4 4 10-10"/><path d="M22 4a6 6 0 0 0-6 6c0 1 .3 2 .6 2.8L14 16"/><path d="M18 18l3.2-3.4c.8.3 1.8.6 2.8.6a6 6 0 0 0 0-12"/></svg>', label: 'Utilities' },
  'vision-builder':    { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="4"/><circle cx="16" cy="16" r="1" fill="currentColor"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="16" y1="26" x2="16" y2="30"/><line x1="2" y1="16" x2="6" y2="16"/><line x1="26" y1="16" x2="30" y2="16"/></svg>', label: 'Vision Builder' },
  'github':            { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 2C8.3 2 2 8.3 2 16c0 6.2 4 11.4 9.6 13.3.7.1 1-.3 1-.7v-2.5c-3.9.9-4.7-1.9-4.7-1.9-.6-1.6-1.6-2-1.6-2-1.3-.9.1-.9.1-.9 1.4.1 2.1 1.4 2.1 1.4 1.3 2.2 3.3 1.6 4.1 1.2.1-.9.5-1.6.9-1.9-3.1-.4-6.4-1.6-6.4-7 0-1.5.5-2.8 1.4-3.8-.1-.4-.6-1.8.1-3.7 0 0 1.2-.4 3.8 1.4 1.1-.3 2.3-.5 3.5-.5s2.4.2 3.5.5c2.7-1.8 3.8-1.4 3.8-1.4.8 1.9.3 3.3.1 3.7.9 1 1.4 2.3 1.4 3.8 0 5.4-3.3 6.6-6.4 7 .5.4 1 1.3 1 2.6v3.8c0 .4.3.8 1 .7C26 27.4 30 22.2 30 16 30 8.3 23.7 2 16 2z"/></svg>', label: 'GitHub' },
  'git':               { icon: '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="26" cy="6" r="3"/><circle cx="6" cy="26" r="3"/><line x1="6" y1="9" x2="6" y2="23"/><path d="M26 9v6a8 8 0 0 1-8 8H9"/><polyline points="5 19 9 23 5 27"/></svg>', label: 'Source Control' },
  'vision-tuner':      { icon: '👁️', label: 'Vision Tuner' },
  'scouting':          { icon: '📊', label: 'Scouting Hub' },
  'resources':         { icon: '📚', label: 'Resources' },
  'mechanics':         { icon: '⚙️', label: 'Mechanics' },
  'management':        { icon: '📅', label: 'Management' },
  'outreach':          { icon: '📢', label: 'Outreach' }
};

function isAppTab(tabId) {
  return tabId && tabId.startsWith(APP_TAB_PREFIX);
}

function appNameFromTabId(tabId) {
  return tabId.slice(APP_TAB_PREFIX.length);
}

function addTab(filePath) {
  const tabsList = document.getElementById('tabs-list');
  const existing = tabsList.querySelector(`[data-path="${CSS.escape(filePath)}"]`);
  if (existing) return;

  const tab = document.createElement('div');
  tab.className = 'editor-tab';
  tab.dataset.path = filePath;

  let icon, name;
  if (isAppTab(filePath)) {
    const meta = appTabMeta[appNameFromTabId(filePath)];
    icon = meta ? meta.icon : '🔧';
    name = meta ? meta.label : appNameFromTabId(filePath);
  } else {
    name = filePath.split(/[/\\]/).pop();
    icon = getFileIcon(name);
  }

  tab.innerHTML = `
    <span class="tab-icon">${icon}</span>
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
  // Save current editor view state before switching
  if (monacoEditor && state.activeFile && state.openFiles.has(state.activeFile)) {
    state.openFiles.get(state.activeFile).viewState = monacoEditor.saveViewState();
  }

  // Hide all app views first
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));

  // Update tab UI
  state.activeTab = filePath;
  document.querySelectorAll('.editor-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.path === filePath));

  if (isAppTab(filePath)) {
    // Activate an app tab – keep state.activeFile so code insertion still works
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('monaco-editor-wrapper').style.display = 'none';
    document.getElementById('fallback-editor-wrapper').style.display = 'none';

    const appName = appNameFromTabId(filePath);
    const view = document.getElementById(`app-view-${appName}`);
    if (view) view.classList.add('active');
    initAppIfNeeded(appName);

    updateBreadcrumb(null);
    document.getElementById('status-language').textContent = '';
  } else {
    // Activate a file tab
    state.activeFile = filePath;

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
      requestFallbackHighlightUpdate();
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
}

function closeTab(filePath) {
  if (isAppTab(filePath)) {
    // Close an app tab
    const appName = appNameFromTabId(filePath);
    const view = document.getElementById(`app-view-${appName}`);
    if (view) view.classList.remove('active');
  } else {
    // Close a file tab
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

    // If this was the active file, clear it
    if (state.activeFile === filePath) {
      state.activeFile = null;
    }
  }

  const tab = document.querySelector(`.editor-tab[data-path="${CSS.escape(filePath)}"]`);
  if (tab) tab.remove();

  // Switch to another tab if this was the active tab
  if (state.activeTab === filePath) {
    const tabs = document.querySelectorAll('.editor-tab');
    if (tabs.length > 0) {
      activateTab(tabs[tabs.length - 1].dataset.path);
    } else {
      state.activeFile = null;
      state.activeTab = null;
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
  diagnosticsTimer = setTimeout(() => runActiveDiagnostics(filePath), DIAGNOSTICS_DEBOUNCE_MS);
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
      <span class="problem-icon ${diag.severity === 'error' ? 'error' : 'warn'}">${diag.severity === 'error' ? '⨯' : '⚠'}</span>
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
      severity: 'warning',
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
      severity: 'warning',
      message: 'Mixed indentation may cause errors in Python.',
      location: 'Detected tab characters in file',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2
    });
  }

  return diagnostics.slice(0, MAX_ACTIVE_DIAGNOSTICS);
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
    if (ctrl && e.key === 'w') { e.preventDefault(); if (state.activeTab) closeTab(state.activeTab); }
    if (ctrl && e.key === 'n') { e.preventDefault(); promptNewFile(); }
    if (ctrl && e.shiftKey && e.key === 'N') { e.preventDefault(); showModal('new-project'); }
    if (ctrl && e.key === 'b') { e.preventDefault(); document.getElementById('sidebar').style.display = document.getElementById('sidebar').style.display === 'none' ? '' : 'none'; }
    if (ctrl && e.code === 'Space') { e.preventDefault(); triggerEditorCompletion(); }
    if (e.key === 'F6') { e.preventDefault(); triggerBuild('assemble'); }
    if (e.key === 'F7') { e.preventDefault(); triggerBuild('install'); }
    if (e.key === 'Escape') { hideContextMenu(); }
    // Tab switching
    if (ctrl && e.key === 'Tab') {
      e.preventDefault();
      const tabs = [...document.querySelectorAll('.editor-tab')];
      const idx = tabs.findIndex(t => t.dataset.path === state.activeTab);
      const nextIdx = (idx + 1) % tabs.length;
      if (tabs[nextIdx]) activateTab(tabs[nextIdx].dataset.path);
    }
  });
}

// ── Welcome Links ─────────────────────────────────────────
function bindWelcomeLinks() {
  const ids = ['wl-new-project','wl-open-project','wl-template-auto','wl-template-teleop','wl-template-pedro','wl-ftc-docs','wl-pedro-docs','wl-nextftc-docs'];
  const handlers = {
    'wl-new-project': (e) => { e.preventDefault(); showModal('new-project'); },
    'wl-open-project': (e) => { e.preventDefault(); browseForProject(); },
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
    const allTabs = [...document.querySelectorAll('.editor-tab')].map(t => t.dataset.path).filter(Boolean);
    allTabs.forEach(p => closeTab(p));
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
    'app-new-project':       () => showModal('new-project'),
    'app-github':            () => openAppView('github'),
    'app-git':               () => openAppView('git'),
    'app-learn':             () => window.ftcIDE.shell.openExternal('https://ftctechnh.github.io/ftc_app/doc/javadoc/index.html'),
    'app-pedro-constants':   () => openAppView('pedro-constants'),
    'app-lut-manager':       () => openAppView('lut-manager'),
    'app-interplut-manager': () => openAppView('interplut-manager'),
    'app-enum-manager':      () => openAppView('enum-manager'),
    'app-object-manager':    () => openAppView('object-manager'),
    'app-util-builder':      () => openAppView('util-builder'),
    'app-vision-builder':    () => openAppView('vision-builder'),
    'home-open-project':     () => browseForProject(),
    'home-clone-repo':       () => openGitTab('clone')
  };
  for (const [id, fn] of Object.entries(handlers)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  bindHomeCustomization();
  // Apply saved layout
  getHomeLayout().then(applyHomeLayout);
}

function openAppView(name) {
  const tabId = APP_TAB_PREFIX + name;
  // Save current editor state
  if (monacoEditor && state.activeFile && state.openFiles.has(state.activeFile)) {
    state.openFiles.get(state.activeFile).viewState = monacoEditor.saveViewState();
  }
  // Add a tab for this app (if not already open)
  addTab(tabId);
  // Activate the app tab
  activateTab(tabId);
}

function initAppIfNeeded(name) {
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
  if (name === 'util-builder') initUtilBuilder();
  if (name === 'vision-builder') initVisionBuilder();
  if (name === 'git') initGitView();
}

function closeAppView() {
  // Close the currently active app tab (if any)
  if (state.activeTab && isAppTab(state.activeTab)) {
    closeTab(state.activeTab);
  } else {
    // Fallback: hide all app views and return to editor or welcome
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    if (state.activeFile) {
      document.getElementById('monaco-editor-wrapper').style.display = monacoEditor ? '' : 'none';
      document.getElementById('fallback-editor-wrapper').style.display = monacoEditor ? 'none' : '';
    } else {
      document.getElementById('welcome-screen').style.display = '';
    }
  }
}

// ── Subsystem Builder ─────────────────────────────────────
const subsystemBlocks = [
  { cat: 'hardware', label: 'DcMotor', code: 'private DcMotor {{name}};', init: '{{name}} = hardwareMap.get(DcMotor.class, "{{hwName}}");', defaults: { name: 'motor', hwName: 'motor0' } },
  { cat: 'hardware', label: 'DcMotorEx', code: 'private DcMotorEx {{name}};', init: '{{name}} = hardwareMap.get(DcMotorEx.class, "{{hwName}}");\n        {{name}}.setMode(DcMotor.RunMode.RUN_USING_ENCODER);', defaults: { name: 'motorEx', hwName: 'motorEx0' }, imports: ['com.qualcomm.robotcore.hardware.DcMotorEx'] },
  { cat: 'hardware', label: 'Servo', code: 'private Servo {{name}};', init: '{{name}} = hardwareMap.get(Servo.class, "{{hwName}}");', defaults: { name: 'servo', hwName: 'servo0' } },
  { cat: 'hardware', label: 'CRServo', code: 'private CRServo {{name}};', init: '{{name}} = hardwareMap.get(CRServo.class, "{{hwName}}");', defaults: { name: 'crServo', hwName: 'crServo0' } },
  { cat: 'hardware', label: 'Distance Sensor', code: 'private DistanceSensor {{name}};', init: '{{name}} = hardwareMap.get(DistanceSensor.class, "{{hwName}}");', defaults: { name: 'distSensor', hwName: 'distSensor0' } },
  { cat: 'hardware', label: 'Touch Sensor', code: 'private TouchSensor {{name}};', init: '{{name}} = hardwareMap.get(TouchSensor.class, "{{hwName}}");', defaults: { name: 'touchSensor', hwName: 'touchSensor0' } },
  { cat: 'hardware', label: 'Color Sensor', code: 'private ColorSensor {{name}};', init: '{{name}} = hardwareMap.get(ColorSensor.class, "{{hwName}}");', defaults: { name: 'colorSensor', hwName: 'colorSensor0' } },
  { cat: 'hardware', label: 'Encoder', code: 'private DcMotorEx {{name}};', init: '{{name}} = hardwareMap.get(DcMotorEx.class, "{{hwName}}");\n        {{name}}.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);\n        {{name}}.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);', defaults: { name: 'encoder', hwName: 'encoder0' }, imports: ['com.qualcomm.robotcore.hardware.DcMotorEx'] },
  { cat: 'hardware', label: 'Break Beam Sensor', code: 'private DigitalChannel {{name}};', init: '{{name}} = hardwareMap.get(DigitalChannel.class, "{{hwName}}");\n        {{name}}.setMode(DigitalChannel.Mode.INPUT);', defaults: { name: 'breakBeam', hwName: 'breakBeam0' }, imports: ['com.qualcomm.robotcore.hardware.DigitalChannel'] },
  { cat: 'hardware', label: 'IMU', code: 'private IMU {{name}};', init: '{{name}} = hardwareMap.get(IMU.class, "{{hwName}}");\n        {{name}}.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(\n            RevHubOrientationOnRobot.LogoFacingDirection.UP,\n            RevHubOrientationOnRobot.UsbFacingDirection.FORWARD)));', defaults: { name: 'imu', hwName: 'imu' }, imports: ['com.qualcomm.robotcore.hardware.IMU', 'com.qualcomm.hardware.rev.RevHubOrientationOnRobot'] },
  { cat: 'hardware', label: 'Analog Input', code: 'private AnalogInput {{name}};', init: '{{name}} = hardwareMap.get(AnalogInput.class, "{{hwName}}");', defaults: { name: 'analogInput', hwName: 'analogInput0' }, imports: ['com.qualcomm.robotcore.hardware.AnalogInput'] },
  { cat: 'hardware', label: 'LED', code: 'private DigitalChannel {{name}};', init: '{{name}} = hardwareMap.get(DigitalChannel.class, "{{hwName}}");\n        {{name}}.setMode(DigitalChannel.Mode.OUTPUT);', defaults: { name: 'led', hwName: 'led0' }, imports: ['com.qualcomm.robotcore.hardware.DigitalChannel'] },
  { cat: 'method', label: 'Set Motor Power', code: 'public void {{methodName}}(double power) {\n    {{motor}}.setPower(power);\n}', defaults: { methodName: 'setDrivePower', motor: 'motor' } },
  { cat: 'method', label: 'Set Servo Position', code: 'public void {{methodName}}(double pos) {\n    {{servo}}.setPosition(pos);\n}', defaults: { methodName: 'setArmPosition', servo: 'servo' } },
  { cat: 'method', label: 'Get Distance', code: 'public double {{methodName}}() {\n    return {{sensor}}.getDistance(DistanceUnit.CM);\n}', defaults: { methodName: 'getDistance', sensor: 'distSensor' } },
  { cat: 'method', label: 'Is Pressed', code: 'public boolean {{methodName}}() {\n    return {{sensor}}.isPressed();\n}', defaults: { methodName: 'isLimitReached', sensor: 'touchSensor' } },
  { cat: 'method', label: 'Run To Position', code: 'public void {{methodName}}(int targetTicks, double power) {\n    {{motor}}.setTargetPosition(targetTicks);\n    {{motor}}.setMode(DcMotor.RunMode.RUN_TO_POSITION);\n    {{motor}}.setPower(Math.abs(power));\n}', defaults: { methodName: 'runToPosition', motor: 'motorEx' } },
  { cat: 'method', label: 'Set Velocity', code: 'public void {{methodName}}(double ticksPerSecond) {\n    {{motor}}.setVelocity(ticksPerSecond);\n}', defaults: { methodName: 'setVelocity', motor: 'motorEx' } },
  { cat: 'method', label: 'Get Encoder Position', code: 'public int {{methodName}}() {\n    return {{encoder}}.getCurrentPosition();\n}', defaults: { methodName: 'getEncoderPosition', encoder: 'encoder' } },
  { cat: 'method', label: 'Is Break Beam Triggered', code: 'public boolean {{methodName}}() {\n    return !{{sensor}}.getState();\n}', defaults: { methodName: 'isBeamBroken', sensor: 'breakBeam' } },
  { cat: 'method', label: 'Is Motor At Target', code: 'public boolean {{methodName}}() {\n    return !{{motor}}.isBusy();\n}', defaults: { methodName: 'isAtTarget', motor: 'motorEx' } },
  { cat: 'method', label: 'Get IMU Heading', code: 'public double {{methodName}}() {\n    return {{imu}}.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES);\n}', defaults: { methodName: 'getHeading', imu: 'imu' } },
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
  document.getElementById('sb-insert-code').addEventListener('click', async () => {
    const className = getGeneratedClassName('sb-class-name', 'MySubsystem');
    await insertGeneratedClass(generateSubsystemCode(), 'subsystems', className, 'Subsystem');
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

  // Collect extra imports needed by blocks
  const extraImports = new Set();
  for (const block of sbBlocks) {
    if (block.imports) {
      block.imports.forEach(imp => extraImports.add(imp));
    }
  }
  // Check if any method references RunMode or AngleUnit
  const allCode = sbBlocks.map(b => {
    let c = b.code;
    for (const [k, v] of Object.entries(b.params)) c = c.replaceAll(`{{${k}}}`, v);
    return c;
  }).join('\n');
  if (allCode.includes('RunMode.') || allCode.includes('setTargetPosition') || allCode.includes('setMode')) {
    extraImports.add('com.qualcomm.robotcore.hardware.DcMotor');
  }
  if (allCode.includes('AngleUnit.')) {
    extraImports.add('org.firstinspires.ftc.robotcore.external.navigation.AngleUnit');
  }
  if (allCode.includes('setVelocity')) {
    extraImports.add('com.qualcomm.robotcore.hardware.DcMotorEx');
  }

  let code = '// Generated by ChuckleIDE Subsystem Builder\n';
  code += 'package org.firstinspires.ftc.teamcode.subsystems;\n\n';
  code += 'import com.qualcomm.robotcore.hardware.*;\n';
  code += 'import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;\n';
  for (const imp of extraImports) {
    code += `import ${imp};\n`;
  }
  code += '\n';
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

// ── Scan project for existing subsystem/command class names ──
async function scanTeamCodeClasses(packageFolder) {
  if (!state.teamCodePath) return [];
  try {
    const dir = joinProjectPath(state.teamCodePath, packageFolder);
    const exists = await window.ftcIDE.fs.exists(dir);
    if (!exists) return [];
    const entries = await window.ftcIDE.fs.readDir(dir);
    return entries
      .filter(e => !e.isDirectory && e.name.endsWith('.java'))
      .map(e => e.name.replace(/\.java$/, ''));
  } catch {
    return [];
  }
}

function populateDropdown(selectEl, options, currentValue) {
  const prevValue = selectEl.value || currentValue || '';
  selectEl.innerHTML = '';
  // Always add a custom option
  const customOpt = document.createElement('option');
  customOpt.value = '';
  customOpt.textContent = '— Type custom —';
  selectEl.appendChild(customOpt);
  for (const name of options) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  }
  // Restore value if it exists in options
  if (options.includes(prevValue)) {
    selectEl.value = prevValue;
  } else if (prevValue) {
    // Add as custom option
    const opt = document.createElement('option');
    opt.value = prevValue;
    opt.textContent = prevValue + ' (custom)';
    selectEl.appendChild(opt);
    selectEl.value = prevValue;
  }
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
  if (cmbInitialized) { updateCMBPreview(); refreshCMBSubsystemDropdown(); return; }
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
  document.getElementById('cmb-insert-code').addEventListener('click', async () => {
    const className = getGeneratedClassName('cmb-class-name', 'MyCommand');
    await insertGeneratedClass(generateCommandCode(), 'commands', className, 'Command');
  });
  document.getElementById('cmb-refresh').addEventListener('click', updateCMBPreview);
  document.getElementById('cmb-class-name').addEventListener('input', updateCMBPreview);

  // Subsystem dropdown + custom input
  const subsystemSelect = document.getElementById('cmb-subsystem-select');
  const subsystemCustom = document.getElementById('cmb-subsystem-custom');
  subsystemSelect.addEventListener('change', () => {
    if (subsystemSelect.value === '') {
      subsystemCustom.style.display = '';
      subsystemCustom.focus();
    } else {
      subsystemCustom.style.display = 'none';
    }
    updateCMBPreview();
  });
  subsystemCustom.addEventListener('input', updateCMBPreview);

  refreshCMBSubsystemDropdown();
  renderCMBWorkspace();
  updateCMBPreview();
}

async function refreshCMBSubsystemDropdown() {
  const subsystemSelect = document.getElementById('cmb-subsystem-select');
  const subsystemCustom = document.getElementById('cmb-subsystem-custom');
  if (!subsystemSelect) return;
  const subsystems = await scanTeamCodeClasses('subsystems');
  populateDropdown(subsystemSelect, subsystems, 'MySubsystem');
  if (subsystems.length > 0 && subsystemSelect.value) {
    subsystemCustom.style.display = 'none';
  }
}

function getCMBSubsystemValue() {
  const sel = document.getElementById('cmb-subsystem-select');
  const custom = document.getElementById('cmb-subsystem-custom');
  if (sel && sel.value) return sel.value;
  if (custom) return custom.value || 'MySubsystem';
  return 'MySubsystem';
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
  const subsystem = getCMBSubsystemValue();

  const actions = cmbBlocks.filter(b => b.cat === 'action' || b.cat === 'control' || b.cat === 'telemetry');
  const finishBlocks = cmbBlocks.filter(b => b.cat === 'finish');

  let code = '// Generated by ChuckleIDE Command Builder\n';
  code += 'package org.firstinspires.ftc.teamcode.commands;\n\n';
  code += `import org.firstinspires.ftc.teamcode.subsystems.${subsystem};\n`;
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
  if (obInitialized) { updateOBPreview(); refreshOBDropdowns(); return; }
  obInitialized = true;

  document.getElementById('ob-close').addEventListener('click', closeAppView);
  document.getElementById('ob-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(generateOpModeCode());
    showToast('OpMode code copied', 'success');
  });
  document.getElementById('ob-insert-code').addEventListener('click', async () => {
    const className = getGeneratedClassName('ob-class-name', 'MyAutonomous');
    await insertGeneratedClass(generateOpModeCode(), 'opmodes', className, 'OpMode');
  });
  document.getElementById('ob-refresh').addEventListener('click', updateOBPreview);
  document.getElementById('ob-class-name').addEventListener('input', updateOBPreview);
  document.getElementById('ob-start-x').addEventListener('input', updateOBPreview);
  document.getElementById('ob-start-y').addEventListener('input', updateOBPreview);
  document.getElementById('ob-start-heading').addEventListener('input', updateOBPreview);

  document.getElementById('ob-add-path').addEventListener('click', () => {
    const step = {
      id: ++obIdCounter,
      type: 'path',
      interpolation: 'linear',
      waypoints: [
        { x: 0, y: 0, heading: 0 },
        { x: 24, y: 0, heading: 0 }
      ],
      controlPoints: []
    };

    if (state.pendingPathForOpMode) {
      const pd = state.pendingPathForOpMode;
      if (pd.waypoints && pd.waypoints.length >= 2) {
        step.waypoints = pd.waypoints.map(wp => ({
          x: wp.x, y: wp.y, heading: wp.heading || 0
        }));
        if (pd.controlPoints && pd.controlPoints.length > 0) {
          step.controlPoints = pd.controlPoints.map(cp => ({ x: cp.x, y: cp.y }));
        }
      }
      state.pendingPathForOpMode = null;
    }

    obSteps.push(step);
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

  refreshOBDropdowns();
  renderOBSequence();
  updateOBPreview();
}

// Cache for OB dropdown data
let _obSubsystems = [];
let _obCommands = [];

async function refreshOBDropdowns() {
  _obSubsystems = await scanTeamCodeClasses('subsystems');
  _obCommands = await scanTeamCodeClasses('commands');
}

function buildOBSelectHtml(options, currentValue, dataField, placeholder) {
  let html = `<select class="text-input ob-dropdown" data-field="${dataField}">`;
  html += `<option value="">— ${placeholder || 'Type custom'} —</option>`;
  let found = false;
  for (const opt of options) {
    const sel = opt === currentValue ? ' selected' : '';
    if (opt === currentValue) found = true;
    html += `<option value="${escapeHtml(opt)}"${sel}>${escapeHtml(opt)}</option>`;
  }
  if (currentValue && !found) {
    html += `<option value="${escapeHtml(currentValue)}" selected>${escapeHtml(currentValue)} (custom)</option>`;
  }
  html += '</select>';
  html += `<input type="text" value="${escapeHtml(currentValue)}" data-field="${dataField}" class="text-input ob-custom-input" placeholder="Custom name" style="${(found || !currentValue) && options.length > 0 ? 'display:none' : ''}" />`;
  return html;
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
            ${buildOBSelectHtml(_obCommands, step.commandName, 'commandName', 'Select command')}
          </div>
          <div class="ob-step-row">
            <label>Subsystem:</label>
            ${buildOBSelectHtml(_obSubsystems, step.subsystemName, 'subsystemName', 'Select subsystem')}
          </div>
        </div>
      `;
      // Wire up dropdowns and custom inputs
      el.querySelectorAll('.ob-dropdown').forEach(sel => {
        sel.addEventListener('change', () => {
          const field = sel.dataset.field;
          const customInput = sel.parentElement.querySelector('.ob-custom-input');
          if (sel.value === '') {
            customInput.style.display = '';
            customInput.focus();
            step[field] = customInput.value;
          } else {
            customInput.style.display = 'none';
            step[field] = sel.value;
          }
          updateOBPreview();
        });
      });
      el.querySelectorAll('.ob-custom-input').forEach(input => {
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
  code += 'package org.firstinspires.ftc.teamcode.opmodes;\n\n';
  code += 'import com.qualcomm.robotcore.eventloop.opmode.Autonomous;\n';
  code += 'import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;\n';
  code += 'import com.pedropathing.follower.Follower;\n';
  code += 'import com.pedropathing.localization.Pose;\n';
  code += 'import com.pedropathing.pathgen.BezierLine;\n';
  if (hasControlPoints) {
    code += 'import com.pedropathing.pathgen.BezierCurve;\n';
  }
  code += 'import com.pedropathing.pathgen.Path;\n';
  code += 'import com.pedropathing.pathgen.Point;\n';
  code += 'import com.pedropathing.util.Constants;\n\n';
  for (const sub of subsystems) {
    code += `import org.firstinspires.ftc.teamcode.subsystems.${sub};\n`;
  }
  for (const cmd of commands) {
    code += `import org.firstinspires.ftc.teamcode.commands.${cmd};\n`;
  }
  code += '\n';
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
  code += `        Constants.setConstants(FConstants.class, LConstants.class);\n`;
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
function getGeneratedClassName(inputId, fallbackName) {
  const value = document.getElementById(inputId)?.value?.trim() || fallbackName;
  return value.replace(/\.java$/i, '');
}

// Renderer does not have direct Node.js `path` access, so normalize/join paths here.
function joinProjectPath(basePath, ...segments) {
  const sep = window.ftcIDE.platform === 'win32' ? '\\' : '/';
  const leadingSep = (basePath.match(/^[\\/]+/) || [''])[0].replace(/[\\/]/g, sep);
  const baseParts = basePath.replace(/^[\\/]+|[\\/]+$/g, '').split(/[\\/]+/).filter(Boolean);
  const segmentParts = segments
    .flatMap((segment) => segment.split(/[\\/]+/))
    .filter(Boolean);
  return `${leadingSep}${[...baseParts, ...segmentParts].join(sep)}`;
}

/**
 * Creates/updates a generated Java class file in its package directory and opens it.
 * @param {string} code Java source to persist.
 * @param {string} packageFolder TeamCode package folder (e.g. subsystems).
 * @param {string} className Java class name (without .java).
 * @param {string} kindLabel User-facing class type label.
 */
async function insertGeneratedClass(code, packageFolder, className, kindLabel) {
  if (!state.teamCodePath) {
    navigator.clipboard.writeText(code);
    showToast(`Open a TeamCode project first — ${kindLabel} code copied to clipboard`, 'warning');
    return;
  }

  const rootDir = state.teamCodePath;
  const packageDir = joinProjectPath(rootDir, packageFolder);
  const filePath = joinProjectPath(packageDir, `${className}.java`);

  try {
    await window.ftcIDE.fs.createDir(packageDir);
    await window.ftcIDE.fs.writeFile(filePath, code);
    await refreshFileTree();
    await openFile(filePath);
    showToast(`${kindLabel} class created in ${packageFolder}/`, 'success');
  } catch (err) {
    showToast(`Failed to create ${kindLabel}: ${err.message}`, 'error');
  }
}

function insertGeneratedCode(code) {
  if (monacoEditor && state.activeFile) {
    const pos = monacoEditor.getPosition();
    monacoEditor.executeEdits('builder', [{
      range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
      text: code
    }]);
    activateTab(state.activeFile);
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
    activateTab(state.activeFile);
    showToast('Code inserted into editor', 'success');
  } else {
    navigator.clipboard.writeText(code);
    showToast('No file open — code copied to clipboard instead', 'info');
  }
}

// ── Path Visualizer (embedded pedropathing.com) ───────────
let pvInitialized = false;

function initPathVisualizer() {
  if (pvInitialized) return;
  pvInitialized = true;

  document.getElementById('pv-close').addEventListener('click', closeAppView);
  document.getElementById('pv-open-external').addEventListener('click', () => {
    window.ftcIDE.shell.openExternal('https://visualizer.pedropathing.com');
  });

  document.getElementById('pv-save-path').addEventListener('click', () => {
    showSavePathDialog();
  });

  document.getElementById('pv-load-paths').addEventListener('click', () => {
    const panel = document.getElementById('pv-saved-paths-panel');
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : '';
    if (!isVisible) renderSavedPaths();
  });

  document.getElementById('pv-close-saved-panel').addEventListener('click', () => {
    document.getElementById('pv-saved-paths-panel').style.display = 'none';
  });
}

function showSavePathDialog() {
  const existing = document.getElementById('pv-save-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.id = 'pv-save-dialog';
  dialog.className = 'modal-overlay';
  dialog.style.display = 'flex';
  dialog.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header">
        <h3>Save Path from Visualizer</h3>
        <button class="icon-btn" id="pv-save-dialog-close">✕</button>
      </div>
      <div class="modal-body" style="max-height:400px; overflow-y:auto;">
        <p style="color:var(--fg-dim); font-size:12px; margin-bottom:12px;">
          Enter the path waypoints from the visualizer. Copy the coordinates from the PedroPathing visualizer.
        </p>
        <div class="form-group">
          <label>Path Name</label>
          <input type="text" id="pv-path-name" value="" placeholder="e.g. Score Specimen" class="text-input" />
        </div>
        <div id="pv-waypoints-container">
          <div class="panel-section-title">WAYPOINTS</div>
          <div class="pv-waypoint-entry" data-index="0">
            <div style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
              <span style="font-size:11px; color:var(--fg-dim); min-width:40px;">Start:</span>
              <input type="number" class="text-input small pv-wp-x" placeholder="X" value="0" step="any" style="width:70px;" />
              <input type="number" class="text-input small pv-wp-y" placeholder="Y" value="0" step="any" style="width:70px;" />
              <input type="number" class="text-input small pv-wp-h" placeholder="Heading°" value="0" step="any" style="width:80px;" />
            </div>
          </div>
          <div class="pv-waypoint-entry" data-index="1">
            <div style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
              <span style="font-size:11px; color:var(--fg-dim); min-width:40px;">End:</span>
              <input type="number" class="text-input small pv-wp-x" placeholder="X" value="0" step="any" style="width:70px;" />
              <input type="number" class="text-input small pv-wp-y" placeholder="Y" value="0" step="any" style="width:70px;" />
              <input type="number" class="text-input small pv-wp-h" placeholder="Heading°" value="0" step="any" style="width:80px;" />
            </div>
          </div>
        </div>
        <div style="margin-top:8px;">
          <button class="btn-secondary small" id="pv-add-waypoint">+ Add Waypoint</button>
          <button class="btn-secondary small" id="pv-add-control-point">+ Add Control Point</button>
        </div>
        <div id="pv-control-points-container" style="margin-top:8px;">
        </div>
      </div>
      <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end; padding:12px 16px; border-top:1px solid var(--border);">
        <button class="btn-secondary small" id="pv-save-dialog-cancel">Cancel</button>
        <button class="btn-primary small" id="pv-save-dialog-confirm">Save Path</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  let controlPointCount = 0;

  document.getElementById('pv-save-dialog-close').addEventListener('click', () => dialog.remove());
  document.getElementById('pv-save-dialog-cancel').addEventListener('click', () => dialog.remove());

  document.getElementById('pv-add-waypoint').addEventListener('click', () => {
    const container = document.getElementById('pv-waypoints-container');
    const entries = container.querySelectorAll('.pv-waypoint-entry');
    const idx = entries.length;
    const entry = document.createElement('div');
    entry.className = 'pv-waypoint-entry';
    entry.dataset.index = idx;
    entry.innerHTML = `
      <div style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
        <span style="font-size:11px; color:var(--fg-dim); min-width:40px;">Pt ${idx}:</span>
        <input type="number" class="text-input small pv-wp-x" placeholder="X" value="0" step="any" style="width:70px;" />
        <input type="number" class="text-input small pv-wp-y" placeholder="Y" value="0" step="any" style="width:70px;" />
        <input type="number" class="text-input small pv-wp-h" placeholder="Heading°" value="0" step="any" style="width:80px;" />
        <button class="icon-btn pv-remove-wp" title="Remove" style="font-size:12px;">✕</button>
      </div>
    `;
    const lastEntry = entries[entries.length - 1];
    container.insertBefore(entry, lastEntry);
    entry.querySelector('.pv-remove-wp').addEventListener('click', () => entry.remove());
  });

  document.getElementById('pv-add-control-point').addEventListener('click', () => {
    controlPointCount++;
    const container = document.getElementById('pv-control-points-container');
    const entry = document.createElement('div');
    entry.className = 'pv-control-point-entry';
    entry.innerHTML = `
      <div style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
        <span style="font-size:11px; color:var(--fg-dim); min-width:40px;">Ctrl ${controlPointCount}:</span>
        <input type="number" class="text-input small pv-cp-x" placeholder="X" value="0" step="any" style="width:70px;" />
        <input type="number" class="text-input small pv-cp-y" placeholder="Y" value="0" step="any" style="width:70px;" />
        <button class="icon-btn pv-remove-cp" title="Remove" style="font-size:12px;">✕</button>
      </div>
    `;
    container.appendChild(entry);
    entry.querySelector('.pv-remove-cp').addEventListener('click', () => entry.remove());
  });

  document.getElementById('pv-save-dialog-confirm').addEventListener('click', async () => {
    const name = document.getElementById('pv-path-name').value.trim();
    if (!name) { showToast('Enter a path name', 'warning'); return; }

    const waypoints = [];
    document.querySelectorAll('#pv-waypoints-container .pv-waypoint-entry').forEach(entry => {
      waypoints.push({
        x: parseFloat(entry.querySelector('.pv-wp-x').value) || 0,
        y: parseFloat(entry.querySelector('.pv-wp-y').value) || 0,
        heading: parseFloat(entry.querySelector('.pv-wp-h').value) || 0
      });
    });

    const controlPoints = [];
    document.querySelectorAll('#pv-control-points-container .pv-control-point-entry').forEach(entry => {
      controlPoints.push({
        x: parseFloat(entry.querySelector('.pv-cp-x').value) || 0,
        y: parseFloat(entry.querySelector('.pv-cp-y').value) || 0
      });
    });

    if (waypoints.length < 2) { showToast('A path needs at least 2 waypoints', 'warning'); return; }

    const pathData = {
      name,
      date: new Date().toISOString(),
      waypoints,
      controlPoints
    };

    let saved = [];
    try {
      const raw = await window.ftcIDE.settings.get('paths.saved');
      if (Array.isArray(raw)) saved = raw;
    } catch { /* ignore */ }

    saved.push(pathData);
    await window.ftcIDE.settings.set('paths.saved', saved);

    dialog.remove();
    showToast(`Path "${name}" saved`, 'success');
  });
}

async function renderSavedPaths() {
  const list = document.getElementById('pv-saved-paths-list');
  let saved = [];
  try {
    const raw = await window.ftcIDE.settings.get('paths.saved');
    if (Array.isArray(raw)) saved = raw;
  } catch { /* ignore */ }

  if (saved.length === 0) {
    list.innerHTML = '<div class="pv-empty-msg">No saved paths yet. Design a path in the visualizer, then click "Save Path".</div>';
    return;
  }

  list.innerHTML = '';
  saved.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'pv-path-item';
    const dateStr = p.date ? new Date(p.date).toLocaleDateString() : '';
    const wpCount = (p.waypoints || []).length;
    const cpCount = (p.controlPoints || []).length;
    const escapedName = p.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    item.innerHTML = `
      <div class="pv-path-item-header">
        <span class="pv-path-item-name">${escapedName}</span>
        <span class="pv-path-item-date">${dateStr}</span>
      </div>
      <div class="pv-path-item-points">${wpCount} waypoints${cpCount > 0 ? ', ' + cpCount + ' control points' : ''}</div>
      <div class="pv-path-actions">
        <button class="btn-primary small pv-use-in-opmode" data-idx="${idx}">Use in OpMode</button>
        <button class="btn-secondary small pv-delete-path" data-idx="${idx}">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('.pv-use-in-opmode').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const pathData = saved[idx];
      if (pathData) {
        state.pendingPathForOpMode = pathData;
        document.getElementById('pv-saved-paths-panel').style.display = 'none';
        openAppView('opmode-builder');
        showToast(`Path "${pathData.name}" ready — add a "Follow Path" step to use it`, 'info');
      }
    });
  });

  list.querySelectorAll('.pv-delete-path').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      saved.splice(idx, 1);
      await window.ftcIDE.settings.set('paths.saved', saved);
      renderSavedPaths();
      showToast('Path deleted', 'info');
    });
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

  // Bind all inputs and selects to update preview
  document.getElementById('pc-form').querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', updatePCPreview);
    el.addEventListener('change', updatePCPreview);
  });

  updatePCPreview();
}

function updatePCPreview() {
  const el = document.getElementById('pc-preview');
  if (el) el.textContent = generatePedroConstantsCode();
}

function generatePedroConstantsCode() {
  const v = (id) => document.getElementById(id).value || '0';
  const checked = (id) => document.getElementById(id).checked;

  let code = '// Generated by ChuckleIDE Pedro Constants Manager\n';
  code += 'package org.firstinspires.ftc.teamcode;\n\n';
  code += 'import com.pedropathing.localization.constants.PinpointConstants;\n';
  code += 'import com.pedropathing.follower.FollowerConstants;\n';
  code += 'import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;\n\n';

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

  // Secondary Translational PIDF
  if (checked('pc-useSecTrans')) {
    code += '\n        FollowerConstants.useSecondaryTranslationalPID = true;\n';
    code += `        FollowerConstants.secondaryTranslationalPIDFCoefficients.setCoefficients(${v('pc-secTransP')}, ${v('pc-secTransI')}, ${v('pc-secTransD')}, ${v('pc-secTransF')});\n`;
    code += `        FollowerConstants.secondaryTranslationalPIDFSwitch = ${v('pc-secTransSwitch')};\n`;
  }
  // Secondary Heading PIDF
  if (checked('pc-useSecHead')) {
    code += '\n        FollowerConstants.useSecondaryHeadingPID = true;\n';
    code += `        FollowerConstants.secondaryHeadingPIDFCoefficients.setCoefficients(${v('pc-secHeadP')}, ${v('pc-secHeadI')}, ${v('pc-secHeadD')}, ${v('pc-secHeadF')});\n`;
    code += `        FollowerConstants.secondaryHeadingPIDFSwitch = Math.toRadians(${v('pc-secHeadSwitch')});\n`;
  }
  // Secondary Drive PIDF
  if (checked('pc-useSecDrive')) {
    code += '\n        FollowerConstants.useSecondaryDrivePID = true;\n';
    code += `        FollowerConstants.secondaryDrivePIDFCoefficients.setCoefficients(${v('pc-secDriveP')}, ${v('pc-secDriveI')}, ${v('pc-secDriveD')}, ${v('pc-secDriveF')});\n`;
    code += `        FollowerConstants.secondaryDrivePIDFSwitch = ${v('pc-secDriveSwitch')};\n`;
  }

  code += '    }\n';
  code += '}\n\n';

  // LConstants – Pinpoint localizer
  const hwName = document.getElementById('pc-ppHwName').value || 'pinpoint';
  const encoderRes = document.getElementById('pc-ppEncoderRes').value;
  const useCustomRes = encoderRes === 'custom';
  code += '/**\n * PedroPathing localization constants for GoBilda Pinpoint.\n */\n';
  code += 'public class LConstants {\n';
  code += '    static {\n';
  code += `        PinpointConstants.hardwareMapName = "${hwName}";\n`;
  if (useCustomRes) {
    code += '        PinpointConstants.useCustomEncoderResolution = true;\n';
    code += `        PinpointConstants.customEncoderResolution = ${v('pc-ppCustomRes')};\n`;
  } else {
    code += '        PinpointConstants.useCustomEncoderResolution = false;\n';
    code += `        PinpointConstants.encoderResolution = GoBildaPinpointDriver.GoBildaOdometryPods.${encoderRes};\n`;
  }
  code += `        PinpointConstants.forwardEncoderDirection = GoBildaPinpointDriver.EncoderDirection.${v('pc-ppFwdDir')};\n`;
  code += `        PinpointConstants.strafeEncoderDirection = GoBildaPinpointDriver.EncoderDirection.${v('pc-ppStrDir')};\n`;
  if (checked('pc-ppUseYawScalar')) {
    code += '        PinpointConstants.useYawScalar = true;\n';
    code += `        PinpointConstants.yawScalar = ${v('pc-ppYawScalar')};\n`;
  } else {
    code += '        PinpointConstants.useYawScalar = false;\n';
  }
  code += `        PinpointConstants.xOffset = ${v('pc-ppXOffset')};\n`;
  code += `        PinpointConstants.yOffset = ${v('pc-ppYOffset')};\n`;
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
  document.getElementById('lut-insert-code').addEventListener('click', async () => {
    const className = getGeneratedClassName('lut-class-name', 'MyLookupTable');
    await insertGeneratedClass(generateLUTCode(), 'global', className, 'GlobalLut');
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
  code += 'package org.firstinspires.ftc.teamcode.global;\n\n';
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
  document.getElementById('ilut-insert-code').addEventListener('click', async () => {
    const className = getGeneratedClassName('ilut-class-name', 'MyInterpLUT');
    await insertGeneratedClass(generateILUTCode(), 'global', className, 'GlobalInterpLut');
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
  code += 'package org.firstinspires.ftc.teamcode.global;\n\n';
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
  document.getElementById('enum-insert-code').addEventListener('click', async () => {
    const className = getGeneratedClassName('enum-class-name', 'RobotState');
    await insertGeneratedClass(generateEnumCode(), 'global', className, 'GlobalEnum');
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
  code += 'package org.firstinspires.ftc.teamcode.global;\n\n';
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
  document.getElementById('obj-insert-code').addEventListener('click', async () => {
    const className = getGeneratedClassName('obj-class-name', 'RobotConfig');
    await insertGeneratedClass(generateObjectCode(), 'global', className, 'GlobalObject');
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
  code += 'package org.firstinspires.ftc.teamcode.global;\n\n';
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

// ── Utility Builder ───────────────────────────────────────
let ubInitialized = false;
let ubSelected = {}; // { methodId: true/false }

const utilMethods = {
  math: [
    {
      id: 'clamp',
      label: 'clamp(value, min, max)',
      desc: 'Constrain a value between a minimum and maximum',
      code:
`    public static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }`
    },
    {
      id: 'lerp',
      label: 'lerp(a, b, t)',
      desc: 'Linear interpolation between two values',
      code:
`    public static double lerp(double a, double b, double t) {
        return a + (b - a) * t;
    }`
    },
    {
      id: 'inverseLerp',
      label: 'inverseLerp(a, b, value)',
      desc: 'Inverse linear interpolation — find t given value',
      code:
`    public static double inverseLerp(double a, double b, double value) {
        if (Math.abs(b - a) < 1e-9) return 0.0;
        return (value - a) / (b - a);
    }`
    },
    {
      id: 'normalizeAngle',
      label: 'normalizeAngle(angle)',
      desc: 'Normalize an angle in radians to [-π, π]',
      code:
`    public static double normalizeAngle(double angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }`
    },
    {
      id: 'angleWrap',
      label: 'angleWrap(angle)',
      desc: 'Wrap an angle in degrees to [0, 360)',
      code:
`    public static double angleWrap(double degrees) {
        degrees %= 360;
        if (degrees < 0) degrees += 360;
        return degrees;
    }`
    },
    {
      id: 'toDegrees',
      label: 'toDegrees(radians)',
      desc: 'Convert radians to degrees',
      code:
`    public static double toDegrees(double radians) {
        return radians * 180.0 / Math.PI;
    }`
    },
    {
      id: 'toRadians',
      label: 'toRadians(degrees)',
      desc: 'Convert degrees to radians',
      code:
`    public static double toRadians(double degrees) {
        return degrees * Math.PI / 180.0;
    }`
    },
    {
      id: 'approxEquals',
      label: 'approxEquals(a, b, epsilon)',
      desc: 'Check if two doubles are approximately equal',
      code:
`    public static boolean approxEquals(double a, double b, double epsilon) {
        return Math.abs(a - b) < epsilon;
    }`
    }
  ],
  vector: [
    {
      id: 'vec2d_class',
      label: 'Vector2d class',
      desc: 'Full 2D vector class with common operations',
      code:
`    public static class Vector2d {
        public double x;
        public double y;

        public Vector2d(double x, double y) {
            this.x = x;
            this.y = y;
        }

        public Vector2d() {
            this(0, 0);
        }

        public Vector2d add(Vector2d other) {
            return new Vector2d(x + other.x, y + other.y);
        }

        public Vector2d subtract(Vector2d other) {
            return new Vector2d(x - other.x, y - other.y);
        }

        public Vector2d scale(double scalar) {
            return new Vector2d(x * scalar, y * scalar);
        }

        public double magnitude() {
            return Math.hypot(x, y);
        }

        public Vector2d normalized() {
            double mag = magnitude();
            if (mag < 1e-9) return new Vector2d(0, 0);
            return new Vector2d(x / mag, y / mag);
        }

        public double dot(Vector2d other) {
            return x * other.x + y * other.y;
        }

        public double cross(Vector2d other) {
            return x * other.y - y * other.x;
        }

        public double distanceTo(Vector2d other) {
            return Math.hypot(x - other.x, y - other.y);
        }

        public double angleTo(Vector2d other) {
            return Math.atan2(other.y - y, other.x - x);
        }

        public Vector2d rotated(double angleRadians) {
            double cos = Math.cos(angleRadians);
            double sin = Math.sin(angleRadians);
            return new Vector2d(x * cos - y * sin, x * sin + y * cos);
        }

        @Override
        public String toString() {
            return String.format("(%.2f, %.2f)", x, y);
        }
    }`
    },
    {
      id: 'vec_distance',
      label: 'distance(x1, y1, x2, y2)',
      desc: 'Distance between two 2D points',
      code:
`    public static double distance(double x1, double y1, double x2, double y2) {
        return Math.hypot(x2 - x1, y2 - y1);
    }`
    },
    {
      id: 'vec_heading',
      label: 'headingBetween(x1, y1, x2, y2)',
      desc: 'Angle in radians from one point to another',
      code:
`    public static double headingBetween(double x1, double y1, double x2, double y2) {
        return Math.atan2(y2 - y1, x2 - x1);
    }`
    }
  ],
  odometry: [
    {
      id: 'pinpoint_pose',
      label: 'Pose2d class',
      desc: 'Simple pose class for x, y, heading used with odometry',
      code:
`    public static class Pose2d {
        public double x;
        public double y;
        public double heading;

        public Pose2d(double x, double y, double heading) {
            this.x = x;
            this.y = y;
            this.heading = heading;
        }

        public Pose2d() {
            this(0, 0, 0);
        }

        public double distanceTo(Pose2d other) {
            return Math.hypot(x - other.x, y - other.y);
        }

        public double headingDiff(Pose2d other) {
            double diff = other.heading - heading;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            return diff;
        }

        @Override
        public String toString() {
            return String.format("Pose2d(%.2f, %.2f, %.2f°)", x, y, Math.toDegrees(heading));
        }
    }`
    },
    {
      id: 'pinpoint_update',
      label: 'updatePinpointOdometry()',
      desc: 'Helper to read position from GoBilda Pinpoint and return a Pose2d',
      code:
`    /**
     * Reads the current position from a GoBilda Pinpoint odometry computer.
     * Requires Pose2d class (select it above) and the Pinpoint driver.
     *
     * @param pinpoint the GoBildaPinpointDriver instance
     * @return current robot Pose2d
     */
    public static Pose2d updatePinpointOdometry(GoBildaPinpointDriver pinpoint) {
        pinpoint.update();
        Pose2D pos = pinpoint.getPosition();
        return new Pose2d(pos.getX(DistanceUnit.INCH), pos.getY(DistanceUnit.INCH),
                          pos.getHeading(AngleUnit.RADIAN));
    }`
    },
    {
      id: 'pinpoint_reset',
      label: 'resetPinpointPosition()',
      desc: 'Reset the Pinpoint odometry position to a given pose',
      code:
`    /**
     * Resets the Pinpoint odometry computer position.
     *
     * @param pinpoint the GoBildaPinpointDriver instance
     * @param x        new x position in inches
     * @param y        new y position in inches
     * @param heading  new heading in radians
     */
    public static void resetPinpointPosition(GoBildaPinpointDriver pinpoint,
                                              double x, double y, double heading) {
        pinpoint.setPosition(new Pose2D(DistanceUnit.INCH, x, y, AngleUnit.RADIAN, heading));
    }`
    },
    {
      id: 'pinpoint_velocity',
      label: 'getPinpointVelocity()',
      desc: 'Read the current velocity from the Pinpoint sensor',
      code:
`    /**
     * Reads the current velocity from a GoBilda Pinpoint odometry computer.
     * Requires Pose2d class (select it above) and the Pinpoint driver.
     *
     * @param pinpoint the GoBildaPinpointDriver instance
     * @return current velocity as Pose2d (vx, vy, angular velocity)
     */
    public static Pose2d getPinpointVelocity(GoBildaPinpointDriver pinpoint) {
        Pose2D vel = pinpoint.getVelocity();
        return new Pose2d(vel.getX(DistanceUnit.INCH), vel.getY(DistanceUnit.INCH),
                          vel.getHeading(AngleUnit.RADIAN));
    }`
    }
  ],
  misc: [
    {
      id: 'range_scale',
      label: 'scaleRange(value, inMin, inMax, outMin, outMax)',
      desc: 'Map a value from one range to another',
      code:
`    public static double scaleRange(double value, double inMin, double inMax,
                                     double outMin, double outMax) {
        return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
    }`
    },
    {
      id: 'deadband',
      label: 'deadband(value, threshold)',
      desc: 'Apply a deadband — return 0 if value is within threshold of 0',
      code:
`    public static double deadband(double value, double threshold) {
        return Math.abs(value) < threshold ? 0.0 : value;
    }`
    },
    {
      id: 'avg',
      label: 'average(values...)',
      desc: 'Compute the average of a variable number of doubles',
      code:
`    public static double average(double... values) {
        if (values.length == 0) return 0.0;
        double sum = 0;
        for (double v : values) sum += v;
        return sum / values.length;
    }`
    },
    {
      id: 'timer',
      label: 'ElapsedTimer class',
      desc: 'Simple elapsed-time helper using System.nanoTime()',
      code:
`    public static class ElapsedTimer {
        private long startTime;

        public ElapsedTimer() {
            reset();
        }

        public void reset() {
            startTime = System.nanoTime();
        }

        /** Returns elapsed time in seconds. */
        public double seconds() {
            return (System.nanoTime() - startTime) / 1e9;
        }

        /** Returns elapsed time in milliseconds. */
        public double milliseconds() {
            return (System.nanoTime() - startTime) / 1e6;
        }

        /** Returns true if the specified number of seconds have elapsed. */
        public boolean hasElapsed(double duration) {
            return seconds() >= duration;
        }
    }`
    },
    {
      id: 'pid_simple',
      label: 'SimplePID class',
      desc: 'Basic PID controller with kP, kI, kD coefficients',
      code:
`    public static class SimplePID {
        private final double kP, kI, kD;
        private double integral = 0;
        private double previousError = 0;
        private long previousTime = System.nanoTime();

        public SimplePID(double kP, double kI, double kD) {
            this.kP = kP;
            this.kI = kI;
            this.kD = kD;
        }

        public double calculate(double error) {
            long now = System.nanoTime();
            double dt = (now - previousTime) / 1e9;
            if (dt <= 0) dt = 1e-3;
            integral += error * dt;
            double derivative = (error - previousError) / dt;
            previousError = error;
            previousTime = now;
            return kP * error + kI * integral + kD * derivative;
        }

        public void reset() {
            integral = 0;
            previousError = 0;
            previousTime = System.nanoTime();
        }
    }`
    }
  ]
};

const utilCategoryLabels = {
  math: 'Math Utilities',
  vector: 'Vectors',
  odometry: 'Odometry (Pinpoint)',
  misc: 'Miscellaneous'
};

function initUtilBuilder() {
  if (ubInitialized) { updateUBPreview(); return; }
  ubInitialized = true;

  // Default: select all math utilities
  for (const m of utilMethods.math) ubSelected[m.id] = true;

  document.getElementById('ub-close').addEventListener('click', closeAppView);
  document.getElementById('ub-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(generateUtilCode());
    showToast('Utility code copied', 'success');
  });
  document.getElementById('ub-insert-code').addEventListener('click', async () => {
    const className = getGeneratedClassName('ub-class-name', 'MathUtils');
    await insertGeneratedClass(generateUtilCode(), 'util', className, 'Utility');
  });
  document.getElementById('ub-refresh').addEventListener('click', updateUBPreview);
  document.getElementById('ub-class-name').addEventListener('input', updateUBPreview);
  document.getElementById('ub-category').addEventListener('change', () => {
    renderUBMethods();
    updateUBPreview();
  });

  renderUBMethods();
  updateUBPreview();
}

function renderUBMethods() {
  const container = document.getElementById('ub-methods-container');
  const category = document.getElementById('ub-category').value;
  container.innerHTML = '';

  const methods = utilMethods[category] || [];

  const group = document.createElement('div');
  group.className = 'ub-category-group';

  const title = document.createElement('div');
  title.className = 'ub-category-title';
  title.textContent = utilCategoryLabels[category] || category;
  group.appendChild(title);

  for (const method of methods) {
    const item = document.createElement('div');
    item.className = 'ub-method-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'ub-chk-' + method.id;
    checkbox.checked = !!ubSelected[method.id];
    checkbox.addEventListener('change', () => {
      ubSelected[method.id] = checkbox.checked;
      updateUBPreview();
    });
    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = method.label;
    item.appendChild(checkbox);
    item.appendChild(label);
    group.appendChild(item);

    if (method.desc) {
      const desc = document.createElement('div');
      desc.className = 'ub-method-desc';
      desc.textContent = method.desc;
      group.appendChild(desc);
    }
  }

  container.appendChild(group);
}

function updateUBPreview() {
  const el = document.getElementById('ub-preview');
  if (el) el.textContent = generateUtilCode();
}

function generateUtilCode() {
  const className = document.getElementById('ub-class-name').value || 'MathUtils';

  // Collect all selected methods across all categories
  const selected = [];
  for (const cat of Object.keys(utilMethods)) {
    for (const m of utilMethods[cat]) {
      if (ubSelected[m.id]) {
        selected.push(m);
      }
    }
  }

  // Determine needed imports
  const needsOdometryImports = selected.some(m =>
    m.id === 'pinpoint_update' || m.id === 'pinpoint_reset' || m.id === 'pinpoint_velocity'
  );

  let code = '// Generated by ChuckleIDE Utility Builder\n';
  code += 'package org.firstinspires.ftc.teamcode.util;\n\n';

  if (needsOdometryImports) {
    code += 'import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;\n';
    code += 'import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;\n';
    code += 'import org.firstinspires.ftc.robotcore.external.navigation.Pose2D;\n';
    code += 'import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;\n';
    code += '\n';
  }

  code += `public class ${className} {\n\n`;
  code += `    private ${className}() {} // Utility class -- no instances\n`;

  for (const m of selected) {
    code += '\n' + m.code + '\n';
  }

  code += '}\n';
  return code;
}

// ── Vision Builder ────────────────────────────────────────
let visInitialized = false;

function initVisionBuilder() {
  if (visInitialized) { updateVisPreview(); return; }
  visInitialized = true;

  const typeSelect = document.getElementById('vis-type');

  function showOptionsForType() {
    document.querySelectorAll('.vis-options-group').forEach(g => g.style.display = 'none');
    const sel = typeSelect.value;
    const group = document.getElementById('vis-options-' + sel);
    if (group) group.style.display = '';
    updateVisPreview();
  }

  typeSelect.addEventListener('change', showOptionsForType);

  document.getElementById('vis-close').addEventListener('click', closeAppView);
  document.getElementById('vis-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(generateVisionCode());
    showToast('Vision code copied', 'success');
  });
  document.getElementById('vis-insert-code').addEventListener('click', async () => {
    const className = getGeneratedClassName('vis-class-name', 'VisionSubsystem');
    await insertGeneratedClass(generateVisionCode(), 'subsystems', className, 'Vision Subsystem');
  });
  document.getElementById('vis-refresh').addEventListener('click', updateVisPreview);

  document.getElementById('vis-class-name').addEventListener('input', updateVisPreview);

  document.querySelectorAll('#app-view-vision-builder select, #app-view-vision-builder input').forEach(el => {
    el.addEventListener('change', updateVisPreview);
    el.addEventListener('input', updateVisPreview);
  });

  showOptionsForType();
  updateVisPreview();
}

function updateVisPreview() {
  const el = document.getElementById('vis-preview');
  if (el) el.textContent = generateVisionCode();
}

function generateVisionCode() {
  const type = document.getElementById('vis-type').value;
  switch (type) {
    case 'apriltag':    return generateAprilTagCode();
    case 'tensorflow':  return generateTensorFlowCode();
    case 'huskylens':   return generateHuskyLensCode();
    case 'limelight':   return generateLimelightCode();
    case 'opencv':      return generateOpenCVCode();
    case 'colorblob':   return generateColorBlobCode();
    default:            return '// Select a vision type';
  }
}

function generateAprilTagCode() {
  const className = document.getElementById('vis-class-name').value || 'AprilTagSubsystem';
  const camera    = document.getElementById('vis-at-camera').value || 'Webcam 1';
  const res       = (document.getElementById('vis-at-resolution').value || '640,480').split(',');
  const resW      = res[0] || '640';
  const resH      = res[1] || '480';
  const family    = document.getElementById('vis-at-family').value;
  const axes      = document.getElementById('vis-at-axes').value;
  const cube      = document.getElementById('vis-at-cube').value;
  const outline   = document.getElementById('vis-at-outline').value;
  const navigate  = document.getElementById('vis-at-navigate').value === 'true';

  let code = '// Generated by ChuckleIDE Vision Builder\n';
  code += 'package org.firstinspires.ftc.teamcode.subsystems;\n\n';
  code += 'import com.qualcomm.robotcore.hardware.HardwareMap;\n';
  code += 'import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;\n';
  code += 'import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;\n';
  code += 'import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;\n';
  code += 'import org.firstinspires.ftc.vision.VisionPortal;\n';
  code += 'import org.firstinspires.ftc.vision.apriltag.AprilTagDetection;\n';
  code += 'import org.firstinspires.ftc.vision.apriltag.AprilTagGameDatabase;\n';
  code += 'import org.firstinspires.ftc.vision.apriltag.AprilTagProcessor;\n\n';
  code += 'import java.util.List;\n\n';
  code += `public class ${className} {\n\n`;
  code += '    private VisionPortal visionPortal;\n';
  code += '    private AprilTagProcessor aprilTagProcessor;\n\n';

  // Constructor
  code += `    public ${className}(HardwareMap hardwareMap) {\n`;
  code += '        aprilTagProcessor = new AprilTagProcessor.Builder()\n';
  code += `                .setDrawAxes(${axes})\n`;
  code += `                .setDrawCubeProjection(${cube})\n`;
  code += `                .setDrawTagOutline(${outline})\n`;
  code += `                .setTagFamily(AprilTagProcessor.TagFamily.${family})\n`;
  code += '                .setTagLibrary(AprilTagGameDatabase.getCenterStageTagLibrary())\n';
  code += '                .setOutputUnits(DistanceUnit.INCH, AngleUnit.DEGREES)\n';
  code += '                .build();\n\n';
  code += '        visionPortal = new VisionPortal.Builder()\n';
  code += `                .setCamera(hardwareMap.get(WebcamName.class, "${camera}"))\n`;
  code += `                .setCameraResolution(new android.util.Size(${resW}, ${resH}))\n`;
  code += '                .setStreamFormat(VisionPortal.StreamFormat.YUY2)\n';
  code += '                .addProcessor(aprilTagProcessor)\n';
  code += '                .build();\n';
  code += '    }\n';

  // Public methods
  code += '\n    /** Returns all currently detected AprilTags. */\n';
  code += '    public List<AprilTagDetection> getDetections() {\n';
  code += '        return aprilTagProcessor.getDetections();\n';
  code += '    }\n';

  code += '\n    /** Returns the closest detected tag, or null if none are visible. */\n';
  code += '    public AprilTagDetection getClosestTag() {\n';
  code += '        List<AprilTagDetection> detections = aprilTagProcessor.getDetections();\n';
  code += '        AprilTagDetection closest = null;\n';
  code += '        double minRange = Double.MAX_VALUE;\n';
  code += '        for (AprilTagDetection d : detections) {\n';
  code += '            if (d.ftcPose != null && d.ftcPose.range < minRange) {\n';
  code += '                minRange = d.ftcPose.range;\n';
  code += '                closest = d;\n';
  code += '            }\n';
  code += '        }\n';
  code += '        return closest;\n';
  code += '    }\n';

  code += '\n    /** Returns the detection for a specific tag ID, or null if not visible. */\n';
  code += '    public AprilTagDetection getTagById(int id) {\n';
  code += '        for (AprilTagDetection d : aprilTagProcessor.getDetections()) {\n';
  code += '            if (d.id == id) return d;\n';
  code += '        }\n';
  code += '        return null;\n';
  code += '    }\n';

  code += '\n    /** Returns true if the specified tag is currently visible. */\n';
  code += '    public boolean isTagVisible(int id) {\n';
  code += '        return getTagById(id) != null;\n';
  code += '    }\n';

  code += '\n    /** Returns range to the specified tag in inches, or -1 if not visible. */\n';
  code += '    public double getRangeToTag(int id) {\n';
  code += '        AprilTagDetection d = getTagById(id);\n';
  code += '        return (d != null && d.ftcPose != null) ? d.ftcPose.range : -1;\n';
  code += '    }\n';

  code += '\n    /** Returns bearing to the specified tag in degrees, or 0 if not visible. */\n';
  code += '    public double getBearingToTag(int id) {\n';
  code += '        AprilTagDetection d = getTagById(id);\n';
  code += '        return (d != null && d.ftcPose != null) ? d.ftcPose.bearing : 0;\n';
  code += '    }\n';

  if (navigate) {
    code += '\n    /**\n';
    code += '     * Computes drive, strafe, and turn powers to navigate toward a tag.\n';
    code += '     * A typical desiredRange is 12.0 inches.\n';
    code += '     * Returns a 3-element array: [drive, strafe, turn], or null if pose unavailable.\n';
    code += '     */\n';
    code += '    public double[] navigateToTag(AprilTagDetection detection, double desiredRange) {\n';
    code += '        if (detection.ftcPose == null) return null;\n';
    code += '        double rangeError   = detection.ftcPose.range - desiredRange;\n';
    code += '        double headingError = detection.ftcPose.bearing;\n';
    code += '        double yawError     = detection.ftcPose.yaw;\n\n';
    code += '        double drive  = -rangeError   * 0.05;\n';
    code += '        double strafe =  headingError * 0.05;\n';
    code += '        double turn   = -yawError     * 0.03;\n';
    code += '        return new double[]{drive, strafe, turn};\n';
    code += '    }\n';
  }

  code += '\n    /** Resumes the vision portal streaming. */\n';
  code += '    public void start() {\n';
  code += '        visionPortal.resumeStreaming();\n';
  code += '    }\n';

  code += '\n    /** Pauses the vision portal streaming. */\n';
  code += '    public void stop() {\n';
  code += '        visionPortal.stopStreaming();\n';
  code += '    }\n';

  code += '\n    /** Closes the vision portal and releases resources. */\n';
  code += '    public void close() {\n';
  code += '        if (visionPortal != null) {\n';
  code += '            visionPortal.close();\n';
  code += '        }\n';
  code += '    }\n';
  code += '}\n';
  return code;
}

function generateTensorFlowCode() {
  const className  = document.getElementById('vis-class-name').value || 'TFODSubsystem';
  const camera     = document.getElementById('vis-tf-camera').value || 'Webcam 1';
  const res        = (document.getElementById('vis-tf-resolution').value || '640,480').split(',');
  const resW       = res[0] || '640';
  const resH       = res[1] || '480';
  const model      = document.getElementById('vis-tf-model').value.trim();
  const labelsRaw  = document.getElementById('vis-tf-labels').value;
  const confidence = document.getElementById('vis-tf-confidence').value || '0.6';
  const detectPos  = document.getElementById('vis-tf-position').value === 'true';
  const labels     = labelsRaw.split(',').map(l => l.trim()).filter(Boolean);

  let code = '// Generated by ChuckleIDE Vision Builder\n';
  code += 'package org.firstinspires.ftc.teamcode.subsystems;\n\n';
  code += 'import com.qualcomm.robotcore.hardware.HardwareMap;\n';
  code += 'import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;\n';
  code += 'import org.firstinspires.ftc.vision.VisionPortal;\n';
  code += 'import org.firstinspires.ftc.vision.tfod.TfodProcessor;\n';
  code += 'import org.firstinspires.ftc.robotcore.external.tfod.Recognition;\n\n';
  code += 'import java.util.ArrayList;\n';
  code += 'import java.util.List;\n\n';
  code += `public class ${className} {\n\n`;

  if (model) {
    code += `    private static final String TFOD_MODEL_ASSET = "${model}";\n`;
  } else {
    code += '    private static final String TFOD_MODEL_ASSET = null;\n';
  }
  if (labels.length > 0) {
    code += '    private static final String[] LABELS = {\n';
    code += labels.map(l => `        "${l}"`).join(',\n') + '\n';
    code += '    };\n';
  } else {
    code += '    private static final String[] LABELS = {};\n';
  }

  code += '\n    private VisionPortal visionPortal;\n';
  code += '    private TfodProcessor tfodProcessor;\n';

  if (detectPos) {
    code += '\n    public enum DetectedPosition { LEFT, CENTER, RIGHT, UNKNOWN }\n';
  }

  // Constructor
  code += `\n    public ${className}(HardwareMap hardwareMap) {\n`;
  code += '        TfodProcessor.Builder tfodBuilder = new TfodProcessor.Builder()\n';
  code += `                .setMinResultConfidence(${confidence}f)\n`;
  code += '                .setIsModelTensorFlow2(true)\n';
  code += '                .setInputSize(300);\n\n';
  code += '        if (TFOD_MODEL_ASSET != null) {\n';
  code += '            tfodBuilder.setModelAssetName(TFOD_MODEL_ASSET);\n';
  code += '            tfodBuilder.setModelLabels(LABELS);\n';
  code += '        }\n\n';
  code += '        tfodProcessor = tfodBuilder.build();\n\n';
  code += '        visionPortal = new VisionPortal.Builder()\n';
  code += `                .setCamera(hardwareMap.get(WebcamName.class, "${camera}"))\n`;
  code += `                .setCameraResolution(new android.util.Size(${resW}, ${resH}))\n`;
  code += '                .addProcessor(tfodProcessor)\n';
  code += '                .build();\n';
  code += '    }\n';

  // Public methods
  code += '\n    /** Returns all current recognitions. */\n';
  code += '    public List<Recognition> getRecognitions() {\n';
  code += '        return tfodProcessor.getRecognitions();\n';
  code += '    }\n';

  code += '\n    /** Returns the recognition with the highest confidence, or null. */\n';
  code += '    public Recognition getBestRecognition() {\n';
  code += '        List<Recognition> recognitions = tfodProcessor.getRecognitions();\n';
  code += '        Recognition best = null;\n';
  code += '        float highestConf = 0;\n';
  code += '        for (Recognition rec : recognitions) {\n';
  code += '            if (rec.getConfidence() > highestConf) {\n';
  code += '                highestConf = rec.getConfidence();\n';
  code += '                best = rec;\n';
  code += '            }\n';
  code += '        }\n';
  code += '        return best;\n';
  code += '    }\n';

  code += '\n    /** Returns all recognitions matching the given label. */\n';
  code += '    public List<Recognition> getRecognitionsByLabel(String label) {\n';
  code += '        List<Recognition> filtered = new ArrayList<>();\n';
  code += '        for (Recognition rec : tfodProcessor.getRecognitions()) {\n';
  code += '            if (rec.getLabel().equalsIgnoreCase(label)) {\n';
  code += '                filtered.add(rec);\n';
  code += '            }\n';
  code += '        }\n';
  code += '        return filtered;\n';
  code += '    }\n';

  code += '\n    /** Returns true if any object with the given label is detected. */\n';
  code += '    public boolean isObjectDetected(String label) {\n';
  code += '        return !getRecognitionsByLabel(label).isEmpty();\n';
  code += '    }\n';

  code += '\n    /** Returns the center position [x, y] of the best detection, or null. */\n';
  code += '    public double[] getDetectedPosition() {\n';
  code += '        Recognition best = getBestRecognition();\n';
  code += '        if (best == null) return null;\n';
  code += '        double x = (best.getLeft() + best.getRight()) / 2.0;\n';
  code += '        double y = (best.getTop() + best.getBottom()) / 2.0;\n';
  code += '        return new double[]{x, y};\n';
  code += '    }\n';

  code += '\n    /** Returns the confidence for the best recognition of a given label, or -1. */\n';
  code += '    public float getConfidence(String label) {\n';
  code += '        List<Recognition> matches = getRecognitionsByLabel(label);\n';
  code += '        float best = -1;\n';
  code += '        for (Recognition rec : matches) {\n';
  code += '            if (rec.getConfidence() > best) best = rec.getConfidence();\n';
  code += '        }\n';
  code += '        return best;\n';
  code += '    }\n';

  if (detectPos) {
    code += '\n    /** Determines the screen-third position of the best detection. */\n';
    code += '    public DetectedPosition detectPosition() {\n';
    code += '        Recognition best = getBestRecognition();\n';
    code += `        if (best == null || best.getConfidence() < ${confidence}f) {\n`;
    code += '            return DetectedPosition.UNKNOWN;\n';
    code += '        }\n';
    code += '        double centerX = (best.getLeft() + best.getRight()) / 2.0;\n';
    code += '        double imageWidth = best.getImageWidth();\n';
    code += '        if (centerX < imageWidth / 3.0) return DetectedPosition.LEFT;\n';
    code += '        if (centerX < 2.0 * imageWidth / 3.0) return DetectedPosition.CENTER;\n';
    code += '        return DetectedPosition.RIGHT;\n';
    code += '    }\n';
  }

  code += '\n    /** Resumes the vision portal streaming. */\n';
  code += '    public void start() {\n';
  code += '        visionPortal.resumeStreaming();\n';
  code += '    }\n';

  code += '\n    /** Pauses the vision portal streaming. */\n';
  code += '    public void stop() {\n';
  code += '        visionPortal.stopStreaming();\n';
  code += '    }\n';

  code += '\n    /** Closes the vision portal and releases resources. */\n';
  code += '    public void close() {\n';
  code += '        if (visionPortal != null) {\n';
  code += '            visionPortal.close();\n';
  code += '        }\n';
  code += '    }\n';
  code += '}\n';
  return code;
}

function generateHuskyLensCode() {
  const className = document.getElementById('vis-class-name').value || 'HuskyLensSubsystem';
  const hwName    = document.getElementById('vis-hl-name').value || 'huskyLens';
  const algorithm = document.getElementById('vis-hl-algorithm').value;
  const center    = document.getElementById('vis-hl-center').value === 'true';

  let code = '// Generated by ChuckleIDE Vision Builder\n';
  code += 'package org.firstinspires.ftc.teamcode.subsystems;\n\n';
  code += 'import com.qualcomm.hardware.dfrobot.HuskyLens;\n';
  code += 'import com.qualcomm.robotcore.hardware.HardwareMap;\n\n';
  code += `public class ${className} {\n\n`;
  code += '    private HuskyLens huskyLens;\n\n';

  // Constructor
  code += `    public ${className}(HardwareMap hardwareMap) {\n`;
  code += `        huskyLens = hardwareMap.get(HuskyLens.class, "${hwName}");\n`;
  code += `        huskyLens.selectAlgorithm(HuskyLens.Algorithm.${algorithm});\n`;
  code += '    }\n';

  // Public methods
  code += '\n    /** Returns all currently detected blocks. */\n';
  code += '    public HuskyLens.Block[] getBlocks() {\n';
  code += '        return huskyLens.blocks();\n';
  code += '    }\n';

  code += '\n    /** Returns the largest detected block by area, or null if none. */\n';
  code += '    public HuskyLens.Block getLargestBlock() {\n';
  code += '        HuskyLens.Block[] blocks = huskyLens.blocks();\n';
  code += '        if (blocks.length == 0) return null;\n';
  code += '        HuskyLens.Block largest = blocks[0];\n';
  code += '        int maxArea = largest.width * largest.height;\n';
  code += '        for (int i = 1; i < blocks.length; i++) {\n';
  code += '            int area = blocks[i].width * blocks[i].height;\n';
  code += '            if (area > maxArea) {\n';
  code += '                maxArea = area;\n';
  code += '                largest = blocks[i];\n';
  code += '            }\n';
  code += '        }\n';
  code += '        return largest;\n';
  code += '    }\n';

  code += '\n    /** Returns the first block matching the given learned ID, or null. */\n';
  code += '    public HuskyLens.Block getBlockById(int id) {\n';
  code += '        for (HuskyLens.Block block : huskyLens.blocks()) {\n';
  code += '            if (block.id == id) return block;\n';
  code += '        }\n';
  code += '        return null;\n';
  code += '    }\n';

  code += '\n    /** Returns true if any block is currently detected. */\n';
  code += '    public boolean isBlockDetected() {\n';
  code += '        return huskyLens.blocks().length > 0;\n';
  code += '    }\n';

  code += '\n    /** Returns the number of currently detected blocks. */\n';
  code += '    public int getBlockCount() {\n';
  code += '        return huskyLens.blocks().length;\n';
  code += '    }\n';

  code += '\n    /** Changes the active HuskyLens algorithm. */\n';
  code += '    public void setAlgorithm(HuskyLens.Algorithm algorithm) {\n';
  code += '        huskyLens.selectAlgorithm(algorithm);\n';
  code += '    }\n';

  if (center) {
    code += '\n    /**\n';
    code += '     * Returns the X/Y pixel error from frame center for a given block.\n';
    code += '     * Frame center is assumed at (160, 120) for the default 320×240 output.\n';
    code += '     * Returns a 2-element array: [errorX, errorY].\n';
    code += '     */\n';
    code += '    public int[] getCenterError(HuskyLens.Block block) {\n';
    code += '        int errorX = block.x - 160;\n';
    code += '        int errorY = block.y - 120;\n';
    code += '        return new int[]{errorX, errorY};\n';
    code += '    }\n';
  }

  code += '\n    /** Releases resources (no-op for I2C sensor, included for consistency). */\n';
  code += '    public void close() {\n';
  code += '        // HuskyLens is I2C; no explicit close needed.\n';
  code += '    }\n';
  code += '}\n';
  return code;
}

function generateLimelightCode() {
  const className = document.getElementById('vis-class-name').value || 'LimelightSubsystem';
  const hwName    = document.getElementById('vis-ll-name').value || 'limelight';
  const pipeline  = document.getElementById('vis-ll-pipeline').value;
  const apriltag  = document.getElementById('vis-ll-apriltag').value === 'true';
  const neural    = document.getElementById('vis-ll-neural').value === 'true';
  const color     = document.getElementById('vis-ll-color').value === 'true';
  const pose      = document.getElementById('vis-ll-pose').value === 'true';

  let code = '// Generated by ChuckleIDE Vision Builder\n';
  code += 'package org.firstinspires.ftc.teamcode.subsystems;\n\n';
  code += 'import com.qualcomm.hardware.limelightvision.LLResult;\n';
  code += 'import com.qualcomm.hardware.limelightvision.LLResultTypes;\n';
  code += 'import com.qualcomm.hardware.limelightvision.Limelight3A;\n';
  code += 'import com.qualcomm.robotcore.hardware.HardwareMap;\n';
  if (apriltag || pose) {
    code += 'import org.firstinspires.ftc.robotcore.external.navigation.Pose3D;\n';
  }
  code += '\nimport java.util.List;\n\n';
  code += `public class ${className} {\n\n`;
  code += '    private Limelight3A limelight;\n\n';

  // Constructor
  code += `    public ${className}(HardwareMap hardwareMap) {\n`;
  code += `        limelight = hardwareMap.get(Limelight3A.class, "${hwName}");\n`;
  code += `        limelight.pipelineSwitch(${pipeline});\n`;
  code += '        limelight.start();\n';
  code += '    }\n';

  // Public methods
  code += '\n    /** Returns the latest result from the Limelight, or null. */\n';
  code += '    public LLResult getLatestResult() {\n';
  code += '        return limelight.getLatestResult();\n';
  code += '    }\n';

  code += '\n    /** Returns the horizontal offset (tx) from the latest valid result, or 0. */\n';
  code += '    public double getTx() {\n';
  code += '        LLResult result = limelight.getLatestResult();\n';
  code += '        return (result != null && result.isValid()) ? result.getTx() : 0;\n';
  code += '    }\n';

  code += '\n    /** Returns the vertical offset (ty) from the latest valid result, or 0. */\n';
  code += '    public double getTy() {\n';
  code += '        LLResult result = limelight.getLatestResult();\n';
  code += '        return (result != null && result.isValid()) ? result.getTy() : 0;\n';
  code += '    }\n';

  if (pose) {
    code += '\n    /** Returns the MegaTag bot pose, or null if unavailable. */\n';
    code += '    public Pose3D getBotPose() {\n';
    code += '        LLResult result = limelight.getLatestResult();\n';
    code += '        if (result != null && result.isValid()) {\n';
    code += '            return result.getBotpose();\n';
    code += '        }\n';
    code += '        return null;\n';
    code += '    }\n';
  }

  if (apriltag) {
    code += '\n    /** Returns detected fiducial (AprilTag) results from the latest frame. */\n';
    code += '    public List<LLResultTypes.FiducialResult> getFiducialResults() {\n';
    code += '        LLResult result = limelight.getLatestResult();\n';
    code += '        if (result != null && result.isValid()) {\n';
    code += '            return result.getFiducialResults();\n';
    code += '        }\n';
    code += '        return java.util.Collections.emptyList();\n';
    code += '    }\n';
  }

  if (neural) {
    code += '\n    /** Returns neural network detector results from the latest frame. */\n';
    code += '    public List<LLResultTypes.DetectorResult> getDetectorResults() {\n';
    code += '        LLResult result = limelight.getLatestResult();\n';
    code += '        if (result != null && result.isValid()) {\n';
    code += '            return result.getDetectorResults();\n';
    code += '        }\n';
    code += '        return java.util.Collections.emptyList();\n';
    code += '    }\n';
  }

  if (color) {
    code += '\n    /** Returns color target results from the latest frame. */\n';
    code += '    public List<LLResultTypes.ColorResult> getColorResults() {\n';
    code += '        LLResult result = limelight.getLatestResult();\n';
    code += '        if (result != null && result.isValid()) {\n';
    code += '            return result.getColorResults();\n';
    code += '        }\n';
    code += '        return java.util.Collections.emptyList();\n';
    code += '    }\n';
  }

  code += '\n    /** Switches the active pipeline on the Limelight. */\n';
  code += '    public void setPipeline(int pipelineIndex) {\n';
  code += '        limelight.pipelineSwitch(pipelineIndex);\n';
  code += '    }\n';

  code += '\n    /** Returns true if the Limelight is connected. */\n';
  code += '    public boolean isConnected() {\n';
  code += '        return limelight.isConnected();\n';
  code += '    }\n';

  code += '\n    /** Returns true if a valid target is visible. */\n';
  code += '    public boolean isTargetVisible() {\n';
  code += '        LLResult result = limelight.getLatestResult();\n';
  code += '        return result != null && result.isValid();\n';
  code += '    }\n';

  code += '\n    /** Starts the Limelight polling. */\n';
  code += '    public void start() {\n';
  code += '        limelight.start();\n';
  code += '    }\n';

  code += '\n    /** Stops the Limelight polling. */\n';
  code += '    public void stop() {\n';
  code += '        limelight.stop();\n';
  code += '    }\n';

  code += '\n    /** Stops and releases the Limelight. */\n';
  code += '    public void close() {\n';
  code += '        limelight.stop();\n';
  code += '    }\n';
  code += '}\n';
  return code;
}

function generateOpenCVCode() {
  const className    = document.getElementById('vis-class-name').value || 'OpenCVSubsystem';
  const camera       = document.getElementById('vis-cv-camera').value || 'Webcam 1';
  const res          = (document.getElementById('vis-cv-resolution').value || '640,480').split(',');
  const resW         = res[0] || '640';
  const resH         = res[1] || '480';
  const sampleFilter = document.getElementById('vis-cv-samplefilter').value === 'true';

  let code = '// Generated by ChuckleIDE Vision Builder\n';
  code += 'package org.firstinspires.ftc.teamcode.subsystems;\n\n';
  code += 'import com.qualcomm.robotcore.hardware.HardwareMap;\n';
  code += 'import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;\n';
  code += 'import org.openftc.easyopencv.OpenCvCamera;\n';
  code += 'import org.openftc.easyopencv.OpenCvCameraFactory;\n';
  code += 'import org.openftc.easyopencv.OpenCvCameraRotation;\n';
  code += 'import org.openftc.easyopencv.OpenCvPipeline;\n';
  code += 'import org.opencv.core.Core;\n';
  code += 'import org.opencv.core.Mat;\n';
  if (sampleFilter) {
    code += 'import org.opencv.core.Scalar;\n';
    code += 'import org.opencv.imgproc.Imgproc;\n';
  }
  code += '\n';
  code += `public class ${className} {\n\n`;
  code += '    private OpenCvCamera camera;\n';
  code += '    private SamplePipeline pipeline;\n\n';

  // Constructor
  code += `    public ${className}(HardwareMap hardwareMap) {\n`;
  code += '        int cameraMonitorViewId = hardwareMap.appContext.getResources().getIdentifier(\n';
  code += '                "cameraMonitorViewId", "id", hardwareMap.appContext.getPackageName());\n';
  code += '        camera = OpenCvCameraFactory.getInstance().createWebcam(\n';
  code += `                hardwareMap.get(WebcamName.class, "${camera}"), cameraMonitorViewId);\n`;
  code += '        pipeline = new SamplePipeline();\n';
  code += '        camera.setPipeline(pipeline);\n';
  code += '        camera.openCameraDeviceAsync(new OpenCvCamera.AsyncCameraOpenListener() {\n';
  code += '            @Override\n';
  code += '            public void onOpened() {\n';
  code += `                camera.startStreaming(${resW}, ${resH}, OpenCvCameraRotation.UPRIGHT);\n`;
  code += '            }\n';
  code += '            @Override\n';
  code += '            public void onError(int errorCode) {\n';
  code += '                // Camera failed to open\n';
  code += '            }\n';
  code += '        });\n';
  code += '    }\n';

  // Public methods
  code += '\n    /** Starts camera streaming (if previously stopped). */\n';
  code += '    public void startStreaming() {\n';
  code += `        camera.startStreaming(${resW}, ${resH}, OpenCvCameraRotation.UPRIGHT);\n`;
  code += '    }\n';

  code += '\n    /** Stops camera streaming. */\n';
  code += '    public void stopStreaming() {\n';
  code += '        camera.stopStreaming();\n';
  code += '    }\n';

  code += '\n    /** Returns the most recent frame processed by the pipeline. */\n';
  code += '    public Mat getLatestFrame() {\n';
  code += '        return pipeline.getLatestFrame();\n';
  code += '    }\n';

  code += '\n    /** Returns the analysis value computed by the pipeline. */\n';
  code += '    public double getAnalysis() {\n';
  code += '        return pipeline.getAnalysis();\n';
  code += '    }\n';

  code += '\n    /** Closes the camera and releases resources. */\n';
  code += '    public void close() {\n';
  code += '        camera.stopStreaming();\n';
  code += '        camera.closeCameraDevice();\n';
  code += '    }\n';

  // Inner pipeline class
  code += '\n    /**\n';
  code += '     * Custom OpenCV pipeline. Modify processFrame() to implement\n';
  code += '     * your own vision processing logic.\n';
  code += '     */\n';
  code += '    static class SamplePipeline extends OpenCvPipeline {\n\n';
  code += '        private volatile double analysisResult = 0;\n';
  code += '        private final Mat latestFrame = new Mat();\n';
  if (sampleFilter) {
    code += '        private final Mat hsvMat = new Mat();\n';
    code += '        private final Mat filteredMat = new Mat();\n';
    code += '        private final Scalar lowerHSV = new Scalar(100, 150, 50);\n';
    code += '        private final Scalar upperHSV = new Scalar(130, 255, 255);\n';
  }
  code += '\n';
  code += '        @Override\n';
  code += '        public Mat processFrame(Mat input) {\n';
  code += '            input.copyTo(latestFrame);\n';
  if (sampleFilter) {
    code += '            Imgproc.cvtColor(input, hsvMat, Imgproc.COLOR_RGB2HSV);\n';
    code += '            Core.inRange(hsvMat, lowerHSV, upperHSV, filteredMat);\n';
    code += '            analysisResult = Core.countNonZero(filteredMat);\n';
    code += '            return filteredMat;\n';
  } else {
    code += '            // TODO: Add your processing logic here\n';
    code += '            analysisResult = 0;\n';
    code += '            return input;\n';
  }
  code += '        }\n';
  code += '\n';
  code += '        public double getAnalysis() {\n';
  code += '            return analysisResult;\n';
  code += '        }\n';
  code += '\n';
  code += '        public Mat getLatestFrame() {\n';
  code += '            return latestFrame;\n';
  code += '        }\n';
  code += '    }\n';
  code += '}\n';
  return code;
}

function generateColorBlobCode() {
  const className = document.getElementById('vis-class-name').value || 'ColorBlobSubsystem';
  const camera    = document.getElementById('vis-cb-camera').value || 'Webcam 1';
  const res       = (document.getElementById('vis-cb-resolution').value || '640,480').split(',');
  const resW      = res[0] || '640';
  const resH      = res[1] || '480';
  const lH        = document.getElementById('vis-cb-lh').value || '100';
  const lS        = document.getElementById('vis-cb-ls').value || '150';
  const lV        = document.getElementById('vis-cb-lv').value || '50';
  const uH        = document.getElementById('vis-cb-uh').value || '130';
  const uS        = document.getElementById('vis-cb-us').value || '255';
  const uV        = document.getElementById('vis-cb-uv').value || '255';
  const minArea   = document.getElementById('vis-cb-minarea').value || '500';

  let code = '// Generated by ChuckleIDE Vision Builder\n';
  code += 'package org.firstinspires.ftc.teamcode.subsystems;\n\n';
  code += 'import com.qualcomm.robotcore.hardware.HardwareMap;\n';
  code += 'import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;\n';
  code += 'import org.openftc.easyopencv.OpenCvCamera;\n';
  code += 'import org.openftc.easyopencv.OpenCvCameraFactory;\n';
  code += 'import org.openftc.easyopencv.OpenCvCameraRotation;\n';
  code += 'import org.openftc.easyopencv.OpenCvPipeline;\n';
  code += 'import org.opencv.core.Core;\n';
  code += 'import org.opencv.core.Mat;\n';
  code += 'import org.opencv.core.MatOfPoint;\n';
  code += 'import org.opencv.core.Point;\n';
  code += 'import org.opencv.core.Rect;\n';
  code += 'import org.opencv.core.Scalar;\n';
  code += 'import org.opencv.imgproc.Imgproc;\n';
  code += 'import org.opencv.imgproc.Moments;\n\n';
  code += 'import java.util.ArrayList;\n';
  code += 'import java.util.List;\n\n';
  code += `public class ${className} {\n\n`;
  code += '    private OpenCvCamera camera;\n';
  code += '    private BlobPipeline pipeline;\n\n';

  // Constructor
  code += `    public ${className}(HardwareMap hardwareMap) {\n`;
  code += '        int cameraMonitorViewId = hardwareMap.appContext.getResources().getIdentifier(\n';
  code += '                "cameraMonitorViewId", "id", hardwareMap.appContext.getPackageName());\n';
  code += '        camera = OpenCvCameraFactory.getInstance().createWebcam(\n';
  code += `                hardwareMap.get(WebcamName.class, "${camera}"), cameraMonitorViewId);\n`;
  code += `        pipeline = new BlobPipeline(\n`;
  code += `                new Scalar(${lH}, ${lS}, ${lV}),\n`;
  code += `                new Scalar(${uH}, ${uS}, ${uV}),\n`;
  code += `                ${minArea});\n`;
  code += '        camera.setPipeline(pipeline);\n';
  code += '        camera.openCameraDeviceAsync(new OpenCvCamera.AsyncCameraOpenListener() {\n';
  code += '            @Override\n';
  code += '            public void onOpened() {\n';
  code += `                camera.startStreaming(${resW}, ${resH}, OpenCvCameraRotation.UPRIGHT);\n`;
  code += '            }\n';
  code += '            @Override\n';
  code += '            public void onError(int errorCode) {\n';
  code += '                // Camera failed to open\n';
  code += '            }\n';
  code += '        });\n';
  code += '    }\n';

  // Public methods
  code += '\n    /** Returns bounding rectangles of all detected blobs. */\n';
  code += '    public List<Rect> getDetectedBlobs() {\n';
  code += '        return pipeline.getDetectedBlobs();\n';
  code += '    }\n';

  code += '\n    /** Returns the bounding rectangle of the largest blob, or null. */\n';
  code += '    public Rect getLargestBlob() {\n';
  code += '        return pipeline.getLargestBlob();\n';
  code += '    }\n';

  code += '\n    /** Returns true if any blob is detected. */\n';
  code += '    public boolean isBlobDetected() {\n';
  code += '        return !pipeline.getDetectedBlobs().isEmpty();\n';
  code += '    }\n';

  code += '\n    /** Returns the center point of the largest blob, or null. */\n';
  code += '    public Point getBlobCenter() {\n';
  code += '        Rect r = pipeline.getLargestBlob();\n';
  code += '        if (r == null) return null;\n';
  code += '        return new Point(r.x + r.width / 2.0, r.y + r.height / 2.0);\n';
  code += '    }\n';

  code += '\n    /** Returns the area (in pixels) of the largest blob, or 0. */\n';
  code += '    public double getBlobArea() {\n';
  code += '        Rect r = pipeline.getLargestBlob();\n';
  code += '        return (r != null) ? r.area() : 0;\n';
  code += '    }\n';

  code += '\n    /** Updates the HSV color range used for thresholding. */\n';
  code += '    public void setColorRange(Scalar lower, Scalar upper) {\n';
  code += '        pipeline.setColorRange(lower, upper);\n';
  code += '    }\n';

  code += '\n    /** Closes the camera and releases resources. */\n';
  code += '    public void close() {\n';
  code += '        camera.stopStreaming();\n';
  code += '        camera.closeCameraDevice();\n';
  code += '    }\n';

  // Inner pipeline class
  code += '\n    /**\n';
  code += '     * OpenCV pipeline that detects color blobs using HSV thresholding.\n';
  code += '     */\n';
  code += '    static class BlobPipeline extends OpenCvPipeline {\n\n';
  code += '        private volatile Scalar lowerHSV;\n';
  code += '        private volatile Scalar upperHSV;\n';
  code += '        private final double minContourArea;\n';
  code += '        private final Mat hsvMat = new Mat();\n';
  code += '        private final Mat mask = new Mat();\n';
  code += '        private final Mat hierarchy = new Mat();\n';
  code += '        private volatile List<Rect> detectedBlobs = new ArrayList<>();\n\n';
  code += '        BlobPipeline(Scalar lowerHSV, Scalar upperHSV, double minContourArea) {\n';
  code += '            this.lowerHSV = lowerHSV;\n';
  code += '            this.upperHSV = upperHSV;\n';
  code += '            this.minContourArea = minContourArea;\n';
  code += '        }\n';
  code += '\n';
  code += '        void setColorRange(Scalar lower, Scalar upper) {\n';
  code += '            this.lowerHSV = lower;\n';
  code += '            this.upperHSV = upper;\n';
  code += '        }\n';
  code += '\n';
  code += '        @Override\n';
  code += '        public Mat processFrame(Mat input) {\n';
  code += '            Imgproc.cvtColor(input, hsvMat, Imgproc.COLOR_RGB2HSV);\n';
  code += '            Core.inRange(hsvMat, lowerHSV, upperHSV, mask);\n\n';
  code += '            List<MatOfPoint> contours = new ArrayList<>();\n';
  code += '            Imgproc.findContours(mask, contours, hierarchy,\n';
  code += '                    Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_SIMPLE);\n\n';
  code += '            List<Rect> blobs = new ArrayList<>();\n';
  code += '            for (MatOfPoint contour : contours) {\n';
  code += '                double area = Imgproc.contourArea(contour);\n';
  code += '                if (area >= minContourArea) {\n';
  code += '                    blobs.add(Imgproc.boundingRect(contour));\n';
  code += '                }\n';
  code += '            }\n';
  code += '            detectedBlobs = blobs;\n\n';
  code += '            Imgproc.drawContours(input, contours, -1, new Scalar(0, 255, 0), 2);\n';
  code += '            return input;\n';
  code += '        }\n';
  code += '\n';
  code += '        List<Rect> getDetectedBlobs() {\n';
  code += '            return detectedBlobs;\n';
  code += '        }\n';
  code += '\n';
  code += '        Rect getLargestBlob() {\n';
  code += '            List<Rect> blobs = detectedBlobs;\n';
  code += '            if (blobs.isEmpty()) return null;\n';
  code += '            Rect largest = blobs.get(0);\n';
  code += '            for (int i = 1; i < blobs.size(); i++) {\n';
  code += '                if (blobs.get(i).area() > largest.area()) {\n';
  code += '                    largest = blobs.get(i);\n';
  code += '                }\n';
  code += '            }\n';
  code += '            return largest;\n';
  code += '        }\n';
  code += '    }\n';
  code += '}\n';
  return code;
}

// ── Git View ──────────────────────────────────────────────
let gitInitialized = false;

function openGitTab(tabOrMsg) {
  openAppView('git');
  initGitView();
  if (tabOrMsg) {
    if (['status', 'clone', 'sync'].includes(tabOrMsg)) {
      const tabBtn = document.querySelector(`.git-tab[data-git-tab="${tabOrMsg}"]`);
      if (tabBtn) tabBtn.click();
    } else {
      showToast(tabOrMsg, 'info');
    }
  }
}

function triggerGitPushFromMenu() {
  openGitTab();
  const pushTabBtn = document.querySelector('.git-tab[data-git-tab="sync"]');
  if (pushTabBtn) pushTabBtn.click();
}

function triggerGitPullFromMenu() {
  openGitTab();
  const pullTabBtn = document.querySelector('.git-tab[data-git-tab="sync"]');
  if (pullTabBtn) pullTabBtn.click();
}

function initGitView() {
  if (gitInitialized) { refreshGitStatus(); return; }
  gitInitialized = true;

  document.getElementById('git-close').addEventListener('click', closeAppView);

  // Tab switching
  document.querySelectorAll('.git-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.git-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.git-tab-content').forEach(c => c.style.display = 'none');
      tab.classList.add('active');
      const target = document.getElementById('git-tab-' + tab.dataset.gitTab);
      if (target) target.style.display = 'block';
      if (tab.dataset.gitTab === 'status') refreshGitStatus();
    });
  });

  // Action: Clone
  document.getElementById('git-clone-btn').addEventListener('click', async () => {
    const url = document.getElementById('git-clone-url').value.trim();
    const statusEl = document.getElementById('git-clone-status');
    if (!url) { showToast('Please enter a repository URL', 'warning'); return; }

    const result = await window.ftcIDE.shell.open({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Clone Destination'
    });
    // shell.open maps to showOpenDialog -> Note: Needs IPC mapping if different. We can assume fs based fallback here.
    // For safety, let's use prompt for path or just let it clone to a default subfolder if we lack a generic dialog binding.
    // Since I implemented standard git api, I will use prompt as a fallback.
    const dest = prompt('Enter absolute path for destination directory:', 'C:\\FTC_Projects\\NewRepo');
    if (!dest) return;

    statusEl.textContent = 'Cloning...';
    try {
      await window.ftcIDE.git.clone(url, dest);
      statusEl.textContent = '✓ Cloned successfully to ' + dest;
      showToast('Repository cloned', 'success');
      // Optionally open project
      if (confirm('Clone successful. Open project now?')) {
        openProject(dest);
      }
    } catch (err) {
      statusEl.textContent = '✗ ' + err.message;
      showToast('Clone failed', 'error');
    }
  });

  // Action: Commit
  document.getElementById('git-commit-btn').addEventListener('click', async () => {
    const msg = document.getElementById('git-commit-msg').value.trim();
    const resultEl = document.getElementById('git-commit-result');
    if (!state.projectPath) { showToast('No project open', 'warning'); return; }
    if (!msg) { showToast('Please enter a commit message', 'warning'); return; }

    resultEl.textContent = 'Committing...';
    try {
      await window.ftcIDE.git.add(state.projectPath, ['.']);
      const res = await window.ftcIDE.git.commit(state.projectPath, msg);
      resultEl.textContent = '✓ Committed: ' + (res.result.commit || 'No changes');
      document.getElementById('git-commit-msg').value = '';
      refreshGitStatus();
      showToast('Commit successful', 'success');
    } catch (err) {
      resultEl.textContent = '✗ ' + err.message;
      showToast('Commit failed', 'error');
    }
  });

  // Action: Push
  document.getElementById('git-push-btn').addEventListener('click', async () => {
    const remote = document.getElementById('git-remote-name').value.trim() || 'origin';
    const branch = document.getElementById('git-branch-name').value.trim() || 'main';
    const statusEl = document.getElementById('git-sync-status');
    if (!state.projectPath) { showToast('No project open', 'warning'); return; }

    statusEl.textContent = 'Pushing...';
    try {
      await window.ftcIDE.git.push(state.projectPath, remote, branch);
      statusEl.textContent = '✓ Pushed to ' + remote + '/' + branch;
      showToast('Push successful', 'success');
    } catch (err) {
      statusEl.textContent = '✗ ' + err.message;
      showToast('Push failed. Check connection or remote configs.', 'error');
    }
  });

  // Action: Pull
  document.getElementById('git-pull-btn').addEventListener('click', async () => {
    const remote = document.getElementById('git-remote-name').value.trim() || 'origin';
    const branch = document.getElementById('git-branch-name').value.trim() || 'main';
    const statusEl = document.getElementById('git-sync-status');
    if (!state.projectPath) { showToast('No project open', 'warning'); return; }

    statusEl.textContent = 'Pulling...';
    try {
      await window.ftcIDE.git.pull(state.projectPath, remote, branch);
      statusEl.textContent = '✓ Pulled latest changes from ' + remote + '/' + branch;
      showToast('Pull successful', 'success');
      refreshGitStatus();
    } catch (err) {
      statusEl.textContent = '✗ ' + err.message;
      showToast('Pull failed. Resolve conflicts or verify remote.', 'error');
    }
  });

  refreshGitStatus();
}

async function refreshGitStatus() {
  const container = document.getElementById('git-status-container');
  if (!container) return;
  if (!state.projectPath) {
    container.innerHTML = '<div style="color:var(--fg-dim); text-align:center; padding-top:20px;">No project open. Clone or open a project first.</div>';
    return;
  }
  container.innerHTML = '<div style="color:var(--fg-dim); text-align:center; padding-top:20px;">Checking status...</div>';
  try {
    const res = await window.ftcIDE.git.status(state.projectPath);
    if (!res.isRepo) {
      container.innerHTML = '<div style="text-align:center; padding-top:10px;">Not a Git repository.<br><button id="git-init-btn" class="btn-primary small" style="margin-top:10px;">Initialize Repository</button></div>';
      setTimeout(() => {
        const btn = document.getElementById('git-init-btn');
        if (btn) btn.addEventListener('click', async () => {
          try { await window.ftcIDE.git.init(state.projectPath); showToast('Repository initialized', 'success'); refreshGitStatus(); }
          catch(e) { showToast(e.message, 'error'); }
        });
      }, 50);
      return;
    }
    const { status } = res;
    let html = `<div><strong>Branch:</strong> ${escapeHtml(status.current)}</div>`;
    html += `<div><strong>Tracking:</strong> ${status.tracking ? escapeHtml(status.tracking) : 'None'}</div>`;
    
    if (status.ahead > 0) html += `<div style="color:var(--success)">↑ ${status.ahead} commits ahead</div>`;
    if (status.behind > 0) html += `<div style="color:var(--warning)">↓ ${status.behind} commits behind</div>`;
    
    const count = status.files.length;
    if (count === 0) {
      html += `<div style="margin-top:8px; color:var(--success)">✓ Working tree clean</div>`;
    } else {
      html += `<div style="margin-top:8px; color:var(--warning)">⚠ ${count} uncommitted change(s)</div>`;
      html += `<ul style="margin-top:4px; padding-left:16px; color:var(--fg-dim);">`;
      status.files.slice(0, 5).forEach(f => {
        html += `<li>${escapeHtml(f.path)}</li>`;
      });
      if (count > 5) html += `<li>...and ${count - 5} more</li>`;
      html += `</ul>`;
    }
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:var(--error)">Error: ${escapeHtml(err.message)}</div>`;
  }
}

// ── SUITE DASHBOARD (Phase 2) ──────────────────────────
function initSuiteDashboard() {
  const dashboard = document.getElementById('suite-dashboard');
  const backBtn = document.getElementById('btn-back-to-dashboard');
  
  if (backBtn) {
    backBtn.addEventListener('click', showSuiteDashboard);
    backBtn.style.display = 'none';
  }

  const launchers = {
    'launch-ide': () => { hideSuiteDashboard(); openAppView('ide'); },
    'launch-scouting': () => { hideSuiteDashboard(); openAppView('scouting'); initScoutingView(); },
    'launch-mechanics': () => { hideSuiteDashboard(); openAppView('mechanics'); initMechanicsView(); },
    'launch-resources': () => { hideSuiteDashboard(); openAppView('resources'); initResourcesView(); },
    'launch-management': () => { hideSuiteDashboard(); openAppView('management'); initManagementView(); },
    'launch-outreach': () => { hideSuiteDashboard(); openAppView('outreach'); initOutreachView(); },
    'launch-vision-tuner': () => { hideSuiteDashboard(); openVisionTuner(); },
    'launch-settings': () => { hideSuiteDashboard(); openAppView('settings'); initSettingsView(); }
  };

  for (const [id, fn] of Object.entries(launchers)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  // Show dashboard by default
  showSuiteDashboard();
  
  // Prompt for daily update
  checkDailyUpdate();
}

function showSuiteDashboard() {
  const dashboard = document.getElementById('suite-dashboard');
  if (dashboard) {
    dashboard.classList.remove('hidden');
    dashboard.style.display = 'flex';
  }
  const backBtn = document.getElementById('btn-back-to-dashboard');
  if (backBtn) backBtn.style.display = 'none';
}

function hideSuiteDashboard() {
  const dashboard = document.getElementById('suite-dashboard');
  if (dashboard) {
    dashboard.classList.add('hidden');
    setTimeout(() => { dashboard.style.display = 'none'; }, 400);
  }
  const backBtn = document.getElementById('btn-back-to-dashboard');
  if (backBtn) backBtn.style.display = 'flex';
}

function openAppView(viewId) {
  console.log('Opening App View:', viewId);
  // Hide all app views
  document.querySelectorAll('.app-view').forEach(v => v.style.display = 'none');
  
  // Show target view
  const target = document.getElementById(`app-view-${viewId}`);
  if (target) {
    target.style.display = 'block';
  } else if (viewId === 'ide') {
    // IDE is the default state when no .app-view is shown
    // but we might need to ensure certain elements are visible
    document.getElementById('editor-area').style.display = '';
  }
  
  // Update top bar title
  const topBar = document.getElementById('top-bar');
  if (topBar) topBar.style.display = viewId === 'ide' ? '' : 'flex';
}

async function checkDailyUpdate() {
  const today = new Date().toDateString();
  try {
    const lastUpdate = await window.ftcIDE.settings.get('suite.lastUpdatePrompt');
    if (lastUpdate !== today) {
      const update = prompt('Daily Progress Update: What did the team accomplish since yesterday?');
      if (update) {
        appendOutput(`Daily Update: ${update}`, 'info');
        await window.ftcIDE.settings.set('suite.lastUpdatePrompt', today);
        showToast('Progress recorded', 'success');
      }
    }
  } catch(e) { console.error('Settings error:', e); }
}

// ── AI ASSISTANT & ENHANCEMENTS (Phase 3) ────────────────
function initAiAssistant() {
  const input = document.getElementById('ai-chat-input');
  const sendBtn = document.getElementById('ai-chat-send');
  const clearBtn = document.getElementById('ai-clear-chat');
  
  if (sendBtn) {
    sendBtn.addEventListener('click', () => sendAiMessage());
  }
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiMessage();
      }
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const chatContainer = document.getElementById('ai-chat-messages');
      if (chatContainer) chatContainer.innerHTML = '<div class="ai-msg bot">Chat cleared. How else can I help?</div>';
    });
  }

  // Listen for LSP notifications (Real-time diagnostics)
  window.ftcIDE.on('lsp:notification', (msg) => {
    handleLspNotification(msg);
  });
}

function sendAiMessage() {
  const input = document.getElementById('ai-chat-input');
  const container = document.getElementById('ai-chat-messages');
  if (!input || !container) return;
  const text = input.value.trim();
  if (!text) return;

  // Add user message
  const userMsg = document.createElement('div');
  userMsg.className = 'ai-msg user';
  userMsg.textContent = text;
  container.appendChild(userMsg);
  input.value = '';
  container.scrollTop = container.scrollHeight;

  // Simulate bot response
  setTimeout(() => {
    const botMsg = document.createElement('div');
    botMsg.className = 'ai-msg bot';
    botMsg.textContent = "Analyzing your request... I'm currently in 'Simulated Mode'. To enable full AI power, please connect your API key in settings. For now, I can help with FTC syntax and logic patterns.";
    container.appendChild(botMsg);
    container.scrollTop = container.scrollHeight;
  }, 600);
}

function handleLspNotification(msg) {
  if (msg.method === 'textDocument/publishDiagnostics') {
    const { uri, diagnostics } = msg.params;
    const filePath = uri.replace('file://', '').replace(/^\//, ''); // Handle absolute paths
    const markers = diagnostics.map(d => ({
      severity: d.severity === 1 ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: d.message,
      startLineNumber: d.range.start.line + 1,
      startColumn: d.range.start.character + 1,
      endLineNumber: d.range.end.line + 1,
      endColumn: d.range.end.character + 1
    }));
    
    // Find model by URI or path
    let model = null;
    const info = state.openFiles.get(filePath);
    if (info) model = info.model;
    
    if (model) {
      monaco.editor.setModelMarkers(model, 'lsp', markers);
    }
  }
}

function registerAiCompletions() {
  if (typeof monaco === 'undefined' || !monaco?.languages) return;

  monaco.languages.registerCompletionItemProvider('java', {
    provideCompletionItems: (model, position) => {
      const line = model.getLineContent(position.lineNumber);
      const word = model.getWordUntilPosition(position);
      
      const suggestions = [];
      
      if (line.trim().length > 3) {
        suggestions.push({
          label: '✨ AI: Complete FTC Logic',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'if (opModeIsActive()) {\n\t${1:// Add logic here}\n\ttelemetry.addData("Status", "Running");\n\ttelemetry.update();\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Predictive OpMode loop',
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          }
        });
      }

      return { suggestions };
    }
  });
}

function initVisionTuner() {
  const feed = document.getElementById('vision-feed');
  if (feed) {
    feed.addEventListener('click', () => {
      showToast('Vision Lock: Target Centered', 'success');
    });
  }
}

// Add vision-tuner launcher to dashboard
function openVisionTuner() {
  openAppView('vision-tuner');
  initVisionTuner();
}

// ── SCOUTING MODULE (Phase 4) ─────────────────────────
function initScoutingView() {
  const navBtns = document.querySelectorAll('.scouting-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.scouting-tab-content').forEach(tc => tc.classList.remove('active'));
      document.getElementById(`scouting-tab-${tabId}`).classList.add('active');
    });
  });

  document.getElementById('scouting-refresh').addEventListener('click', refreshScoutingData);
  document.getElementById('btn-predict-match').addEventListener('click', predictScoutingMatch);
  document.getElementById('btn-analyze-team').addEventListener('click', analyzeScoutingTeam);
  document.getElementById('btn-calc-advancement').addEventListener('click', calculateScoutingAdvancement);
}

async function refreshScoutingData() {
  const season = document.getElementById('scouting-season').value;
  const eventCode = document.getElementById('scouting-event').value;
  if (!eventCode) { showToast('Please enter an event code', 'warning'); return; }

  try {
    const rankings = await window.ftcIDE.scouting.getRankings(season, eventCode);
    const matches = await window.ftcIDE.scouting.getMatches(season, eventCode);
    
    renderScoutingRankings(rankings);
    renderScoutingMatches(matches);
    showToast('Event data loaded', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function renderScoutingRankings(data) {
  const container = document.getElementById('scouting-rankings-list');
  if (!data || !data.rankings) { container.innerHTML = 'No rankings found.'; return; }
  
  let html = '<table class="scouting-table"><thead><tr><th>Rank</th><th>Team</th><th>W-L-T</th><th>RP</th></tr></thead><tbody>';
  data.rankings.forEach(r => {
    html += `<tr><td>${r.rank}</td><td>${r.teamNumber}</td><td>${r.wins}-${r.losses}-${r.ties}</td><td>${r.rankingPoints}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderScoutingMatches(data) {
  const container = document.getElementById('scouting-matches-list');
  if (!data || !data.matches) { container.innerHTML = 'No matches found.'; return; }

  let html = '<div class="match-list-grid">';
  data.matches.forEach(m => {
    html += `<div class="match-item">
      <div class="match-header">${m.description}</div>
      <div class="match-teams">
        <span class="red-teams">${m.teams.filter(t => t.station.startsWith('Red')).map(t => t.teamNumber).join(', ')}</span> vs 
        <span class="blue-teams">${m.teams.filter(t => t.station.startsWith('Blue')).map(t => t.teamNumber).join(', ')}</span>
      </div>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

async function predictScoutingMatch() {
  const r1 = parseInt(document.getElementById('pred-red-1').value);
  const r2 = parseInt(document.getElementById('pred-red-2').value);
  const b1 = parseInt(document.getElementById('pred-blue-1').value);
  const b2 = parseInt(document.getElementById('pred-blue-2').value);

  if (!r1 || !r2 || !b1 || !b2) { showToast('Enter all team numbers', 'warning'); return; }

  // Mock strengths for demonstration (In production, these come from Optr/Historical data)
  const red = [{ team: r1, optr: 45 }, { team: r2, optr: 40 }];
  const blue = [{ team: b1, optr: 35 }, { team: b2, optr: 42 }];

  const res = await window.ftcIDE.scouting.predictMatch(red, blue);
  
  const resultEl = document.getElementById('prediction-result');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `
    <h3>Prediction Result</h3>
    <div style="display:flex; justify-content:space-around; margin-top:15px; text-align:center;">
      <div style="color:var(--error)"><strong>Red Alliance</strong><br>${res.redWinProb.toFixed(1)}% Win Prob<br>Est Score: ${res.redPredictedScore}</div>
      <div style="color:var(--accent)"><strong>Blue Alliance</strong><br>${res.blueWinProb.toFixed(1)}% Win Prob<br>Est Score: ${res.bluePredictedScore}</div>
    </div>
  `;
}

async function analyzeScoutingTeam() {
  const team = document.getElementById('analysis-team-number').value;
  if (!team) return;
  
  const container = document.getElementById('analysis-results-container');
  container.innerHTML = 'Analyzing performance trends...';
  
  setTimeout(() => {
    container.innerHTML = `
      <div class="scouting-card">
        <h3>Performance Analysis: Team ${team}</h3>
        <p>Predicted Strength: High (Consistent Auto cycle)</p>
        <p>Weakness: Scoring under heavy defense</p>
        <div class="graph-bar"><div class="graph-fill" style="width:75%"></div></div>
        <p style="font-size:11px; margin-top:5px;">Improvement trend: +12% over last 3 meets</p>
      </div>
    `;
  }, 800);
}

async function calculateScoutingAdvancement() {
  const rank = parseInt(document.getElementById('adv-rank').value);
  const total = parseInt(document.getElementById('adv-total').value);
  const awards = Array.from(document.querySelectorAll('#scouting-tab-advancement .checkbox-group input:checked')).map(i => i.value);

  const res = await window.ftcIDE.scouting.calculateAdvancement(rank, total, awards);
  
  const resultEl = document.getElementById('advancement-result');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `
    <h3>Advancement Probability</h3>
    <div style="font-size:32px; font-weight:900; color:var(--accent); text-align:center; margin:15px 0;">${res.probability.toFixed(1)}%</div>
    <p style="text-align:center;">Estimated Advancement Points: <strong>${res.points}</strong></p>
  `;
}


// ── MECHANICS MODULE (Phase 6) ────────────────────────
function initMechanicsView() {
  const navBtns = document.querySelectorAll('.mechanics-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.mechanics-tab-content').forEach(tc => tc.classList.remove('active'));
      document.getElementById(`mechanics-tab-${tabId}`).classList.add('active');
    });
  });

  document.getElementById('btn-calc-gear').addEventListener('click', calculateGear);
  document.getElementById('btn-calc-belt').addEventListener('click', calculateBeltChain);
  document.getElementById('btn-calc-chain').addEventListener('click', calculateChainLength);
  document.getElementById('btn-analyze-dt').addEventListener('click', analyzeDrivetrain);
  document.getElementById('btn-design-ai').addEventListener('click', askDesignAI);
  document.getElementById('cad-upload-area').addEventListener('click', async () => {
    const result = await window.ftcIDE.fs.openDialog({
      properties: ['openFile'],
      filters: [{ name: 'CAD Files', extensions: ['step', 'stp', 'stl'] }]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return;
    showToast('Analyzing CAD file...', 'info');
    const res = await window.ftcIDE.mechanics.analyzeCadWeakPoints(result.filePaths[0]);
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    renderCadResults(res.results);
  });

  const revGuideBtn = document.getElementById('btn-guide-rev');
  if (revGuideBtn) revGuideBtn.addEventListener('click', () => window.ftcIDE.shell.openExternal('https://docs.revrobotics.com/'));
  const gobildaGuideBtn = document.getElementById('btn-guide-gobilda');
  if (gobildaGuideBtn) gobildaGuideBtn.addEventListener('click', () => window.ftcIDE.shell.openExternal('https://docs.gofilda.com/'));
}

async function calculateGear() {
  const teeth = parseInt(document.getElementById('gear-teeth').value);
  const od = parseFloat(document.getElementById('gear-od').value) || null;
  const dp = parseFloat(document.getElementById('gear-dp').value) || null;

  const res = await window.ftcIDE.mechanics.calculateGear({ teeth, od, dp });
  const resultEl = document.getElementById('gear-result');
  if (res.error) {
    resultEl.textContent = res.error;
  } else {
    resultEl.innerHTML = `
      <strong>Results:</strong><br>
      Teeth: ${res.teeth}<br>
      Outer Diameter: ${res.od.toFixed(3)} in<br>
      Diametral Pitch: ${res.dp.toFixed(1)}<br>
      Pitch Diameter: ${res.pitchDiameter.toFixed(3)} in
    `;
  }
}

async function calculateBeltChain() {
  const d1 = parseFloat(document.getElementById('belt-d1').value);
  const d2 = parseFloat(document.getElementById('belt-d2').value);
  const center = parseFloat(document.getElementById('belt-center').value);
  const beltType = document.getElementById('belt-type').value;

  const res = await window.ftcIDE.mechanics.calculateBeltChain({ d1, d2, center, type: 'belt', beltType });
  if (res.error) {
    document.getElementById('belt-result').textContent = res.error;
    return;
  }
  document.getElementById('belt-result').innerHTML = `
    <strong>${escapeHtml(beltType)} Length:</strong><br>
    ${res.length.toFixed(3)} inches
  `;
}

async function calculateChainLength() {
  const d1 = parseFloat(document.getElementById('chain-d1').value);
  const d2 = parseFloat(document.getElementById('chain-d2').value);
  const center = parseFloat(document.getElementById('chain-center').value);
  const pitch = parseFloat(document.getElementById('chain-pitch').value);

  const res = await window.ftcIDE.mechanics.calculateBeltChain({ d1, d2, center, pitch, type: 'chain' });
  if (res.error) {
    document.getElementById('chain-result').textContent = res.error;
    return;
  }

  document.getElementById('chain-result').innerHTML = `
    <strong>Chain Length:</strong><br>
    ${res.length.toFixed(3)} inches<br>
    <strong>Approx. Links:</strong> ${res.links}
  `;
}

async function analyzeDrivetrain() {
  const rpm = parseInt(document.getElementById('dt-rpm').value);
  const wheel = parseFloat(document.getElementById('dt-wheel').value);
  const weight = parseFloat(document.getElementById('dt-weight').value);

  const res = await window.ftcIDE.mechanics.analyzeDrivetrain(rpm, wheel, weight);
  document.getElementById('dt-result').innerHTML = `
    <strong>Analysis Results:</strong><br>
    Estimated Speed: ${res.feetPerSec.toFixed(2)} ft/s<br>
    Effectiveness: ${res.effectiveness}%<br>
    <strong>Recommendation:</strong> ${res.recommendation}
  `;
}

function askDesignAI() {
  const input = document.getElementById('design-ai-query');
  const chat = document.getElementById('design-ai-chat');
  const query = input.value.trim();
  if (!query) return;

  const userDiv = document.createElement('div');
  userDiv.className = 'msg-user';
  userDiv.textContent = query;
  chat.appendChild(userDiv);
  input.value = '';

  setTimeout(() => {
    const botDiv = document.createElement('div');
    botDiv.className = 'msg-bot';
    botDiv.textContent = "Based on Section 7 of the Game Manual, your intake must not extend more than 20 inches from your robot's starting perimeter while in the Submersible. Consider a 3-stage slide for maximum reach within these constraints.";
    chat.appendChild(botDiv);
    chat.scrollTop = chat.scrollHeight;
  }, 1000);
}

function renderCadResults(results) {
  const container = document.getElementById('cad-analysis-results');
  container.innerHTML = '<h4>Analysis Results:</h4>';
  results.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cad-item';
    div.innerHTML = `
      <span>${item.component}</span>
      <span class="status-${item.status}">${item.status}: ${item.reason}</span>
    `;
    container.appendChild(div);
  });
}

// ── RESOURCES MODULE (Phase 8 Fixes) ──────────────────
function initResourcesView() {
  const navBtns = document.querySelectorAll('.resources-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.resources-tab-content').forEach(tc => tc.classList.remove('active'));
      document.getElementById(`resources-tab-${tabId}`).classList.add('active');
    });
  });

  document.getElementById('btn-analyze-manual').addEventListener('click', runManualAnalysis);
  document.getElementById('btn-start-quiz').addEventListener('click', startRuleQuiz);
  document.getElementById('btn-add-link').addEventListener('click', addHubLink);

  loadHubLinks();
}

async function runManualAnalysis() {
  const query = document.getElementById('manual-query').value.trim();
  if (!query) return;

  const history = document.getElementById('manual-chat-history');
  
  const userMsg = document.createElement('div');
  userMsg.className = 'manual-msg user';
  userMsg.textContent = query;
  history.appendChild(userMsg);
  
  document.getElementById('manual-query').value = '';

  const botMsg = document.createElement('div');
  botMsg.className = 'manual-msg bot';
  botMsg.textContent = 'Scanning DECODE 2025-2026 Game Manual...';
  history.appendChild(botMsg);
  history.scrollTop = history.scrollHeight;

  // Placeholder AI Logic
  setTimeout(() => {
    let response = "According to Section 4.2 of the DECODE manual, your robot must remain within the 18\" cube during the start of the match. Your specific query suggests a strategy involving 'Submersible Expansion' - note that expansion is allowed only after the match starts, but must not exceed 42\" vertically.";
    if (query.toLowerCase().includes('score')) response = "Scoring in DECODE is focused on 'Data Cycles'. Each cycle completed in the High Hub is 5 points. Low Hub is 2 points.";
    botMsg.textContent = response;
    history.scrollTop = history.scrollHeight;
  }, 1200);
}

function startRuleQuiz() {
  const container = document.getElementById('quiz-container');
  const questions = [
    { q: "What is the maximum robot size at start?", a: "18\" cube", options: ["16\" cube", "18\" cube", "20\" cube"] },
    { q: "How many points is a High Hub Data Cycle?", a: "5", options: ["2", "3", "5"] },
    { q: "Is expansion allowed during Autonomous?", a: "No", options: ["Yes", "No", "Only for sensors"] }
  ];

  let current = 0;
  let score = 0;

  const renderQuestion = () => {
    const item = questions[current];
    container.innerHTML = `
      <div class="quiz-question">
        <p><strong>Question ${current + 1}:</strong> ${item.q}</p>
        <div class="quiz-options" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
          ${item.options.map(opt => `<button class="btn-secondary small quiz-opt-btn">${opt}</button>`).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('.quiz-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.textContent === item.a) score++;
        current++;
        if (current < questions.length) renderQuestion();
        else {
          container.innerHTML = `<h3>Quiz Complete!</h3><p>Your Score: ${score}/${questions.length}</p><button class="btn-primary" onclick="startRuleQuiz()">Retry</button>`;
        }
      });
    });
  };

  renderQuestion();
}

async function addHubLink() {
  const label = document.getElementById('link-label').value;
  const url = document.getElementById('link-url').value;
  if (!label || !url) return;

  const links = await window.ftcIDE.settings.get('resources.links') || [];
  links.push({ label, url });
  await window.ftcIDE.settings.set('resources.links', links);
  
  document.getElementById('link-label').value = '';
  document.getElementById('link-url').value = '';
  loadHubLinks();
}

async function loadHubLinks() {
  const container = document.getElementById('hub-links-list');
  const links = await window.ftcIDE.settings.get('resources.links') || [
    { label: 'FTC Events', url: 'https://ftc-events.firstinspires.org/' },
    { label: 'Game Manual Part 1', url: 'https://www.firstinspires.org/resource-library/ftc/game-and-season-info' }
  ];

  container.innerHTML = links.map(link => `
    <div class="hub-link-item" style="display:flex; justify-content:space-between; margin-bottom:8px; background:rgba(255,255,255,0.02); padding:8px; border-radius:4px;">
      <a href="#" onclick="window.ftcIDE.shell.openExternal('${link.url}')" style="color:var(--accent); text-decoration:none;">${link.label}</a>
      <button class="icon-btn small" onclick="removeHubLink('${link.label}')">✕</button>
    </div>
  `).join('');
}

window.removeHubLink = async (label) => {
  let links = await window.ftcIDE.settings.get('resources.links') || [];
  links = links.filter(l => l.label !== label);
  await window.ftcIDE.settings.set('resources.links', links);
  loadHubLinks();
};

// ── MANAGEMENT MODULE (Phase 7) ────────────────────────
function initManagementView() {
  const navBtns = document.querySelectorAll('.management-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.management-tab-content').forEach(tc => tc.classList.remove('active'));
      document.getElementById(`management-tab-${tabId}`).classList.add('active');
      if (tabId === 'kanban') loadKanbanTasks();
      if (tabId === 'team') loadTeamHub();
    });
  });

  const addTaskBtn = document.getElementById('btn-add-task');
  if (addTaskBtn) {
    addTaskBtn.addEventListener('click', () => {
      const title = prompt('Enter task title:');
      if (title) {
        window.ftcIDE.management.saveTask({ title, status: 'todo', priority: 'Medium' }).then(() => loadKanbanTasks());
      }
    });
  }

  loadKanbanTasks();
  loadTeamHub();
}

async function loadKanbanTasks() {
  const tasks = await window.ftcIDE.management.getTasks();
  const containers = {
    'todo': document.getElementById('tasks-todo'),
    'in-progress': document.getElementById('tasks-in-progress'),
    'done': document.getElementById('tasks-done')
  };

  Object.entries(containers).forEach(([status, c]) => {
    if (c) c.innerHTML = '';
  });

  tasks.forEach(task => {
    const container = containers[task.status];
    if (!container) return;
    
    const card = document.createElement('div');
    card.className = 'task-card';
    card.innerHTML = `
      <span class="task-title">${task.title}</span>
      <div class="task-meta">
        <span class="priority-${task.priority}">${task.priority}</span>
        <div class="task-actions">
          ${task.status !== 'done' ? `<button onclick="moveTask(${task.id}, '${task.status === 'todo' ? 'in-progress' : 'done'}')">→</button>` : ''}
          <button onclick="aiSsuggestTask(${task.id})">🤖</button>
          <button onclick="deleteTask(${task.id})">✕</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

window.moveTask = async (id, nextStatus) => {
  const tasks = await window.ftcIDE.management.getTasks();
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.status = nextStatus;
    await window.ftcIDE.management.saveTask(task);
    loadKanbanTasks();
  }
};

window.deleteTask = async (id) => {
  if (confirm('Delete task?')) {
    await window.ftcIDE.management.deleteTask(id);
    loadKanbanTasks();
  }
};

window.aiSsuggestTask = async (id) => {
  const res = await window.ftcIDE.management.getAiSuggestion(id);
  const resultArea = document.getElementById('ai-assignment-results');
  const tasks = await window.ftcIDE.management.getTasks();
  const task = tasks.find(t => t.id === id);
  
  if (resultArea && task) {
    resultArea.innerHTML = `
      <div class="ai-suggestion-item">
        <h4>Suggestion for: "${task.title}"</h4>
        <p>Recommended: <strong>${res.memberName}</strong></p>
        <p style="font-size:12px; color:var(--fg-dim);">${res.reason}</p>
        <button class="btn-primary small" onclick="assignTask(${id}, ${res.memberId})">Apply Assignment</button>
      </div>
    `;
    const aiTabBtn = document.querySelector('.management-nav-btn[data-tab="ai-assign"]');
    if (aiTabBtn) aiTabBtn.click();
  }
};

window.assignTask = async (taskId, memberId) => {
  const tasks = await window.ftcIDE.management.getTasks();
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    task.memberId = memberId;
    await window.ftcIDE.management.saveTask(task);
    showToast('Task assigned', 'success');
  }
};

async function loadTeamHub() {
  const team = await window.ftcIDE.management.getTeam();
  const grid = document.getElementById('team-members-grid');
  if (grid) {
    grid.innerHTML = team.map(member => `
      <div class="member-card">
        <div class="member-avatar">${member.name[0]}</div>
        <h4>${member.name}</h4>
        <span class="role">${member.role}</span>
        <div class="skill-tags">
          ${member.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }
}

// ── OUTREACH MODULE ──────────────────────────
function initOutreachView() {
  const addBtn = document.getElementById('btn-add-outreach');
  if (addBtn) {
    // Clone to remove old listeners
    const newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);
    newBtn.addEventListener('click', async () => {
      const eventName = prompt('Event Name:');
      if (!eventName) return;
      const date = prompt('Date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
      const impact = prompt('Impact (e.g. 50 students):', '0');
      const hours = parseInt(prompt('Volunteer Hours:', '0')) || 0;
      
      await window.ftcIDE.management.addOutreachEntry({
        event: eventName, impact, hours, date
      });
      showToast('Outreach event logged', 'success');
      loadOutreachLog();
    });
  }

  loadOutreachLog();
}

async function loadOutreachLog() {
  const log = await window.ftcIDE.management.getOutreachLog();
  const body = document.getElementById('outreach-log-body');
  if (!body) return;
  
  let totalReach = 0;
  let totalHours = 0;

  body.innerHTML = log.map(entry => {
    totalReach += parseInt(entry.impact) || 0;
    totalHours += entry.hours;
    return `
      <tr>
        <td>${entry.event}</td>
        <td>${entry.date}</td>
        <td>${entry.impact}</td>
        <td>${entry.hours} hrs</td>
        <td><button class="icon-btn small">✕</button></td>
      </tr>
    `;
  }).join('');

  const totalEventsEl = document.getElementById('stat-total-events');
  const totalReachEl = document.getElementById('stat-total-reach');
  const totalHoursEl = document.getElementById('stat-total-hours');

  if (totalEventsEl) totalEventsEl.textContent = log.length;
  if (totalReachEl) totalReachEl.textContent = totalReach;
  if (totalHoursEl) totalHoursEl.textContent = totalHours;
}

// ── PHASE 8 REFINEMENTS ─────────────────────────────

function bindPhase8Nav() {
  // Global Home Button handler
  document.querySelectorAll('.nav-home-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showSuiteDashboard();
    });
  });

  // Dashboard Setting Launcher
  const launchSettings = document.getElementById('launch-settings');
  if (launchSettings) {
    launchSettings.addEventListener('click', () => {
      openAppView('settings');
      initSettingsView();
    });
  }

  // Vision Tuner Integration
  const launchVision = document.getElementById('launch-vision-tuner');
  if (launchVision) {
    launchVision.addEventListener('click', () => {
      // Launch IDE and switch to vision tab
      openAppView('ide');
      setTimeout(() => {
        const visionTab = document.querySelector('.bottom-tab[data-panel="vision"]');
        if (visionTab) visionTab.click();
        if (typeof toggleBottomPanel === 'function') toggleBottomPanel(true);
      }, 100);
    });
  }

  // Auto-Scouting button
  const autoScoutBtn = document.getElementById('btn-auto-scout');
  if (autoScoutBtn) {
    autoScoutBtn.addEventListener('click', runAutoScouting);
  }
}

// Settings logic
async function initSettingsView() {
  const teamNameInput = document.getElementById('settings-team-name');
  const teamNumberInput = document.getElementById('settings-team-number');
  const accentColorInput = document.getElementById('settings-accent-color');
  const colorModeInput = document.getElementById('settings-color-mode');
  const checkUpdatesBtn = document.getElementById('btn-check-updates');
  const saveBtn = document.getElementById('btn-save-settings');

  if (!saveBtn) return;

  try {
    // Load existing
    const teamName = await window.ftcIDE.settings.get('team.name') || '';
    const teamNumber = await window.ftcIDE.settings.get('team.number') || '';
    const accentColor = await window.ftcIDE.settings.get('theme.accent') || '#ff69b4';
    const colorMode = await window.ftcIDE.settings.get('ui.colorMode') || 'dark';

    if (teamNameInput) teamNameInput.value = teamName;
    if (teamNumberInput) teamNumberInput.value = teamNumber;
    if (accentColorInput) accentColorInput.value = accentColor;
    if (colorModeInput) colorModeInput.value = colorMode;

    // Apply accent color initially
    document.documentElement.style.setProperty('--accent', accentColor);
    applyColorMode(colorMode);
  } catch (e) {
    console.error('Failed to load settings:', e);
  }

  // Avoid multiple listeners
  saveBtn.replaceWith(saveBtn.cloneNode(true));
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const newName = document.getElementById('settings-team-name').value;
    const newNumber = document.getElementById('settings-team-number').value;
    const newColor = document.getElementById('settings-accent-color').value;
    const newColorMode = document.getElementById('settings-color-mode').value;

    await window.ftcIDE.settings.set('team.name', newName);
    await window.ftcIDE.settings.set('team.number', newNumber);
    await window.ftcIDE.settings.set('theme.accent', newColor);
    await window.ftcIDE.settings.set('ui.colorMode', newColorMode);

    // Update UI
    document.documentElement.style.setProperty('--accent', newColor);
    applyColorMode(newColorMode);
    showToast('Settings saved and theme applied!', 'success');
  });

  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', () => manualCheckForUpdates());
  }
}

// Auto Scouting
async function runAutoScouting() {
  const teamNumber = document.getElementById('auto-team-number').value;
  if (!teamNumber) { showToast('Please enter a team number', 'warning'); return; }

  const resultsDiv = document.getElementById('auto-scouting-results');
  resultsDiv.innerHTML = '<div class="ai-msg bot">Searching DECODE 2025 records...</div>';

  try {
    const data = await window.ftcIDE.scouting.getAutoData(teamNumber);
    
    let html = `
      <div class="scouting-card">
        <h3>Found Recent Event: ${data.event.name} (${data.season})</h3>
        <p><strong>Team ${teamNumber} Rank:</strong> ${data.teamRank}</p>
        <h4 style="margin-top:15px; font-size:12px;">Competitiveness Analysis (Top 10):</h4>
        <table class="scouting-table">
          <thead><tr><th>Team</th><th>Rank</th><th>RP</th></tr></thead>
          <tbody>
            ${data.competition.map(c => `
              <tr style="${c.isTarget ? 'background:rgba(0, 122, 204, 0.2); font-weight:bold;' : ''}">
                <td>${c.teamNumber} ${c.isTarget ? '(You)' : ''}</td>
                <td>${c.rank}</td>
                <td>${c.rp}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    resultsDiv.innerHTML = html;
  } catch (e) {
    resultsDiv.innerHTML = `<div class="ai-msg bot" style="color:#e74c3c">Error Discovery: ${e.message}</div>`;
  }
}

// Enhanced Mechanics listeners
function rebindMechanics() {
  const gearBtn = document.getElementById('btn-calc-gear');
  if (gearBtn) {
    gearBtn.replaceWith(gearBtn.cloneNode(true));
    document.getElementById('btn-calc-gear').addEventListener('click', async () => {
      const teeth = parseInt(document.getElementById('gear-teeth').value);
      const od = parseFloat(document.getElementById('gear-od').value) || null;
      const dp = parseFloat(document.getElementById('gear-dp').value) || null;
      const module = parseFloat(document.getElementById('gear-module').value) || null;

      const res = await window.ftcIDE.mechanics.calculateGear({ teeth, od, dp, module });
      const resultEl = document.getElementById('gear-result');
      if (res.error) {
        resultEl.textContent = res.error;
      } else {
        resultEl.innerHTML = `
          <strong>Result (${res.system}):</strong><br>
          Teeth: ${res.teeth}<br>
          Outer Diameter: ${res.od.toFixed(3)} ${res.system === 'Metric' ? 'mm' : 'in'}<br>
          ${res.dp ? `DP: ${res.dp.toFixed(2)}<br>` : ''}
          ${res.module ? `Module: ${res.module.toFixed(2)}<br>` : ''}
          Pitch Diameter: ${res.pitchDiameter.toFixed(3)}
        `;
      }
    });
  }

  const dtBtn = document.getElementById('btn-analyze-dt');
  if (dtBtn) {
    dtBtn.replaceWith(dtBtn.cloneNode(true));
    document.getElementById('btn-analyze-dt').addEventListener('click', async () => {
      const rpm = parseInt(document.getElementById('dt-rpm').value);
      const wheel = parseFloat(document.getElementById('dt-wheel').value);
      const weight = parseFloat(document.getElementById('dt-weight').value);

      const res = await window.ftcIDE.mechanics.analyzeDrivetrain(rpm, wheel, weight);
      document.getElementById('dt-result').innerHTML = `
        <strong>Analysis:</strong><br>
        Speed: ${res.feetPerSec.toFixed(2)} ft/s<br>
        Acceleration: <span style="color:var(--accent)">${res.accelerationScore}</span><br>
        <strong>Expert Tip:</strong> ${res.recommendation}
      `;
    });
  }
}

// Call rebinding after initial init
setTimeout(rebindMechanics, 1000);

