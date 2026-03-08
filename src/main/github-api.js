'use strict';

const https = require('https');

// ── GitHub OAuth App Client ID ────────────────────────────────────────────────
const DEFAULT_GITHUB_CLIENT_ID = 'Ov23liYVVBMH5fJxm0xc';

// Scopes requested during authorization.
const SCOPES = 'repo read:user user:email';

const API_VERSION = '2022-11-28';

class GitHubAPI {
  constructor(store) {
    this._store = store;
    this._clientId = store.get('github.clientId') || DEFAULT_GITHUB_CLIENT_ID;
    this._polling = false;
    this._aborted = false;
  }

  get token() {
    return this._store.get('github.token') || null;
  }

  get isAuthenticated() {
    return Boolean(this.token);
  }

  /* ── Auth: Device Flow ──────────────────────────────────────────────────── */

  async startDeviceFlow() {
    const body = await this._post('github.com', '/login/device/code', {
      client_id: this._clientId,
      scope: SCOPES
    }, { contentType: 'form' });

    if (!body.device_code || !body.user_code) {
      throw new Error(body.error_description || body.error || 'Failed to start device flow');
    }

    return {
      userCode: body.user_code,
      verificationUri: body.verification_uri,
      deviceCode: body.device_code,
      interval: body.interval || 5,
      expiresIn: body.expires_in || 900
    };
  }

