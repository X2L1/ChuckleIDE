'use strict';

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Manages ADB connections to REV Control Hub and Android devices.
 * Supports wireless ADB (TCP/IP), wireless pairing (Android 11+),
 * file push, and shell command execution.
 */
class AdbManager {
  constructor() {
    this.adbPath = 'adb';
    this.connectedDevices = new Map();
    this.client = null;
    this._initClient();
  }

  async _initClient() {
    try {
      const adbkit = require('@devicefarmer/adbkit');
      this.client = adbkit.createClient();
    } catch (e) {
      console.warn('adbkit not available, falling back to CLI adb:', e.message);
      this.client = null;
    }
  }

  /** Set a custom ADB binary path */
  setAdbPath(p) {
    this.adbPath = p || 'adb';
  }

  /** Connect to a device over TCP/IP (wireless ADB) */
  async connect(host, port = 5555) {
    const target = `${host}:${port}`;
    try {
      if (this.client) {
        await this.client.connect(host, port);
        this.connectedDevices.set(target, { host, port, type: 'device' });
        return { success: true, target };
      }
      // CLI fallback
      const { stdout } = await execAsync(`${this.adbPath} connect ${target}`);
      const ok = stdout.includes('connected') || stdout.includes('already connected');
      if (ok) this.connectedDevices.set(target, { host, port, type: 'device' });
      return { success: ok, message: stdout.trim() };
    } catch (e) {
      throw new Error(`ADB connect failed: ${e.message}`);
    }
  }

  /** Disconnect from a device */
  async disconnect(target) {
    try {
      if (this.client) {
        const [host, port] = target.split(':');
        await this.client.disconnect(host, parseInt(port) || 5555);
      } else {
        await execAsync(`${this.adbPath} disconnect ${target}`);
      }
      this.connectedDevices.delete(target);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** List all connected ADB devices */
  async listDevices() {
    try {
      if (this.client) {
        const devices = await this.client.listDevices();
        return devices.map(d => ({ id: d.id, type: d.type }));
      }
      const { stdout } = await execAsync(`${this.adbPath} devices`);
      const lines = stdout.split('\n').slice(1).filter(l => l.trim());
      return lines
        .filter(l => l.includes('\t'))
        .map(l => {
          const [id, type] = l.trim().split('\t');
          return { id: id.trim(), type: type.trim() };
        });
    } catch (e) {
      return [];
    }
  }

  /** Push a local file to a remote path on the device */
  async pushFile(localPath, remotePath, deviceId) {
    try {
      if (this.client && deviceId) {
        const device = this.client.getDevice(deviceId);
        await device.push(localPath, remotePath);
        return { success: true };
      }
      const deviceFlag = deviceId ? `-s ${deviceId}` : '';
      const { stdout, stderr } = await execAsync(`${this.adbPath} ${deviceFlag} push "${localPath}" "${remotePath}"`);
      return { success: !stderr.includes('error'), output: stdout };
    } catch (e) {
      throw new Error(`ADB push failed: ${e.message}`);
    }
  }

  /** Execute a shell command on the device */
  async shell(command, deviceId) {
    try {
      if (this.client && deviceId) {
        const device = this.client.getDevice(deviceId);
        const output = await device.shell(command);
        return new Promise((resolve, reject) => {
          const chunks = [];
          output.on('data', chunk => chunks.push(chunk));
          output.on('end', () => resolve(Buffer.concat(chunks).toString()));
          output.on('error', reject);
        });
      }
      const deviceFlag = deviceId ? `-s ${deviceId}` : '';
      const { stdout } = await execAsync(`${this.adbPath} ${deviceFlag} shell ${command}`);
      return stdout;
    } catch (e) {
      throw new Error(`ADB shell failed: ${e.message}`);
    }
  }

  /**
   * Pair a device using Android 11+ wireless pairing.
   * Requires the device's pairing code shown in Developer Options.
   */
  async pair(host, port, code) {
    try {
      const { stdout, stderr } = await execAsync(`${this.adbPath} pair ${host}:${port} ${code}`);
      if (stderr && stderr.includes('error')) throw new Error(stderr.trim());
      return { success: true, message: stdout.trim() };
    } catch (e) {
      throw new Error(`Pairing failed: ${e.message}`);
    }
  }

  /** Get current status of ADB and connected devices */
  async getStatus() {
    const devices = await this.listDevices();
    return {
      available: true,
      connectedDevices: devices,
      deviceCount: devices.length
    };
  }

  /** Restart ADB server */
  async restartServer() {
    try {
      await execAsync(`${this.adbPath} kill-server`);
      await execAsync(`${this.adbPath} start-server`);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** Check if ADB is available in PATH */
  async isAvailable() {
    try {
      await execAsync(`${this.adbPath} version`);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Clean up connections */
  cleanup() {
    if (this.client) {
      try { this.client.end(); } catch (e) {}
    }
  }
}

module.exports = AdbManager;
