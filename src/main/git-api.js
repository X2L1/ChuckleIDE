const simpleGit = require('simple-git');
const fs = require('fs-extra');
const path = require('path');

class GitAPI {
  constructor() {}

  /**
   * Clone a remote repository to a local path.
   */
  async clone(url, localPath) {
    try {
      await fs.ensureDir(localPath);
      const git = simpleGit();
      await git.clone(url, localPath);
      return { success: true, path: localPath };
    } catch (error) {
      throw new Error(`Failed to clone: ${error.message}`);
    }
  }

  /**
   * Get the status of a repository
   */
  async status(repoPath) {
    try {
      const git = simpleGit(repoPath);
      const status = await git.status();
      const isRepo = await git.checkIsRepo();
      return { isRepo, status };
    } catch (error) {
      // If it's not a git repo, simple-git throws.
      return { isRepo: false, status: null, error: error.message };
    }
  }

  /**
   * Initialize a new git repository
   */
  async init(repoPath) {
    try {
      const git = simpleGit(repoPath);
      await git.init();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Add files to the staging area
   */
  async add(repoPath, files = ['.']) {
    try {
      const git = simpleGit(repoPath);
      await git.add(files);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to add files: ${error.message}`);
    }
  }

  /**
   * Commit staged files
   */
  async commit(repoPath, message) {
    try {
      const git = simpleGit(repoPath);
      const result = await git.commit(message);
      return { success: true, result };
    } catch (error) {
      throw new Error(`Failed to commit: ${error.message}`);
    }
  }

  /**
   * Push commits to a remote
   */
  async push(repoPath, remote = 'origin', branch = 'main') {
    try {
      const git = simpleGit(repoPath);
      const result = await git.push(remote, branch);
      return { success: true, result };
    } catch (error) {
      throw new Error(`Failed to push: ${error.message}`);
    }
  }

  /**
   * Pull commits from a remote
   */
  async pull(repoPath, remote = 'origin', branch = 'main') {
    try {
      const git = simpleGit(repoPath);
      const result = await git.pull(remote, branch);
      return { success: true, result };
    } catch (error) {
      throw new Error(`Failed to pull: ${error.message}`);
    }
  }
}

module.exports = GitAPI;