  pollForToken(deviceCode, interval) {
    this._polling = true;
    this._aborted = false;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        if (this._aborted) {
          this._polling = false;
          return reject(new Error('cancelled'));
        }
        try {
          const body = await this._post('github.com', '/login/oauth/access_token', {
            client_id: this._clientId,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
          }, { contentType: 'form' });

          if (body.access_token) {
            this._polling = false;
            this._store.set('github.token', body.access_token);
            return resolve(body.access_token);
          }
          if (body.error === 'authorization_pending') {
            setTimeout(poll, interval * 1000);
            return;
          }
          if (body.error === 'slow_down') {
            interval += 5;
            setTimeout(poll, interval * 1000);
            return;
          }
          this._polling = false;
          reject(new Error(body.error_description || body.error || 'Token exchange failed'));
        } catch (err) {
          this._polling = false;
          reject(err);
        }
      };
      setTimeout(poll, interval * 1000);
    });
  }

  cancelDeviceFlow() { this._aborted = true; }
  get isPolling() { return this._polling; }

  setClientId(clientId) {
    const id = (clientId || '').trim();
    this._clientId = id || DEFAULT_GITHUB_CLIENT_ID;
    if (id) {
      this._store.set('github.clientId', id);
    } else {
      this._store.delete('github.clientId');
    }
  }

  signOut() {
    this._store.delete('github.token');
    this._store.delete('github.user');
  }

  /* ── User ───────────────────────────────────────────────────────────────── */

  async getUser() {
    return this._apiGet('/user');
  }

  async getUserProfile() {
    const user = this._store.get('github.user');
    const hasToken = Boolean(this.token);
    return { signedIn: hasToken && Boolean(user), user: user || null };
  }

  async fetchAndStoreUser() {
    const user = await this.getUser();
    this._store.set('github.user', {
      login: user.login,
      name: user.name || '',
      avatar_url: user.avatar_url || ''
    });
    return user;
  }

  /* ── Repos ──────────────────────────────────────────────────────────────── */

  async listRepos(opts = {}) {
    const params = new URLSearchParams();
    if (opts.sort) params.set('sort', opts.sort);
    if (opts.per_page) params.set('per_page', String(opts.per_page));
    if (opts.page) params.set('page', String(opts.page));
    if (opts.type) params.set('type', opts.type);
    const qs = params.toString();
    return this._apiGet(`/user/repos${qs ? '?' + qs : ''}`);
  }

  async getRepo(owner, repo) {
    return this._apiGet(`/repos/${owner}/${repo}`);
  }

  async createRepo(name, options = {}) {
    return this._apiPost('/user/repos', {
      name,
      description: options.description || '',
      private: options.isPrivate !== false,
      auto_init: options.autoInit !== false
    });
  }

  async deleteRepo(owner, repo) {
    return this._apiDelete(`/repos/${owner}/${repo}`);
  }

  async forkRepo(owner, repo) {
    return this._apiPost(`/repos/${owner}/${repo}/forks`, {});
  }

  /* ── Repo Contents (files) ──────────────────────────────────────────────── */

  async getContents(owner, repo, path, ref) {
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    const qs = params.toString();
    return this._apiGet(`/repos/${owner}/${repo}/contents/${path}${qs ? '?' + qs : ''}`);
  }

  async createOrUpdateFile(owner, repo, path, content, message, sha) {
    const body = {
      message: message || `Update ${path}`,
      content: Buffer.from(content).toString('base64')
    };
    if (sha) body.sha = sha;
    return this._apiPut(`/repos/${owner}/${repo}/contents/${path}`, body);
  }

  async deleteFile(owner, repo, path, sha, message) {
    return this._apiRequest('DELETE', `/repos/${owner}/${repo}/contents/${path}`, {
      message: message || `Delete ${path}`,
      sha
    });
  }

  /* ── Branches ───────────────────────────────────────────────────────────── */

  async listBranches(owner, repo) {
    return this._apiGet(`/repos/${owner}/${repo}/branches`);
  }

  async getBranch(owner, repo, branch) {
    return this._apiGet(`/repos/${owner}/${repo}/branches/${branch}`);
  }

  async createBranch(owner, repo, branchName, sha) {
    return this._apiPost(`/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha
    });
  }

  /* ── Commits ────────────────────────────────────────────────────────────── */

  async listCommits(owner, repo, opts = {}) {
    const params = new URLSearchParams();
    if (opts.sha) params.set('sha', opts.sha);
    if (opts.per_page) params.set('per_page', String(opts.per_page));
    if (opts.page) params.set('page', String(opts.page));
    const qs = params.toString();
    return this._apiGet(`/repos/${owner}/${repo}/commits${qs ? '?' + qs : ''}`);
  }

  async getCommit(owner, repo, ref) {
    return this._apiGet(`/repos/${owner}/${repo}/commits/${ref}`);
  }

  /* ── Issues ─────────────────────────────────────────────────────────────── */

  async listIssues(owner, repo, opts = {}) {
    const params = new URLSearchParams();
    if (opts.state) params.set('state', opts.state);
    if (opts.per_page) params.set('per_page', String(opts.per_page));
    if (opts.page) params.set('page', String(opts.page));
    const qs = params.toString();
    return this._apiGet(`/repos/${owner}/${repo}/issues${qs ? '?' + qs : ''}`);
  }

  async createIssue(owner, repo, title, body) {
    return this._apiPost(`/repos/${owner}/${repo}/issues`, { title, body });
  }

  async updateIssue(owner, repo, issueNumber, data) {
    return this._apiRequest('PATCH', `/repos/${owner}/${repo}/issues/${issueNumber}`, data);
  }

  /* ── Pull Requests ──────────────────────────────────────────────────────── */

  async listPullRequests(owner, repo, opts = {}) {
    const params = new URLSearchParams();
    if (opts.state) params.set('state', opts.state);
    if (opts.per_page) params.set('per_page', String(opts.per_page));
    const qs = params.toString();
    return this._apiGet(`/repos/${owner}/${repo}/pulls${qs ? '?' + qs : ''}`);
  }

  async createPullRequest(owner, repo, title, head, base, body) {
    return this._apiPost(`/repos/${owner}/${repo}/pulls`, { title, head, base, body });
  }

  /* ── Releases ───────────────────────────────────────────────────────────── */

  async listReleases(owner, repo) {
    return this._apiGet(`/repos/${owner}/${repo}/releases`);
  }

  /* ── Search ─────────────────────────────────────────────────────────────── */

  async searchRepos(query) {
    return this._apiGet(`/search/repositories?q=${encodeURIComponent(query)}`);
  }

  /* ── Copilot ────────────────────────────────────────────────────────────── */

  async copilotSuggest(prompt, language, filename) {
    // GitHub Copilot completions endpoint
    try {
      return await this._apiPost('/copilot/v1/completions', {
        prompt,
        language: language || 'java',
        filename: filename || 'Code.java',
        max_tokens: 500,
        temperature: 0.1,
        top_p: 1,
        n: 1,
        stop: ['\n\n\n']
      }, 'api.githubcopilot.com');
    } catch (err) {
      // If the dedicated Copilot endpoint fails, try the models endpoint
      try {
        return await this._apiPost('/chat/completions', {
          model: 'copilot-codex',
          messages: [
            { role: 'system', content: 'You are a helpful code completion assistant for FTC robotics Java code.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 500,
          temperature: 0.1
        }, 'api.githubcopilot.com');
      } catch {
        throw err;
      }
    }
  }

  /* ── Git operations (clone/push/pull via REST) ──────────────────────────── */

  async getTree(owner, repo, treeSha, recursive) {
    const path = `/repos/${owner}/${repo}/git/trees/${treeSha}${recursive ? '?recursive=1' : ''}`;
    return this._apiGet(path);
  }

  async getBlob(owner, repo, fileSha) {
    return this._apiGet(`/repos/${owner}/${repo}/git/blobs/${fileSha}`);
  }

  async createBlob(owner, repo, content, encoding) {
    return this._apiPost(`/repos/${owner}/${repo}/git/blobs`, {
      content,
      encoding: encoding || 'utf-8'
    });
  }

  async createTree(owner, repo, tree, baseTree) {
    const body = { tree };
    if (baseTree) body.base_tree = baseTree;
    return this._apiPost(`/repos/${owner}/${repo}/git/trees`, body);
  }

  async createCommit(owner, repo, message, treeSha, parents) {
    return this._apiPost(`/repos/${owner}/${repo}/git/commits`, {
      message,
      tree: treeSha,
      parents
    });
  }

  async updateRef(owner, repo, ref, sha, force) {
    return this._apiRequest('PATCH', `/repos/${owner}/${repo}/git/refs/${ref}`, {
      sha,
      force: Boolean(force)
    });
  }

  async getRef(owner, repo, ref) {
    return this._apiGet(`/repos/${owner}/${repo}/git/ref/${ref}`);
  }

  /**
   * Download an entire repository as a directory tree (via the Git Trees API).
   * Returns an array of { path, content } objects.
   */
  async downloadRepo(owner, repo, branch) {
    const branchInfo = await this.getBranch(owner, repo, branch || 'main').catch(() =>
      this.getBranch(owner, repo, 'master')
    );
    const treeSha = branchInfo.commit.sha;
    const tree = await this.getTree(owner, repo, treeSha, true);

    const files = [];
    for (const item of tree.tree) {
      if (item.type === 'blob' && item.size < 1000000) { // Skip files > 1MB
        try {
          const blob = await this.getBlob(owner, repo, item.sha);
          const content = blob.encoding === 'base64'
            ? Buffer.from(blob.content, 'base64').toString('utf-8')
            : blob.content;
          files.push({ path: item.path, content, mode: item.mode });
        } catch {
          // Skip files that fail to download
        }
      }
    }
    return files;
  }

  /**
   * Push local files to a GitHub repo by creating blobs, tree, commit, and updating ref.
   */
  async pushFiles(owner, repo, branch, files, message) {
    // Get the current branch ref
    const ref = await this.getRef(owner, repo, `heads/${branch}`);
    const parentSha = ref.object.sha;

    // Create blobs for each file
    const treeItems = [];
    for (const file of files) {
      const blob = await this.createBlob(owner, repo, file.content, 'utf-8');
      treeItems.push({
        path: file.path,
        mode: file.mode || '100644',
        type: 'blob',
        sha: blob.sha
      });
    }

    // Create tree
    const tree = await this.createTree(owner, repo, treeItems, parentSha);

    // Create commit
    const commit = await this.createCommit(owner, repo, message || 'Update from ChuckleIDE', tree.sha, [parentSha]);

    // Update ref
    await this.updateRef(owner, repo, `heads/${branch}`, commit.sha);

    return commit;
  }

  /* ── Internal HTTP helpers ──────────────────────────────────────────────── */

  _apiGet(path, hostname) {
    return this._apiRequest('GET', path, null, hostname);
  }

  _apiPost(path, data, hostname) {
    return this._apiRequest('POST', path, data, hostname);
  }

  _apiPut(path, data, hostname) {
    return this._apiRequest('PUT', path, data, hostname);
  }

  _apiDelete(path, hostname) {
    return this._apiRequest('DELETE', path, null, hostname);
  }

  _apiRequest(method, urlPath, data, hostname) {
    return new Promise((resolve, reject) => {
      const token = this.token;
      if (!token) return reject(new Error('Not authenticated. Please sign in to GitHub first.'));

      const host = hostname || 'api.github.com';
      const headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'ChuckleIDE',
        'X-GitHub-Api-Version': API_VERSION
      };

      let body = null;
      if (data && method !== 'GET') {
        body = JSON.stringify(data);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(body);
      }

      const req = https.request({
        hostname: host,
        port: 443,
        path: urlPath,
        method,
        headers
      }, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          if (res.statusCode === 204) return resolve(null);
          if (res.statusCode >= 400) {
            let msg = `GitHub API returned HTTP ${res.statusCode}`;
            try {
              const j = JSON.parse(responseBody);
              msg = j.message || msg;
            } catch { /* ignore */ }
            return reject(new Error(msg));
          }
          try {
            resolve(JSON.parse(responseBody));
          } catch {
            resolve(responseBody);
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  _post(hostname, urlPath, params, options = {}) {
    return new Promise((resolve, reject) => {
      let data, contentType;
      if (options.contentType === 'form') {
        data = new URLSearchParams(params).toString();
        contentType = 'application/x-www-form-urlencoded';
      } else {
        data = JSON.stringify(params);
        contentType = 'application/json';
      }

      const req = https.request({
        hostname,
        port: 443,
        path: urlPath,
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': contentType,
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            let msg = `GitHub returned HTTP ${res.statusCode}`;
            try { const j = JSON.parse(body); msg = j.message || j.error || msg; } catch { /* ignore */ }
            if (res.statusCode === 404) {
              msg += '. The OAuth Client ID may be invalid — check your GitHub Client ID in Settings.';
            }
            return reject(new Error(msg));
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Invalid response from GitHub: ${body.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

module.exports = GitHubAPI;
