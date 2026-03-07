# FTC IDE

A comprehensive desktop IDE for [FIRST Tech Challenge (FTC)](https://www.firstinspires.org/robotics/ftc) robotics programming, built with Electron. Write, build, and deploy Java code to your robot — all from one app.

## Download

Pre-built executables are available on the [Releases page](https://github.com/X2L1/ChuckleIDE/releases).

1. Go to the **[Latest Release](https://github.com/X2L1/ChuckleIDE/releases/latest)**.
2. Under **Assets**, download the installer or portable `.exe` for Windows.
3. Run the downloaded file to install or launch FTC IDE.

> **Note:** You still need **Java JDK ≥ 8** and **adb** installed on your system for building and deploying robot code. See [Prerequisites](#prerequisites) below.

---

## Features

- **Code Editor** — Syntax-highlighted Java editing with find, replace, and go-to-line
- **Gradle Build System** — Build, clean, and deploy projects directly from the IDE
- **ADB Device Management** — Connect, pair, and push builds to a Control Hub or phone over USB or Wi-Fi
- **Git Integration** — Init, clone, commit, pull, push, and branch without leaving the editor
- **Java Language Server** — Real-time diagnostics, completions, and navigation powered by Eclipse JDT
- **FTC Templates** — Scaffold OpModes, subsystems, commands, vision pipelines, odometry, PID controllers, and more
- **GitHub Copilot Support** — AI-assisted code completions (requires a Copilot token)
- **Auto-Updater** — Automatically pulls the latest commits and relaunches the app

## Prerequisites

If you downloaded the installer from the [Releases page](https://github.com/X2L1/ChuckleIDE/releases), you only need **Java JDK** and (optionally) **adb**. Git and Node.js are only required if you are running from source.

| Requirement | Downloaded installer | Running from source |
|---|---|---|
| **Java JDK** ≥ 8 | ✅ Required | ✅ Required |
| **Android Debug Bridge (adb)** | Optional (for deploying to robot) | Optional (for deploying to robot) |
| **Git** | Not needed | ✅ Required |
| **Node.js** ≥ 18 (includes **npm**) | Not needed | ✅ Required |

---

### 1 · Install Git

<details>
<summary><strong>Windows</strong></summary>

1. Go to <https://git-scm.com/download/win> and download the installer.
2. Run the installer. Accept all default options (click **Next** until you reach **Install**, then click **Install**).
3. Open **Command Prompt** (press `Win + R`, type `cmd`, press Enter) and run:
   ```bash
   git --version
   ```
   You should see something like `git version 2.x.x`. If you get an error, restart your computer and try again.
</details>

<details>
<summary><strong>macOS</strong></summary>

1. Open **Terminal** (press `Cmd + Space`, type `Terminal`, press Enter).
2. Run:
   ```bash
   git --version
   ```
3. If Git is not installed, macOS will prompt you to install the **Xcode Command Line Tools**. Click **Install** and wait for it to finish.
4. Run `git --version` again to confirm.
</details>

<details>
<summary><strong>Linux (Ubuntu / Debian)</strong></summary>

1. Open a terminal and run:
   ```bash
   sudo apt update && sudo apt install -y git
   ```
2. Verify:
   ```bash
   git --version
   ```
</details>

---

### 2 · Install Node.js (≥ 18)

Node.js comes bundled with **npm**, so you get both in one install.

<details>
<summary><strong>Windows</strong></summary>

1. Go to <https://nodejs.org> and download the **LTS** installer (the big green button).
2. Run the installer. Accept all defaults and make sure **"Add to PATH"** is checked.
3. **Restart Command Prompt**, then verify:
   ```bash
   node --version
   npm --version
   ```
   `node --version` should print `v18.x.x` or higher.
</details>

<details>
<summary><strong>macOS</strong></summary>

1. Go to <https://nodejs.org> and download the **LTS** installer for macOS.
2. Open the downloaded `.pkg` file and follow the prompts.
3. Open a **new** Terminal window, then verify:
   ```bash
   node --version
   npm --version
   ```
</details>

<details>
<summary><strong>Linux (Ubuntu / Debian)</strong></summary>

1. Run the following commands in a terminal:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt install -y nodejs
   ```
2. Verify:
   ```bash
   node --version
   npm --version
   ```
</details>

---

### 3 · Install Java JDK (≥ 8)

<details>
<summary><strong>Windows</strong></summary>

1. Go to <https://adoptium.net> and download the **Latest LTS** `.msi` installer for Windows.
2. Run the installer. On the **Custom Setup** screen, make sure **"Set JAVA_HOME variable"** is enabled (it should be by default).
3. **Restart Command Prompt**, then verify:
   ```bash
   java -version
   javac -version
   ```
   You should see version `8` (shown as `1.8.x`) or higher.
</details>

<details>
<summary><strong>macOS</strong></summary>

1. Go to <https://adoptium.net> and download the **Latest LTS** `.pkg` installer for macOS.
2. Open the downloaded file and follow the prompts.
3. Open a **new** Terminal window, then verify:
   ```bash
   java -version
   javac -version
   ```

Alternatively, if you have [Homebrew](https://brew.sh):
```bash
brew install --cask temurin
```
</details>

<details>
<summary><strong>Linux (Ubuntu / Debian)</strong></summary>

1. Run:
   ```bash
   sudo apt update && sudo apt install -y default-jdk
   ```
2. Verify:
   ```bash
   java -version
   javac -version
   ```
</details>

---

### 4 · Install Android Debug Bridge (adb)

> **Note:** You only need `adb` if you want to deploy code to a robot. You can skip this step and still write and build code.

<details>
<summary><strong>Windows</strong></summary>

1. Download **SDK Platform-Tools** from <https://developer.android.com/tools/releases/platform-tools#downloads> (click the Windows link).
2. Unzip the downloaded file to a permanent location, for example `C:\platform-tools`.
3. Add the folder to your PATH:
   - Press `Win + R`, type `sysdm.cpl`, press Enter.
   - Go to **Advanced** → **Environment Variables**.
   - Under **System variables**, select **Path**, click **Edit**, then **New**, and type `C:\platform-tools`.
   - Click **OK** on every dialog.
4. **Restart Command Prompt**, then verify:
   ```bash
   adb version
   ```
</details>

<details>
<summary><strong>macOS</strong></summary>

If you have [Homebrew](https://brew.sh):
```bash
brew install --cask android-platform-tools
```

Otherwise:
1. Download **SDK Platform-Tools** from <https://developer.android.com/tools/releases/platform-tools#downloads> (click the macOS link).
2. Unzip and move the folder to a permanent location, for example `~/platform-tools`.
3. Add it to your PATH by appending this line to `~/.zshrc` (or `~/.bash_profile`):
   ```bash
   export PATH="$HOME/platform-tools:$PATH"
   ```
4. Open a **new** Terminal window, then verify:
   ```bash
   adb version
   ```
</details>

<details>
<summary><strong>Linux (Ubuntu / Debian)</strong></summary>

1. Run:
   ```bash
   sudo apt update && sudo apt install -y android-tools-adb
   ```
2. Verify:
   ```bash
   adb version
   ```
</details>

---

### ✅ Verify Everything

Before continuing, open a **new** terminal window and make sure all four tools are working:

```bash
git --version      # e.g. git version 2.43.0
node --version     # e.g. v20.11.0  (must be 18 or higher)
npm --version      # e.g. 10.2.4
java -version      # e.g. openjdk version "1.8.x" or "17.0.x"
adb version        # e.g. Android Debug Bridge version 1.0.41  (optional)
```

If any command fails, go back to the relevant step above and try again.

---

## Getting Started

### Option A — Download the installer (recommended)

See the [Download](#download) section above. This is the easiest way to get started.

### Option B — Run from source

If you prefer to run from source or want to contribute, you need **Git** and **Node.js ≥ 18** installed (see [Prerequisites](#prerequisites)).

```bash
# Clone the repository
git clone https://github.com/X2L1/ChuckleIDE.git
cd ChuckleIDE

# Install dependencies
npm install

# Start the IDE
npm start
```

A window will open with the FTC IDE. You're ready to code! 🎉

### Development mode (optional)

To launch with DevTools open for debugging:

```bash
npm run dev
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `git` / `node` / `java` / `adb` is not recognized | Close your terminal, open a **new** one, and try again. If it still fails, make sure the tool's install folder is on your system **PATH** (see install steps above). |
| `npm install` fails with permission errors | **macOS/Linux:** Don't use `sudo npm install`. Instead, fix npm permissions: <https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally>. **Windows:** Run Command Prompt as Administrator. |
| `npm install` is very slow | Make sure you have a stable internet connection. You can try `npm install --prefer-offline` if you've installed before. |
| `npm start` shows a blank white window | Wait a few seconds — the app may still be loading. If it persists, try `npm run dev` and check the DevTools console for errors. |
| Java version is too old | Make sure `java -version` shows 8 (displayed as `1.8`) or higher. Uninstall old Java versions and install the latest from <https://adoptium.net>. |
| `electron` not found after `npm install` | Delete the `node_modules` folder and `package-lock.json`, then run `npm install` again. |

## Available Scripts

| Script | Description |
|---|---|
| `npm start` | Launch the IDE |
| `npm run dev` | Launch in development mode |
| `npm run build` | Package distributable binaries for the current platform |
| `npm run build:linux` | Build for Linux (AppImage, deb) |
| `npm run build:win` | Build for Windows (NSIS, portable) |
| `npm run build:mac` | Build for macOS (DMG) |

## Project Structure

```
├── main.js              # Electron main process
├── preload.js           # Context bridge (renderer ↔ main IPC)
├── src/
│   ├── main/            # Main-process modules
│   │   ├── adb-manager.js
│   │   ├── build-manager.js
│   │   ├── copilot.js
│   │   ├── git-manager.js
│   │   ├── lsp-manager.js
│   │   ├── project-manager.js
│   │   └── updater.js
│   ├── renderer/        # Front-end UI
│   │   ├── index.html
│   │   ├── app.js
│   │   └── styles.css
│   └── templates/       # FTC Java code templates
│       ├── autonomous/
│       ├── teleop/
│       ├── subsystems/
│       ├── commands/
│       ├── vision/
│       ├── odometry/
│       ├── pid/
│       └── statemachine/
├── ftc-project/         # Bundled FTC SDK project scaffold
├── assets/              # App icons and logo
└── package.json
```

## Included Templates

| Category | Templates |
|---|---|
| Autonomous | Basic Autonomous · PedroPathing Autonomous · Command-Based Autonomous |
| TeleOp | Basic TeleOp · Mecanum Drive TeleOp · Command-Based TeleOp |
| Subsystems | Drivetrain · Arm · Intake · Linear Slides |
| Commands | Drive Command · Arm Command · Sequential Command Group |
| Vision | AprilTag Detection · TensorFlow Detection |
| Odometry | Three Wheel · Two Wheel + IMU |
| Control | PID Controller |
| State Machine | State Machine OpMode |

## Cutting a Release

> This section is for maintainers. End users can simply download from [Releases](https://github.com/X2L1/ChuckleIDE/releases).

The build workflow (`.github/workflows/build.yml`) automatically builds installer artifacts for Linux, Windows, and macOS and attaches them to a GitHub Release whenever a version tag is pushed.

### Steps

1. **Bump the version** in `package.json`:
   ```json
   "version": "1.2.3"
   ```

2. **Commit and push** the version bump:
   ```bash
   git add package.json
   git commit -m "chore: bump version to 1.2.3"
   git push origin main
   ```

3. **Create and push a version tag** (preferred format: `vX.Y.Z`):
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

   Both `vX.Y.Z` (e.g. `v1.2.3`) and `X.Y.Z` (e.g. `1.2.3`) tags trigger the workflow.

4. **GitHub Actions** will build installers on Linux, Windows, and macOS in parallel, then create a GitHub Release with the installer files attached automatically.

### Expected release assets

| File | Platform |
|---|---|
| `*.AppImage` | Linux (portable) |
| `*.deb` | Linux (Debian/Ubuntu) |
| `*Setup*.exe` | Windows (NSIS installer) |
| `*.exe` (portable) | Windows (portable) |
| `*.dmg` | macOS |

---

## License

This project is licensed under the [MIT License](LICENSE).