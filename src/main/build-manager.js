'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

/**
 * Manages Gradle build operations for FTC Android projects.
 * Runs assembleDebug, clean, and installDebug via Gradle wrapper.
 */
class BuildManager {
  constructor() {
    this.currentProcess = null;
    this.gradleArgs = [];
    this.slothMode = false;
  }

  /** Set extra Gradle arguments (e.g. --stacktrace) */
  setGradleArgs(args) {
    this.gradleArgs = args ? args.split(' ').filter(Boolean) : [];
  }

  /** Enable or disable Sloth Mode (build speed optimizations) */
  setSlothMode(enabled) {
    this.slothMode = !!enabled;
  }

  /** Run ./gradlew assembleDebug */
  async assemble(projectPath, outputCallback) {
    return this._runGradle(projectPath, ['assembleDebug', '--console=plain'], outputCallback);
  }

  /** Run ./gradlew clean */
  async clean(projectPath, outputCallback) {
    return this._runGradle(projectPath, ['clean', '--console=plain'], outputCallback);
  }

  /**
   * Run ./gradlew installDebug (requires ADB device connected).
   * This builds and installs the APK onto the connected Control Hub.
   */
  async install(projectPath, outputCallback) {
    return this._runGradle(projectPath, ['installDebug', '--console=plain'], outputCallback);
  }

  /** Stop any running Gradle build */
  stop() {
    if (this.currentProcess) {
      try {
        this.currentProcess.kill('SIGTERM');
        setTimeout(() => {
          if (this.currentProcess) this.currentProcess.kill('SIGKILL');
        }, 3000);
      } catch (e) {}
      this.currentProcess = null;
      return { success: true };
    }
    return { success: false, error: 'No build running' };
  }

  async _runGradle(projectPath, tasks, outputCallback) {
    if (this.currentProcess) {
      return { success: false, error: 'A build is already running' };
    }

    // Determine gradle wrapper
    const gradlew = await this._getGradlew(projectPath);
    if (!gradlew) {
      return { success: false, error: `Gradle wrapper not found in ${projectPath}` };
    }

    // Sloth Mode: ensure gradle.properties exists and inject speed flags
    if (this.slothMode) {
      await this._ensureSlothProperties(projectPath, outputCallback);
    }

    const slothFlags = this.slothMode
      ? ['--daemon', '--parallel', '--build-cache']
      : [];
    const args = [...tasks, ...slothFlags, ...this.gradleArgs];
    const javaHome = process.env.JAVA_HOME;

    return new Promise((resolve) => {
      let hasError = false;
      const env = { ...process.env };
      if (javaHome) env.JAVA_HOME = javaHome;

      outputCallback && outputCallback(`\nRunning: ${gradlew} ${args.join(' ')}\n`);

      this.currentProcess = spawn(gradlew, args, {
        cwd: projectPath,
        env,
        shell: process.platform === 'win32'
      });

      this.currentProcess.stdout.on('data', (data) => {
        const line = data.toString();
        if (outputCallback) outputCallback(line);
        if (line.includes('FAILED') || line.includes('BUILD FAILED')) hasError = true;
      });

      this.currentProcess.stderr.on('data', (data) => {
        const line = data.toString();
        if (outputCallback) outputCallback(line);
        if (line.includes('error:') || line.includes('BUILD FAILED')) hasError = true;
      });

      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;
        const success = code === 0 && !hasError;
        outputCallback && outputCallback(`\nProcess exited with code ${code}\n`);
        resolve({ success, exitCode: code });
      });

      this.currentProcess.on('error', (err) => {
        this.currentProcess = null;
        outputCallback && outputCallback(`\nBuild error: ${err.message}\n`);
        resolve({ success: false, error: err.message });
      });
    });
  }

  async _getGradlew(projectPath) {
    const isWin = process.platform === 'win32';
    const gradlewName = isWin ? 'gradlew.bat' : 'gradlew';
    const gradlewPath = path.join(projectPath, gradlewName);

    if (await fs.pathExists(gradlewPath)) {
      if (!isWin) {
        try { await fs.chmod(gradlewPath, '755'); } catch (e) {}
      }
      return gradlewPath;
    }

    // Walk up to find gradlew
    const parent = path.dirname(projectPath);
    if (parent !== projectPath) {
      return this._getGradlew(parent);
    }

    return null;
  }

  /**
   * Sloth Mode: ensure a gradle.properties file with speed optimizations
   * exists in the project root.
   */
  async _ensureSlothProperties(projectPath, outputCallback) {
    const propsPath = path.join(projectPath, 'gradle.properties');
    const slothProps = [
      'org.gradle.daemon=true',
      'org.gradle.parallel=true',
      'org.gradle.caching=true',
      'org.gradle.configureondemand=true'
    ];

    try {
      let content = '';
      if (await fs.pathExists(propsPath)) {
        content = await fs.readFile(propsPath, 'utf8');
      }

      let updated = false;
      for (const prop of slothProps) {
        const key = prop.split('=')[0];
        if (!content.includes(key)) {
          content += `\n${prop}`;
          updated = true;
        }
      }

      // Ensure JVM args for speed if not already present
      if (!content.includes('org.gradle.jvmargs')) {
        content += '\norg.gradle.jvmargs=-Xmx2048m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';
        updated = true;
      }

      if (updated) {
        await fs.writeFile(propsPath, content.trim() + '\n');
        outputCallback && outputCallback('🦥 Sloth Mode: gradle.properties optimized for speed\n');
      } else {
        outputCallback && outputCallback('🦥 Sloth Mode: speed optimizations active\n');
      }
    } catch (e) {
      outputCallback && outputCallback(`🦥 Sloth Mode warning: could not update gradle.properties: ${e.message}\n`);
    }
  }
}

module.exports = BuildManager;
