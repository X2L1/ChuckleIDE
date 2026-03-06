'use strict';

/**
 * Updater — git-based self-update for FTC IDE.
 *
 * Because FTC IDE is distributed as source code (not a signed binary), updates
 * are delivered by pulling the latest commits from the GitHub repository and,
 * when package.json has changed, running `npm install`.  The Electron app is
 * then relaunched so the new code is loaded immediately.
 *
 * Flow
 * ────
 * 1. checkForUpdates()   → compares local HEAD to origin/HEAD via git fetch
 * 2. installUpdate()     → git pull → npm install (if needed) → app.relaunch()
 */

const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs-extra');
const simpleGit = require('simple-git');

const execFileAsync = promisify(execFile);

// Root directory of this Electron application (where package.json lives).
const APP_ROOT = path.resolve(__dirname, '..', '..');

// GitHub repository that owns this IDE — used only for building the changelog URL.
const REPO_OWNER = 'X2L1';
const REPO_NAME = 'ChuckleIDE';

class Updater {
  constructor() {
    this._git = simpleGit(APP_ROOT);
    this._updateAvailable = false;
    this._latestCommit = null;
    this._currentCommit = null;
    this._changelog = [];
    this._checkInterval = null;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Start periodic background checks (immediately + every `intervalMs`).
   * @param {number} [intervalMs=1_800_000]  30 minutes between checks.
   */
  startAutoCheck(onUpdate, intervalMs = 30 * 60 * 1000) {
    // First check after a short delay so it doesn't block app startup.
    setTimeout(() => this._runCheck(onUpdate), 5000);

    this._checkInterval = setInterval(() => this._runCheck(onUpdate), intervalMs);
  }

  stopAutoCheck() {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
  }

  /**
   * Check whether a new commit is available on the remote branch.
   * @returns {Promise<{hasUpdate, currentCommit, latestCommit, changelog}>}
   */
  async checkForUpdates() {
    try {
      // Make sure we are inside a git repository.
      const isRepo = await this._git.checkIsRepo();
      if (!isRepo) {
        return { hasUpdate: false, error: 'Not a git repository' };
      }

      // Fetch origin quietly (--tags so we also grab any version tags).
      await this._git.fetch(['--tags', '--quiet']);

      this._currentCommit = (await this._git.revparse(['HEAD'])).trim();

      // Determine the remote-tracking branch (origin/HEAD, origin/main, or
      // origin/master — whichever exists).
      const remoteBranch = await this._resolveRemoteBranch();
      if (!remoteBranch) {
        return { hasUpdate: false, error: 'Could not resolve remote branch' };
      }

      this._latestCommit = (await this._git.revparse([remoteBranch])).trim();

      const hasUpdate = this._currentCommit !== this._latestCommit;
      this._updateAvailable = hasUpdate;

      let changelog = [];
      if (hasUpdate) {
        changelog = await this._buildChangelog(this._currentCommit, this._latestCommit);
        this._changelog = changelog;
      }

      return {
        hasUpdate,
        currentCommit: this._currentCommit.slice(0, 7),
        latestCommit: this._latestCommit.slice(0, 7),
        changelog
      };
    } catch (err) {
      return { hasUpdate: false, error: err.message };
    }
  }

  /**
   * Pull updates, optionally reinstall npm dependencies, then relaunch.
   * @param {function} onProgress  Called with status strings during install.
   * @returns {Promise<{success, error?}>}
   */
  async installUpdate(onProgress = () => {}) {
    try {
      if (!this._updateAvailable) {
        // Re-check in case the user triggered this manually.
        const check = await this.checkForUpdates();
        if (!check.hasUpdate) {
          return { success: false, error: 'Already up to date' };
        }
      }

      onProgress('Pulling latest changes from GitHub…');
      const pullResult = await this._git.pull();
      const summary = pullResult.summary;
      onProgress(`Pulled: ${summary.changes} change(s), ${summary.insertions} insertion(s), ${summary.deletions} deletion(s)`);

      // Check whether package.json has changed (new dependencies).
      const pkgChanged = pullResult.files && pullResult.files.includes('package.json');
      if (pkgChanged) {
        onProgress('package.json changed — running npm install…');
        await this._runNpmInstall(onProgress);
        onProgress('npm install complete.');
      }

      onProgress('Relaunching FTC IDE…');
      // Give the renderer a moment to display the final message.
      await new Promise(r => setTimeout(r, 1200));
      this._relaunch();

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** Whether an update was detected in the most recent check. */
  get updateAvailable() {
    return this._updateAvailable;
  }

  /** The most recently fetched changelog entries. */
  get changelog() {
    return this._changelog;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Run a check and call onUpdate(result) if a new version is found. */
  async _runCheck(onUpdate) {
    try {
      const result = await this.checkForUpdates();
      if (result.hasUpdate && typeof onUpdate === 'function') {
        onUpdate(result);
      }
    } catch (_) {
      // Background check — swallow errors silently.
    }
  }

  /**
   * Try to figure out the remote-tracking branch in a portable way.
   * Preference order: origin/HEAD, origin/main, origin/master.
   */
  async _resolveRemoteBranch() {
    try {
      // `git symbolic-ref refs/remotes/origin/HEAD` works after `git remote set-head origin -a`
      const result = await this._git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
      return result.trim().replace('refs/remotes/', '');
    } catch (_) {
      // Fall back to probing common branch names.
    }

    const candidates = ['origin/main', 'origin/master'];
    for (const candidate of candidates) {
      try {
        await this._git.revparse([candidate]);
        return candidate;
      } catch (_) {
        // Not found — try next.
      }
    }
    return null;
  }

  /**
   * Build a human-readable changelog between two commits.
   * Returns an array of { hash, subject, author, date } objects.
   */
  async _buildChangelog(from, to) {
    try {
      const log = await this._git.log({ from, to });
      return (log.all || []).map(c => ({
        hash: c.hash.slice(0, 7),
        subject: c.message.split('\n')[0].trim(),
        author: c.author_name,
        date: c.date.slice(0, 10)
      }));
    } catch (_) {
      return [];
    }
  }

  /** Run `npm install` inside APP_ROOT. */
  async _runNpmInstall(onProgress) {
    return new Promise((resolve, reject) => {
      // Use `npm` via shell so it works on all platforms.
      const isWin = process.platform === 'win32';
      const npmCmd = isWin ? 'npm.cmd' : 'npm';

      const child = require('child_process').spawn(npmCmd, ['install', '--prefer-offline'], {
        cwd: APP_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: isWin
      });

      child.stdout.on('data', d => onProgress(d.toString().trim()));
      child.stderr.on('data', d => {
        const msg = d.toString().trim();
        if (msg) onProgress(`npm: ${msg}`);
      });

      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`npm install exited with code ${code}`));
      });
    });
  }

  /** Relaunch the Electron app. */
  _relaunch() {
    const { app } = require('electron');
    app.relaunch();
    app.exit(0);
  }
}

module.exports = Updater;
