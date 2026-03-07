'use strict';

const https = require('https');

// ── GitHub OAuth App Client ID ────────────────────────────────────────────────
// Register your own OAuth App at https://github.com/settings/applications/new
// then enable "Device Authorization Flow" in the app settings and paste the
// Client ID below.  A client secret is NOT required for the device flow.
const GITHUB_CLIENT_ID = 'Ov23liYVVBMH5fJxm0xc';

// Scopes requested during authorization (read:user gives basic profile info).
const SCOPES = 'read:user';

class GitHubAuth {
  constructor() {
    this._polling = false;
    this._aborted = false;
  }

  /* ── public API ─────────────────────────────────────────────────────────── */

  /**
   * Start the OAuth Device Flow.
   * Returns { userCode, verificationUri, deviceCode, interval, expiresIn }.
   */
  async startDeviceFlow() {
    const body = await this._post('github.com', '/login/device/code', {
      client_id: GITHUB_CLIENT_ID,
      scope: SCOPES
    });

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

  /**
   * Poll GitHub until the user completes authorization.
   * Resolves with the access token string, or rejects on error / timeout.
   */
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
            client_id: GITHUB_CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
          });

          if (body.access_token) {
            this._polling = false;
            return resolve(body.access_token);
          }

          if (body.error === 'authorization_pending') {
            setTimeout(poll, interval * 1000);
            return;
          }

          if (body.error === 'slow_down') {
            // GitHub asks us to increase the interval by 5 s.
            interval += 5;
            setTimeout(poll, interval * 1000);
            return;
          }

          // Any other error is terminal (expired_token, access_denied, …).
          this._polling = false;
          reject(new Error(body.error_description || body.error || 'Token exchange failed'));
        } catch (err) {
          this._polling = false;
          reject(err);
        }
      };

      // First poll after one interval.
      setTimeout(poll, interval * 1000);
    });
  }

  /**
   * Abort an in-progress poll.
   */
  cancelDeviceFlow() {
    this._aborted = true;
  }

  get isPolling() {
    return this._polling;
  }

  /**
   * Fetch the authenticated user's profile from the GitHub API.
   * Requires a valid access token.
   * Returns { login, name, avatar_url, … }.
   */
  fetchUser(token) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.github.com',
        port: 443,
        path: '/user',
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChuckleIDE'
        }
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            let msg = `GitHub returned HTTP ${res.statusCode}`;
            try { const j = JSON.parse(body); msg = j.message || msg; } catch { /* ignore */ }
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
      req.end();
    });
  }

  /* ── internal helpers ───────────────────────────────────────────────────── */

  _post(hostname, urlPath, params) {
    return new Promise((resolve, reject) => {
      const data = new URLSearchParams(params).toString();
      const req = https.request({
        hostname,
        port: 443,
        path: urlPath,
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            let msg = `GitHub returned HTTP ${res.statusCode}`;
            try { const j = JSON.parse(body); msg = j.message || j.error || msg; } catch { /* ignore */ }
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

module.exports = GitHubAuth;
