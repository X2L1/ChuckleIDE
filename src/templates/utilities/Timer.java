package org.firstinspires.ftc.teamcode.utilities;

import com.qualcomm.robotcore.util.ElapsedTime;

/**
 * ChuckleLib – Timer Utility
 *
 * A lightweight timer for common FTC timing patterns: debouncing actions,
 * enforcing cooldowns, timeout guards, and periodic events.
 *
 * Built on top of ElapsedTime for accuracy.
 *
 * Usage:
 * <pre>
 *   Timer cooldown = new Timer();
 *
 *   // In your loop:
 *   if (gamepad1.a && cooldown.hasElapsed(0.3)) {
 *       doAction();
 *       cooldown.reset();
 *   }
 *
 *   // Timeout guard:
 *   Timer timeout = Timer.startNew();
 *   while (!isDone() && !timeout.hasElapsed(3.0)) {
 *       // keep trying for up to 3 seconds
 *   }
 * </pre>
 */
public class Timer {

    private final ElapsedTime elapsed = new ElapsedTime();

    /** Create a timer that starts immediately. */
    public Timer() {
        elapsed.reset();
    }

    /** Static factory — creates and starts a new timer. */
    public static Timer startNew() {
        return new Timer();
    }

    /** Reset the timer to zero. */
    public void reset() {
        elapsed.reset();
    }

    /** Seconds since last reset. */
    public double seconds() {
        return elapsed.seconds();
    }

    /** Milliseconds since last reset. */
    public double milliseconds() {
        return elapsed.milliseconds();
    }

    /** True if at least {@code seconds} have elapsed since last reset. */
    public boolean hasElapsed(double seconds) {
        return elapsed.seconds() >= seconds;
    }

    /**
     * Returns true at most once per {@code intervalSeconds}.
     * Automatically resets when the interval passes.
     * Useful for periodic telemetry or periodic actions.
     */
    public boolean intervalElapsed(double intervalSeconds) {
        if (elapsed.seconds() >= intervalSeconds) {
            elapsed.reset();
            return true;
        }
        return false;
    }

    /**
     * Returns the remaining time before a deadline, or 0 if past the deadline.
     *
     * @param deadlineSeconds total time allowed
     * @return seconds remaining (≥ 0)
     */
    public double remaining(double deadlineSeconds) {
        double left = deadlineSeconds - elapsed.seconds();
        return Math.max(0, left);
    }

    /** True if the deadline has passed. */
    public boolean isExpired(double deadlineSeconds) {
        return elapsed.seconds() >= deadlineSeconds;
    }

    @Override
    public String toString() {
        return String.format("Timer[%.3fs]", elapsed.seconds());
    }
}
