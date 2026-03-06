# FTC IDE

A comprehensive desktop IDE for [FIRST Tech Challenge (FTC)](https://www.firstinspires.org/robotics/ftc) robotics programming, built with Electron. Write, build, and deploy Java code to your robot — all from one app.

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

| Requirement | Notes |
|---|---|
| **Node.js** ≥ 18 | Required to run Electron |
| **npm** | Comes with Node.js |
| **Java JDK** ≥ 8 | Needed by Gradle and the language server |
| **Android Debug Bridge (adb)** | For deploying to a Control Hub or phone |

## Getting Started

```bash
# Clone the repository
git clone https://github.com/X2L1/Funny.git
cd Funny

# Install dependencies
npm install

# Start the IDE
npm start
```

To launch in development mode with DevTools open automatically:

```bash
npm run dev
```

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

## License

This project is licensed under the [MIT License](LICENSE).