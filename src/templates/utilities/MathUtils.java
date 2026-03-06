package org.firstinspires.ftc.teamcode.utilities;

/**
 * ChuckleLib – Common Math Utilities for FTC
 *
 * Static helper methods for angles, clamping, interpolation, and other
 * operations that come up constantly in FTC code.
 *
 * Usage:
 * <pre>
 *   double wrapped = MathUtils.normalizeAngle(rawHeading);
 *   double power   = MathUtils.clamp(pidOutput, -1.0, 1.0);
 *   double smooth  = MathUtils.lerp(start, end, t);
 * </pre>
 */
public final class MathUtils {

    private MathUtils() {} // Utility class — no instances

    // ── Angle utilities ───────────────────────────────────────────────────────

    /**
     * Normalize an angle to the range [-180, 180] degrees.
     */
    public static double normalizeAngleDeg(double degrees) {
        double result = degrees % 360.0;
        if (result > 180.0)  result -= 360.0;
        if (result < -180.0) result += 360.0;
        return result;
    }

    /**
     * Normalize an angle to the range [-π, π] radians.
     */
    public static double normalizeAngleRad(double radians) {
        double result = radians % (2.0 * Math.PI);
        if (result > Math.PI)  result -= 2.0 * Math.PI;
        if (result < -Math.PI) result += 2.0 * Math.PI;
        return result;
    }

    /**
     * Shortest signed angle difference from {@code from} to {@code to}, in degrees.
     * Result is in [-180, 180].
     */
    public static double angleDiffDeg(double from, double to) {
        return normalizeAngleDeg(to - from);
    }

    /**
     * Shortest signed angle difference from {@code from} to {@code to}, in radians.
     * Result is in [-π, π].
     */
    public static double angleDiffRad(double from, double to) {
        return normalizeAngleRad(to - from);
    }

    // ── Clamping ──────────────────────────────────────────────────────────────

    /**
     * Clamp a value to the range [min, max].
     */
    public static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Clamp an integer value to the range [min, max].
     */
    public static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    // ── Interpolation ─────────────────────────────────────────────────────────

    /**
     * Linear interpolation between {@code a} and {@code b}.
     *
     * @param a start value (returned when t = 0)
     * @param b end value   (returned when t = 1)
     * @param t interpolation factor (typically 0–1, but not clamped)
     */
    public static double lerp(double a, double b, double t) {
        return a + (b - a) * t;
    }

    /**
     * Inverse lerp — returns the t value that produces {@code value}
     * when interpolating between {@code a} and {@code b}.
     */
    public static double inverseLerp(double a, double b, double value) {
        if (Math.abs(b - a) < 1e-9) return 0.0;
        return (value - a) / (b - a);
    }

    // ── Deadzone & scaling ────────────────────────────────────────────────────

    /**
     * Apply a deadzone to a value. Returns 0 if |value| &lt; deadzone,
     * otherwise returns the value scaled so the output range is continuous.
     */
    public static double deadzone(double value, double deadzone) {
        if (Math.abs(value) < deadzone) return 0.0;
        double sign = Math.signum(value);
        return sign * (Math.abs(value) - deadzone) / (1.0 - deadzone);
    }

    /**
     * Scale input quadratically for finer low-speed control.
     * Preserves sign: squareInput(-0.5) = -0.25.
     */
    public static double squareInput(double value) {
        return Math.copySign(value * value, value);
    }

    /**
     * Scale input cubically for even finer low-speed control.
     * Preserves sign naturally since x³ is an odd function.
     */
    public static double cubeInput(double value) {
        return value * value * value;
    }

    // ── Distance ──────────────────────────────────────────────────────────────

    /**
     * Euclidean distance between two 2D points.
     */
    public static double distance(double x1, double y1, double x2, double y2) {
        double dx = x2 - x1;
        double dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // ── Range mapping ─────────────────────────────────────────────────────────

    /**
     * Re-map a value from one range to another.
     * Equivalent to Arduino's map() function.
     */
    public static double mapRange(double value,
                                  double inMin, double inMax,
                                  double outMin, double outMax) {
        return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
    }

    // ── Comparison ────────────────────────────────────────────────────────────

    /**
     * Returns true if two doubles are within {@code epsilon} of each other.
     */
    public static boolean approxEqual(double a, double b, double epsilon) {
        return Math.abs(a - b) < epsilon;
    }
}
