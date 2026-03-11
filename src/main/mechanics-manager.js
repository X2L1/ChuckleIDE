'use strict';

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

/**
 * MechanicsManager handles mechanical calculations, drivetrain analysis,
 * and CAD weak-point analysis (simulated).
 */
class MechanicsManager extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
  }

  /**
   * Gear calculation with outer diameter (OD), teeth (N), and pitch (DP or Module).
   */
  calculateGear(input) {
    const { teeth, od, dp, module } = input;
    
    // Imperial (DP): OD = (N + 2) / DP, PD = N / DP
    if (dp) {
      if (teeth) {
        const calculatedOD = (teeth + 2) / dp;
        return { teeth, od: calculatedOD, dp, pitchDiameter: teeth / dp, system: 'Imperial' };
      } else if (od) {
        const calculatedTeeth = Math.round((od * dp) - 2);
        return { teeth: calculatedTeeth, od, dp, pitchDiameter: calculatedTeeth / dp, system: 'Imperial' };
      }
    }
    
    // Metric (Module): M = PD / N, OD = (N + 2) * M, PD = N * M
    if (module) {
      if (teeth) {
        const calculatedOD = (teeth + 2) * module;
        return { teeth, od: calculatedOD, module, pitchDiameter: teeth * module, system: 'Metric' };
      } else if (od) {
        const calculatedTeeth = Math.round((od / module) - 2);
        return { teeth: calculatedTeeth, od, module, pitchDiameter: calculatedTeeth * module, system: 'Metric' };
      }
    }

    // Solve for DP or Module if Teeth and OD are provided
    if (teeth && od) {
      const calculatedDP = (teeth + 2) / od;
      const calculatedModule = od / (teeth + 2);
      return { 
        teeth, od, 
        dp: calculatedDP, 
        module: calculatedModule,
        pitchDiameter: teeth * calculatedModule,
        system: 'Mixed'
      };
    }

    return { error: 'Incomplete gear parameters' };
  }

  /**
   * Belt length calculation using C2C distance, pulley sizes, and belt type.
   */
  calculateBelt(input) {
    const { d1, d2, center, beltType = 'HTD 5mm' } = input;
    if (!d1 || !d2 || !center) return { error: 'All pulley diameters and C2C distance are required.' };

    // Belt pitch lookup (for tooth count estimation)
    const pitchMap = {
      'HTD 5mm': 5,      // 5mm pitch
      'GT2 3mm': 3,      // 3mm pitch
      'Round Belt': 0     // No teeth
    };
    const pitchMm = pitchMap[beltType] || 5;

    // Standard belt length formula: L = 2C + π/2(D+d) + (D-d)²/(4C)
    const length = (2 * center) + (Math.PI / 2 * (d1 + d2)) + (Math.pow(d1 - d2, 2) / (4 * center));

    const result = {
      length: length,
      beltType: beltType
    };

    // For toothed belts, calculate approximate tooth count
    if (pitchMm > 0) {
      const lengthMm = length * 25.4; // Convert inches to mm
      result.teeth = Math.round(lengthMm / pitchMm);
      result.pitchMm = pitchMm;
    }

    // Speed ratio
    if (d1 > 0 && d2 > 0) {
      result.speedRatio = (d1 / d2).toFixed(3);
    }

    return result;
  }

  /**
   * Chain length calculation.
   */
  calculateChain(input) {
    const { d1, d2, center, pitch = 0.25 } = input;
    if (!d1 || !d2 || !center) return { error: 'All sprocket diameters and C2C distance are required.' };

    // Standard chain length formula: L = 2C + π/2(D+d) + (D-d)²/(4C)
    const length = (2 * center) + (Math.PI / 2 * (d1 + d2)) + (Math.pow(d1 - d2, 2) / (4 * center));
    const links = Math.max(1, Math.round(length / pitch));

    // Speed ratio
    const speedRatio = d1 > 0 && d2 > 0 ? (d1 / d2).toFixed(3) : null;

    return { length, links, pitch, speedRatio };
  }

  /**
   * Drivetrain effectiveness analyzer.
   * Considers RPM, wheel diameter, robot weight, gear ratio, motor stall torque,
   * number of motors, and drivetrain type.
   */
  analyzeDrivetrain(rpm, wheelDiameter, weight, options = {}) {
    const robotWeight = Number.isFinite(weight) ? weight : 20;
    const gearRatio = options.gearRatio || 1;
    const motorStallTorque = options.motorStallTorque || 3.2; // N·m default (goBILDA 5202/3)
    const numMotors = options.numMotors || 4;
    const driveType = options.driveType || 'mecanum';

    // Drivetrain type efficiency factor
    const efficiencyMap = { mecanum: 0.80, tank: 0.90, swerve: 0.85 };
    const driveEfficiency = efficiencyMap[driveType] || 0.85;

    // Effective RPM at the wheel after gear ratio
    const effectiveRPM = rpm / gearRatio;
    const circum = wheelDiameter * Math.PI; // inches
    const feetPerSec = (effectiveRPM * circum) / (60 * 12); // ft/s theoretical
    const adjustedSpeed = feetPerSec * driveEfficiency;

    // Pushing force calculation (lbs)
    // Torque at wheel = motor stall torque * gear ratio * num_motors * efficiency
    // Force = torque / wheel radius
    const wheelRadiusMeters = (wheelDiameter / 2) * 0.0254; // inches to meters
    const totalTorqueNm = motorStallTorque * gearRatio * numMotors * driveEfficiency;
    const pushForceNewtons = totalTorqueNm / wheelRadiusMeters;
    const pushForceLbs = pushForceNewtons * 0.2248;

    // Acceleration estimate (F = ma)
    const robotMassKg = robotWeight * 0.4536;
    const accelerationMps2 = (pushForceNewtons * 0.5) / robotMassKg; // 50% stall torque as working point
    const accelerationFtps2 = accelerationMps2 * 3.281;

    // Current draw estimate per motor under load (approximation)
    const stallCurrentPerMotor = options.stallCurrent || 9.8; // Amps (goBILDA 5202/3)
    const runningCurrentPerMotor = stallCurrentPerMotor * 0.4; // ~40% of stall under normal driving
    const totalCurrentDraw = runningCurrentPerMotor * numMotors;

    // Effectiveness scoring (0-100)
    // Balanced FTC drivetrain targets: ~4-6 ft/s adjusted speed, good pushing force, manageable current
    let effectiveness = 100;
    
    // Speed scoring: optimal range is 3-6 ft/s for FTC
    if (adjustedSpeed < 2) effectiveness -= 30;
    else if (adjustedSpeed < 3) effectiveness -= 15;
    else if (adjustedSpeed > 8) effectiveness -= 25;
    else if (adjustedSpeed > 6) effectiveness -= 10;

    // Push force scoring: higher is better, but diminishing returns
    const pushToWeight = pushForceLbs / robotWeight;
    if (pushToWeight < 0.5) effectiveness -= 20;
    else if (pushToWeight < 1.0) effectiveness -= 10;
    else if (pushToWeight > 3.0) effectiveness += 5;

    // Current draw scoring: over 20A total is risky
    if (totalCurrentDraw > 30) effectiveness -= 20;
    else if (totalCurrentDraw > 20) effectiveness -= 10;

    // Acceleration scoring
    if (accelerationFtps2 < 3) effectiveness -= 15;
    else if (accelerationFtps2 > 8) effectiveness += 5;

    effectiveness = Math.max(0, Math.min(100, Math.round(effectiveness)));

    // Recommendation
    let recommendation = '';
    let accelerationScore = 'Good';

    if (effectiveness >= 80) {
      recommendation = '✅ Excellent drivetrain configuration. Well-balanced speed, pushing power, and efficiency.';
      accelerationScore = 'Excellent';
    } else if (effectiveness >= 60) {
      recommendation = '⚡ Good configuration with room for improvement.';
      if (adjustedSpeed > 6) recommendation += ' Consider a higher gear ratio to trade speed for torque.';
      if (pushToWeight < 1.0) recommendation += ' Pushing power is low - consider more motors or higher gear ratio.';
      accelerationScore = 'Good';
    } else if (effectiveness >= 40) {
      recommendation = '⚠️ Marginal configuration.';
      if (adjustedSpeed > 8) recommendation += ' Dangerously fast - high risk of motor stall and breaker trips.';
      if (adjustedSpeed < 2) recommendation += ' Too slow for competitive play. Lower your gear ratio.';
      if (totalCurrentDraw > 20) recommendation += ' High current draw - risk of brownout under load.';
      accelerationScore = 'Fair';
    } else {
      recommendation = '🚫 Poor configuration. Major changes recommended.';
      if (robotWeight > 35 && adjustedSpeed > 6) recommendation += ' This robot is too heavy for this gearing.';
      accelerationScore = 'Poor';
    }

    return {
      feetPerSec: adjustedSpeed,
      theoreticalSpeed: feetPerSec,
      pushForceLbs: Math.round(pushForceLbs * 10) / 10,
      accelerationFtps2: Math.round(accelerationFtps2 * 10) / 10,
      totalCurrentDraw: Math.round(totalCurrentDraw * 10) / 10,
      effectiveness,
      recommendation,
      accelerationScore,
      driveType,
      driveEfficiency: Math.round(driveEfficiency * 100)
    };
  }

  /**
   * Simulated CAD Weak Point Analysis.
   */
  analyzeCadWeakPoints(filePath) {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    if (!filePath || !fs.existsSync(filePath)) {
      return { error: 'No CAD file selected.' };
    }
    if (!['.step', '.stp', '.stl'].includes(ext)) {
      return { error: 'Unsupported CAD file type. Use STEP/STP/STL.' };
    }

    const results = [
      { component: 'C-Channel Brace', status: 'Warning', reason: 'Stress concentration at corner' },
      { component: 'Motor Mount', status: 'Critical', reason: 'Insufficient material thickness for torque load' },
      { component: 'Axle Hub', status: 'Good', reason: 'Sufficient factor of safety' }
    ];
    return { fileName: path.basename(filePath), results };
  }
}

module.exports = MechanicsManager;
