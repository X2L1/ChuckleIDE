'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Template registry – lists all available FTC code templates
 * and provides content generation with customization options.
 */

const TEMPLATES = [
  // ── Autonomous ───────────────────────────────────────────────────────────────
  {
    id: 'basic-autonomous',
    name: 'Basic Autonomous',
    category: 'Autonomous',
    description: 'Simple time-based autonomous with mecanum drive',
    icon: '🤖',
    file: 'autonomous/BasicAutonomous.java'
  },
  {
    id: 'pedro-autonomous',
    name: 'PedroPathing Autonomous',
    category: 'Autonomous',
    description: 'Path-following autonomous using PedroPathing',
    icon: '🛣️',
    file: 'autonomous/PedroPathingAutonomous.java'
  },
  {
    id: 'command-autonomous',
    name: 'Command-Based Autonomous',
    category: 'Autonomous',
    description: 'NextFTC command-based autonomous architecture',
    icon: '⚙️',
    file: 'autonomous/CommandBasedAutonomous.java'
  },
  // ── TeleOp ───────────────────────────────────────────────────────────────────
  {
    id: 'basic-teleop',
    name: 'Basic TeleOp',
    category: 'TeleOp',
    description: 'Simple single-driver TeleOp',
    icon: '🎮',
    file: 'teleop/BasicTeleOp.java'
  },
  {
    id: 'mecanum-teleop',
    name: 'Mecanum Drive TeleOp',
    category: 'TeleOp',
    description: 'Full mecanum drive with field-centric option',
    icon: '🎮',
    file: 'teleop/MecanumTeleOp.java'
  },
  {
    id: 'command-teleop',
    name: 'Command-Based TeleOp',
    category: 'TeleOp',
    description: 'NextFTC command-based TeleOp architecture',
    icon: '🎮',
    file: 'teleop/CommandBasedTeleOp.java'
  },
  // ── Subsystems ───────────────────────────────────────────────────────────────
  {
    id: 'drivetrain-subsystem',
    name: 'Drivetrain Subsystem',
    category: 'Subsystems',
    description: 'Mecanum drivetrain subsystem (NextFTC style)',
    icon: '🔧',
    file: 'subsystems/DrivetrainSubsystem.java'
  },
  {
    id: 'arm-subsystem',
    name: 'Arm Subsystem',
    category: 'Subsystems',
    description: 'Motor-driven arm with encoder positioning',
    icon: '🔧',
    file: 'subsystems/ArmSubsystem.java'
  },
  {
    id: 'intake-subsystem',
    name: 'Intake Subsystem',
    category: 'Subsystems',
    description: 'Intake/outtake mechanism subsystem',
    icon: '🔧',
    file: 'subsystems/IntakeSubsystem.java'
  },
  {
    id: 'slides-subsystem',
    name: 'Linear Slides Subsystem',
    category: 'Subsystems',
    description: 'Linear slides with PID control',
    icon: '🔧',
    file: 'subsystems/SlidesSubsystem.java'
  },
  // ── Commands ─────────────────────────────────────────────────────────────────
  {
    id: 'drive-command',
    name: 'Drive Command',
    category: 'Commands',
    description: 'Gamepad-driven drive command',
    icon: '📋',
    file: 'commands/DriveCommand.java'
  },
  {
    id: 'arm-command',
    name: 'Arm Command',
    category: 'Commands',
    description: 'Move arm to a target position',
    icon: '📋',
    file: 'commands/ArmCommand.java'
  },
  {
    id: 'sequential-group',
    name: 'Sequential Command Group',
    category: 'Commands',
    description: 'Run commands in sequence',
    icon: '📋',
    file: 'commands/SequentialCommandGroup.java'
  },
  // ── State Machine ────────────────────────────────────────────────────────────
  {
    id: 'state-machine',
    name: 'State Machine OpMode',
    category: 'State Machine',
    description: 'Enum-based state machine OpMode',
    icon: '🔄',
    file: 'statemachine/StateMachineOpMode.java'
  },
  // ── Vision ───────────────────────────────────────────────────────────────────
  {
    id: 'apriltag',
    name: 'AprilTag Detection',
    category: 'Vision',
    description: 'AprilTag detection and pose estimation (Webcam)',
    icon: '👁️',
    file: 'vision/AprilTagDetection.java'
  },
  {
    id: 'tensorflow',
    name: 'TensorFlow Detection',
    category: 'Vision',
    description: 'TensorFlow Lite object detection (Webcam)',
    icon: '👁️',
    file: 'vision/TensorFlowDetection.java'
  },
  {
    id: 'huskylens',
    name: 'HuskyLens Detection',
    category: 'Vision',
    description: 'DFRobot HuskyLens AI camera (I2C)',
    icon: '👁️',
    file: 'vision/HuskyLensDetection.java'
  },
  {
    id: 'limelight',
    name: 'Limelight Detection',
    category: 'Vision',
    description: 'Limelight 3A smart camera with AprilTags & neural detection',
    icon: '👁️',
    file: 'vision/LimelightDetection.java'
  },
  // ── Odometry ─────────────────────────────────────────────────────────────────
  {
    id: 'pinpoint-odometry',
    name: 'Pinpoint Odometry',
    category: 'Odometry',
    description: 'GoBilda Pinpoint odometry computer (modern standard)',
    icon: '📐',
    file: 'odometry/PinpointOdometry.java'
  },
  // ── PID ──────────────────────────────────────────────────────────────────────
  {
    id: 'pid-controller',
    name: 'PID Controller',
    category: 'Control',
    description: 'Reusable PID controller implementation',
    icon: '📊',
    file: 'pid/PIDController.java'
  },
  // ── ChuckleLib Utilities ─────────────────────────────────────────────────────
  {
    id: 'gamepad-ex',
    name: 'GamepadEx',
    category: 'ChuckleLib',
    description: 'Enhanced gamepad with edge detection & deadzone (ChuckleLib)',
    icon: '🎮',
    file: 'utilities/GamepadEx.java'
  },
  {
    id: 'math-utils',
    name: 'MathUtils',
    category: 'ChuckleLib',
    description: 'Angle wrapping, clamping, interpolation helpers (ChuckleLib)',
    icon: '🔢',
    file: 'utilities/MathUtils.java'
  },
  {
    id: 'hardware-creator',
    name: 'HardwareCreator',
    category: 'ChuckleLib',
    description: 'Reduce motor & servo boilerplate (ChuckleLib)',
    icon: '🔧',
    file: 'utilities/HardwareCreator.java'
  },
  {
    id: 'timer',
    name: 'Timer',
    category: 'ChuckleLib',
    description: 'Cooldowns, timeouts & periodic events (ChuckleLib)',
    icon: '⏱️',
    file: 'utilities/Timer.java'
  }
];

/** List all available templates (metadata only) */
function list() {
  return TEMPLATES.map(({ id, name, category, description, icon }) =>
    ({ id, name, category, description, icon }));
}

/** Get raw template content */
function get(templateId) {
  const tmpl = TEMPLATES.find(t => t.id === templateId);
  if (!tmpl) throw new Error(`Template not found: ${templateId}`);
  const filePath = path.join(__dirname, tmpl.file);
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Generate template content with substituted class name and package.
 * @param {string} templateId
 * @param {object} options - { className, packageName }
 */
function create(templateId, options = {}) {
  const content = get(templateId);
  const { className, packageName } = options;

  let result = content;
  if (className) {
    // Replace placeholder class name (first public class definition)
    result = result.replace(
      /public class (\w+)/,
      `public class ${className}`
    );
    // Replace annotation name if present
    result = result.replace(
      /name = "([^"]+)"/,
      `name = "${className}"`
    );
  }
  if (packageName) {
    result = result.replace(
      /^package [a-zA-Z0-9_.]+;/m,
      `package ${packageName};`
    );
  }
  return result;
}

module.exports = { list, get, create };
