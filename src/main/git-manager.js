'use strict';

const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs-extra');

/**
 * Manages GitHub/Git operations for FTC projects.
 * Wraps simple-git with error handling and token-based HTTPS auth.
 */
class GitManager {
  constructor() {
    this._gitInstances = new Map();
  }

  _git(repoPath) {
    if (!this._gitInstances.has(repoPath)) {
      const git = simpleGit(repoPath);
      this._gitInstances.set(repoPath, git);
    }
    return this._gitInstances.get(repoPath);
  }

  /** Inject auth token into remote URL for HTTPS operations */
  _injectToken(url, token) {
    if (!token || !url) return url;
    if (url.startsWith('https://') && !url.includes('@')) {
      return url.replace('https://', `https://oauth2:${token}@`);
    }
    return url;
  }

  /** Initialize a new git repository */
  async init(repoPath) {
    await fs.ensureDir(repoPath);
    const git = simpleGit(repoPath);
    await git.init();
    this._gitInstances.set(repoPath, git);
    return { success: true, path: repoPath };
  }

  /** Clone a repository to a destination path */
  async clone(url, destPath, token) {
    const authUrl = this._injectToken(url, token);
    await fs.ensureDir(destPath);
    const git = simpleGit(destPath);
    await git.clone(authUrl, destPath);
    return { success: true, path: destPath };
  }

  /** Get git status (modified, untracked, staged files) */
  async status(repoPath) {
    try {
      const status = await this._git(repoPath).status();
      return status;
    } catch (e) {
      throw new Error(`Git status failed: ${e.message}`);
    }
  }

  /** Get diff for a specific file or all changes */
  async diff(repoPath, file) {
    try {
      if (file) {
        return await this._git(repoPath).diff(['HEAD', '--', file]);
      }
      return await this._git(repoPath).diff(['HEAD']);
    } catch (e) {
      return await this._git(repoPath).diff();
    }
  }

  /** Stage files for commit */
  async add(repoPath, files) {
    if (!files || files.length === 0) files = ['.'];
    await this._git(repoPath).add(files);
    return { success: true };
  }

  /** Commit staged changes */
  async commit(repoPath, message) {
    const result = await this._git(repoPath).commit(message);
    return { success: true, commit: result.commit, summary: result.summary };
  }

  /** Pull from remote */
  async pull(repoPath, remote = 'origin', branch = '', token) {
    const git = this._git(repoPath);
    if (token) {
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === remote);
      if (origin) {
        const authUrl = this._injectToken(origin.refs.fetch, token);
        await git.remote(['set-url', remote, authUrl]);
      }
    }
    const result = branch
      ? await git.pull(remote, branch)
      : await git.pull();
    return { success: true, summary: result.summary };
  }

  /** Push to remote */
  async push(repoPath, remote = 'origin', branch = '', token) {
    const git = this._git(repoPath);
    if (token) {
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === remote);
      if (origin) {
        const authUrl = this._injectToken(origin.refs.fetch, token);
        await git.remote(['set-url', remote, authUrl]);
      }
    }
    if (branch) {
      await git.push(remote, branch);
    } else {
      await git.push();
    }
    return { success: true };
  }

  /** List all branches */
  async branches(repoPath) {
    try {
      return await this._git(repoPath).branchLocal();
    } catch (e) {
      return { all: [], current: '' };
    }
  }

  /** Checkout a branch */
  async checkout(repoPath, branch) {
    await this._git(repoPath).checkout(branch);
    return { success: true, branch };
  }

  /** Get commit log */
  async log(repoPath, maxCount = 20) {
    try {
      return await this._git(repoPath).log({ maxCount });
    } catch (e) {
      return { all: [] };
    }
  }

  /** Create a new branch */
  async createBranch(repoPath, branchName) {
    await this._git(repoPath).checkoutLocalBranch(branchName);
    return { success: true, branch: branchName };
  }

  /** Get remote URLs */
  async getRemotes(repoPath) {
    try {
      return await this._git(repoPath).getRemotes(true);
    } catch (e) {
      return [];
    }
  }

  /** Add a remote */
  async addRemote(repoPath, name, url) {
    await this._git(repoPath).addRemote(name, url);
    return { success: true };
  }

  /** Check if a path is a git repository */
  async isRepo(repoPath) {
    try {
      const git = simpleGit(repoPath);
      return await git.checkIsRepo();
    } catch (e) {
      return false;
    }
  }
}

module.exports = GitManager;
