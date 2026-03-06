package org.firstinspires.ftc.teamcode.pid;

import com.qualcomm.robotcore.util.ElapsedTime;

/**
 * Reusable PID Controller for FTC mechanisms.
 *
 * Supports:
 *   - Standard PID with derivative on measurement (avoids derivative kick)
 *   - Integral clamping (prevents windup)
 *   - Output clamping
 *   - Feed-forward term
 *   - Wrapping for continuous inputs (e.g., heading control)
 *
 * Example usage (arm control):
 * <pre>
 *   PIDController pid = new PIDController(0.01, 0.0001, 0.0005);
 *   pid.setTarget(targetPosition);
 *   // In loop:
 *   double power = pid.calculate(currentPosition);
 *   motor.setPower(power);
 * </pre>
 */
public class PIDController {

    // ── Coefficients ──────────────────────────────────────────────────────────
    private double kP, kI, kD, kF;

    // ── State ─────────────────────────────────────────────────────────────────
    private double target     = 0;
    private double integralSum = 0;
    private double lastError  = 0;
    private double lastMeasurement = 0;

    // ── Limits ────────────────────────────────────────────────────────────────
    private double integralLimit = Double.MAX_VALUE;
    private double outputMin     = -1.0;
    private double outputMax     =  1.0;
    private double tolerance     = 0.0;

    // ── Continuous input (e.g., heading) ──────────────────────────────────────
    private boolean continuous   = false;
    private double  inputMin     = -Math.PI;
    private double  inputMax     =  Math.PI;

    private final ElapsedTime timer = new ElapsedTime();

    public PIDController(double kP, double kI, double kD) {
        this(kP, kI, kD, 0);
    }

    public PIDController(double kP, double kI, double kD, double kF) {
        this.kP = kP; this.kI = kI; this.kD = kD; this.kF = kF;
        timer.reset();
    }

    /** Calculate PID output given current measurement */
    public double calculate(double measurement) {
        double dt = timer.seconds();
        timer.reset();
        if (dt <= 0 || dt > 0.5) dt = 0.02; // Guard against bad dt

        double error = target - measurement;

        // Continuous input correction (e.g., for heading wrap-around)
        if (continuous) {
            double range = inputMax - inputMin;
            while (error > range / 2)  error -= range;
            while (error < -range / 2) error += range;
        }

        // Integral with anti-windup
        integralSum += error * dt;
        integralSum = clamp(integralSum, -integralLimit, integralLimit);

        // Derivative on measurement (not error) to avoid derivative kick
        double derivative = -(measurement - lastMeasurement) / dt;
        lastMeasurement = measurement;
        lastError = error;

        double output = kP * error + kI * integralSum + kD * derivative + kF * target;
        return clamp(output, outputMin, outputMax);
    }

    /** Calculate with feedforward explicitly */
    public double calculate(double measurement, double feedforward) {
        double raw = calculate(measurement);
        return clamp(raw + feedforward, outputMin, outputMax);
    }

    /** Returns true if the error is within tolerance */
    public boolean atTarget() {
        return Math.abs(target - lastMeasurement) <= tolerance;
    }

    /** Reset integrator and derivative state (call when switching targets) */
    public void reset() {
        integralSum = 0;
        lastError = 0;
        timer.reset();
    }

    // ── Configuration setters ─────────────────────────────────────────────────

    public PIDController setTarget(double target) {
        if (this.target != target) reset();
        this.target = target;
        return this;
    }

    public PIDController setCoefficients(double kP, double kI, double kD) {
        this.kP = kP; this.kI = kI; this.kD = kD;
        return this;
    }

    public PIDController setOutputRange(double min, double max) {
        this.outputMin = min; this.outputMax = max;
        return this;
    }

    public PIDController setIntegralLimit(double limit) {
        this.integralLimit = Math.abs(limit);
        return this;
    }

    public PIDController setTolerance(double tolerance) {
        this.tolerance = tolerance;
        return this;
    }

    /** Enable continuous input for wrapping (e.g., heading from [-π, π]) */
    public PIDController enableContinuousInput(double min, double max) {
        this.continuous = true;
        this.inputMin = min;
        this.inputMax = max;
        return this;
    }

    // ── Getters ───────────────────────────────────────────────────────────────
    public double getTarget()       { return target; }
    public double getError()        { return target - lastMeasurement; }
    public double getIntegralSum()  { return integralSum; }
    public double getKP()           { return kP; }
    public double getKI()           { return kI; }
    public double getKD()           { return kD; }

    private static double clamp(double val, double min, double max) {
        return Math.max(min, Math.min(max, val));
    }
}
