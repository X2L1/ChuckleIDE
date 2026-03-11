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
   * Belt/Chain length calculation.
   */
  calculateBeltChain(input) {
    const { d1, d2, center, type = 'belt', pitch = 0.2 } = input;
    if (!d1 || !d2 || !center) return { error: 'All pulley/sprocket and C2C values are required.' };
    // Approx length L = 2C + 1.57(D+d) + (D-d)^2 / 4C
    const length = (2 * center) + (1.57 * (d1 + d2)) + (Math.pow(d1 - d2, 2) / (4 * center));
    if (type === 'chain') {
      const links = Math.max(1, Math.round(length / pitch));
      return { length, links };
    }
    return { length };
  }

  /**
   * Drivetrain effectiveness analyzer.
   * Considers RPM, wheel diameter, and robot weight.
   */
  analyzeDrivetrain(rpm, wheelDiameter, weight) {
    const robotWeight = Number.isFinite(weight) ? weight : 20;
    const circum = wheelDiameter * Math.PI;
    const feetPerSec = (rpm * circum) / (60 * 12); // Theoretical top speed ft/s
    
    let recommendation = '';
    let accelerationScore = 'Good';

    // Simulated "Pushing power" and "Acceleration" based on weight
    // A heavier robot on the same gear ratio will accelerate slower.
    if (robotWeight > 35) {
      if (feetPerSec > 16) {
        recommendation = '⚠️ Dangerously geared for this weight. High risk of motor stall or breaker trip.';
        accelerationScore = 'Poor';
      } else if (feetPerSec > 13) {
        recommendation = 'Aggressive for a heavy robot. Ensure you have high-torque motors (e.g., 19.2:1).';
        accelerationScore = 'Fair';
      } else {
        recommendation = 'Solid heavy-duty build. Great for pushing and defense.';
        accelerationScore = 'Excellent';
      }
    } else {
      if (feetPerSec > 16) {
        recommendation = 'Speed demon! Extreme mobility, but watch for wheel slippage.';
        accelerationScore = 'Excellent (Traction Limited)';
      } else {
        recommendation = 'Very balanced performance for a standard weight robot.';
        accelerationScore = 'Good';
      }
    }

    const effectiveness = Math.max(0, Math.min(100, Math.round((16 - Math.abs(feetPerSec - 12)) * 6)));
    return { feetPerSec, recommendation, accelerationScore, effectiveness };
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
