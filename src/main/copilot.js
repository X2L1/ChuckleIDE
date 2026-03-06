'use strict';

const https = require('https');

/**
 * GitHub Copilot integration.
 * Authenticates via a GitHub personal access token (with copilot scope)
 * and fetches AI completions using the Copilot API.
 *
 * Users need a GitHub Copilot subscription and a token with `copilot` scope.
 */
class CopilotManager {
  constructor(store) {
    this.store = store;
    this.token = store.get('copilot.token') || null;
    this.copilotToken = null;    // Short-lived token from GitHub Copilot auth endpoint
    this.copilotTokenExpiry = 0;
  }

  setToken(token) {
    this.token = token;
    this.store.set('copilot.token', token);
    this.copilotToken = null; // reset cached token
    this.copilotTokenExpiry = 0;
  }

  async isAuthenticated() {
    if (!this.token) return false;
    try {
      await this._getCopilotToken();
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Exchange GitHub token for Copilot session token */
  async _getCopilotToken() {
    if (this.copilotToken && Date.now() < this.copilotTokenExpiry - 60000) {
      return this.copilotToken;
    }

    const data = await this._request(
      'GET',
      'api.github.com',
      '/copilot_internal/v2/token',
      { Authorization: `token ${this.token}`, 'editor-version': 'ftcide/1.0.0', 'editor-plugin-version': 'ftcide-copilot/1.0.0' }
    );

    if (!data.token) throw new Error('Failed to get Copilot token');
    this.copilotToken = data.token;
    this.copilotTokenExpiry = data.expires_at ? data.expires_at * 1000 : Date.now() + 25 * 60 * 1000;
    return this.copilotToken;
  }

  /**
   * Get code completions from GitHub Copilot.
   * @param {object} context - { prefix, suffix, filePath, language }
   */
  async getCompletions(context) {
    if (!this.token) return { completions: [] };

    try {
      const copilotToken = await this._getCopilotToken();
      const { prefix = '', suffix = '', language = 'java', filePath = 'TeamCode.java' } = context;

      const body = JSON.stringify({
        prompt: this._buildFtcPrompt(prefix, language),
        suffix,
        max_tokens: 150,
        temperature: 0.15,
        top_p: 1,
        n: 3,
        stop: ['\n\n', '```'],
        stream: false,
        extra: {
          language,
          next_indent: 0,
          trim_by_indentation: true,
          prompt_tokens: Math.floor(prefix.length / 4),
          suffix_tokens: Math.floor(suffix.length / 4)
        }
      });

      const result = await this._request(
        'POST',
        'copilot-proxy.githubusercontent.com',
        '/v1/engines/copilot-codex/completions',
        {
          Authorization: `Bearer ${copilotToken}`,
          'Content-Type': 'application/json',
          'editor-version': 'ftcide/1.0.0',
          'editor-plugin-version': 'ftcide-copilot/1.0.0',
          'openai-intent': 'copilot-ghost'
        },
        body
      );

      if (!result.choices) return { completions: [] };

      return {
        completions: result.choices
          .filter(c => c.text && c.text.trim())
          .map(c => ({ text: c.text, confidence: 1 - (c.logprobs || 0) }))
      };
    } catch (e) {
      console.error('Copilot completion error:', e.message);
      return { completions: [], error: e.message };
    }
  }

  /** Build an FTC-aware prompt with system context */
  _buildFtcPrompt(prefix, language) {
    const ftcContext = `// FTC (FIRST Tech Challenge) Java code
// Common imports: com.qualcomm.robotcore.*, org.firstinspires.ftc.*
// Hardware: DcMotor, Servo, CRServo, ColorSensor, IMU, DistanceSensor
// OpMode types: LinearOpMode, OpMode
// Annotations: @Autonomous, @TeleOp
// Path: com.pedropathing.*, com.rowanmcalpin.nextftc.*
`;
    return ftcContext + prefix;
  }

  /** Make an HTTPS request */
  _request(method, hostname, path, headers, body) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname,
        path,
        method,
        headers: {
          'User-Agent': 'FTC-IDE/1.0.0',
          Accept: 'application/json',
          ...headers
        }
      };

      if (body) {
        options.headers['Content-Length'] = Buffer.byteLength(body);
      }

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString();
            if (res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${text.substring(0, 200)}`));
            } else {
              resolve(JSON.parse(text));
            }
          } catch (e) {
            reject(new Error('Failed to parse response: ' + e.message));
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }
}

module.exports = CopilotManager;
