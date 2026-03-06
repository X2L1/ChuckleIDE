'use strict';

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const os = require('os');

/**
 * Manages the Eclipse JDT Language Server for Java code intelligence.
 * Downloads, starts, and communicates with the Java LSP server.
 * Provides completion, hover, diagnostics, and go-to-definition.
 */
class LspManager extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.process = null;
    this.running = false;
    this.pendingRequests = new Map();
    this.msgId = 1;
    this.buffer = '';
    this.lspDir = path.join(os.homedir(), '.ftcide', 'jdt-ls');
  }

  isRunning() {
    return this.running && this.process !== null;
  }

  /** Start the Java LSP server for a given project workspace */
  async start(workspacePath) {
    if (this.running) return { success: true, message: 'LSP already running' };

    try {
      const jdtPath = await this._ensureJdtLs();
      if (!jdtPath) return { success: false, error: 'JDT-LS not available' };

      const javaHome = this.store.get('build.javaHome') || process.env.JAVA_HOME || '';
      const javaCmd = javaHome ? path.join(javaHome, 'bin', 'java') : 'java';

      const configDir = path.join(this.lspDir, 'config_linux');
      const workspaceData = path.join(os.homedir(), '.ftcide', 'workspace');
      await fs.ensureDir(workspaceData);

      const jdtJar = path.join(jdtPath, 'plugins', 'org.eclipse.equinox.launcher_*.jar');
      const jarFile = await this._findJar(path.join(jdtPath, 'plugins'));

      if (!jarFile) return { success: false, error: 'JDT-LS launcher jar not found' };

      const args = [
        '-Declipse.application=org.eclipse.jdt.ls.core.id1',
        '-Dosgi.bundles.defaultStartLevel=4',
        '-Declipse.product=org.eclipse.jdt.ls.core.product',
        '-Dlog.level=ALL',
        '-noverify',
        '-Xmx1G',
        '--add-modules=ALL-SYSTEM',
        '--add-opens', 'java.base/java.util=ALL-UNNAMED',
        '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
        '-jar', jarFile,
        '-configuration', configDir,
        '-data', workspaceData
      ];

      this.process = spawn(javaCmd, args, {
        cwd: workspacePath || process.cwd(),
        env: { ...process.env, JAVA_HOME: javaHome },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (data) => this._handleData(data));
      this.process.stderr.on('data', (data) => console.error('[LSP stderr]', data.toString()));
      this.process.on('close', (code) => {
        this.running = false;
        this.process = null;
        this.emit('stopped', code);
      });
      this.process.on('error', (e) => {
        this.running = false;
        this.emit('error', e);
      });

      this.running = true;

      // Initialize LSP protocol
      await this._initialize(workspacePath);

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  stop() {
    if (this.process) {
      try {
        this.process.kill();
      } catch (e) {}
      this.process = null;
    }
    this.running = false;
  }

  async sendRequest(method, params) {
    if (!this.running || !this.process) {
      return { error: 'LSP not running' };
    }
    return this._sendRequest(method, params);
  }

  _sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      const message = { jsonrpc: '2.0', id, method, params };
      const json = JSON.stringify(message);
      const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;

      this.pendingRequests.set(id, { resolve, reject });

      try {
        this.process.stdin.write(header + json);
      } catch (e) {
        this.pendingRequests.delete(id);
        reject(e);
      }

      // Timeout after 5s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('LSP request timeout'));
        }
      }, 5000);
    });
  }

  _sendNotification(method, params) {
    if (!this.running || !this.process) return;
    const message = { jsonrpc: '2.0', method, params };
    const json = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
    try { this.process.stdin.write(header + json); } catch (e) {}
  }

  _handleData(data) {
    this.buffer += data.toString();
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.substring(0, headerEnd);
      const lengthMatch = header.match(/Content-Length: (\d+)/);
      if (!lengthMatch) { this.buffer = this.buffer.substring(headerEnd + 4); continue; }

      const length = parseInt(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) break;

      const body = this.buffer.substring(bodyStart, bodyStart + length);
      this.buffer = this.buffer.substring(bodyStart + length);

      try {
        const msg = JSON.parse(body);
        this._handleMessage(msg);
      } catch (e) {}
    }
  }

  _handleMessage(msg) {
    if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id);
      this.pendingRequests.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      // Server notification
      this.emit('notification', msg);
    }
  }

  async _initialize(workspacePath) {
    try {
      await this._sendRequest('initialize', {
        processId: process.pid,
        rootUri: `file://${workspacePath || process.cwd()}`,
        capabilities: {
          textDocument: {
            completion: {
              completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'] }
            },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: { linkSupport: true },
            publishDiagnostics: {}
          },
          workspace: { symbol: {} }
        },
        initializationOptions: {
          bundles: [],
          workspaceFolders: workspacePath ? [`file://${workspacePath}`] : []
        }
      });
      this._sendNotification('initialized', {});
    } catch (e) {
      console.error('LSP initialize failed:', e.message);
    }
  }

  async _ensureJdtLs() {
    const jdtDir = this.lspDir;
    const launchersDir = path.join(jdtDir, 'plugins');

    if (await fs.pathExists(launchersDir)) {
      const jar = await this._findJar(launchersDir);
      if (jar) return jdtDir;
    }

    // JDT-LS not found – return null (user must install manually)
    console.warn('JDT Language Server not found at', jdtDir);
    console.warn('Download from https://download.eclipse.org/jdtls/snapshots/');
    return null;
  }

  async _findJar(pluginsDir) {
    try {
      const files = await fs.readdir(pluginsDir);
      const launcher = files.find(f => f.startsWith('org.eclipse.equinox.launcher_') && f.endsWith('.jar'));
      return launcher ? path.join(pluginsDir, launcher) : null;
    } catch (e) {
      return null;
    }
  }
}

module.exports = LspManager;
