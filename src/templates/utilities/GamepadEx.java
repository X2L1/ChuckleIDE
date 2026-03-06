package org.firstinspires.ftc.teamcode.utilities;

import com.qualcomm.robotcore.hardware.Gamepad;

/**
 * ChuckleLib – Enhanced Gamepad Wrapper
 *
 * Provides rising-edge and falling-edge detection for all gamepad buttons,
 * making it easy to trigger actions on a single press rather than every loop.
 *
 * Usage:
 * <pre>
 *   GamepadEx gp1 = new GamepadEx(gamepad1);
 *
 *   // In your loop:
 *   gp1.update();
 *
 *   if (gp1.wasJustPressed(Button.A)) {
 *       // Runs once per press
 *   }
 *
 *   if (gp1.wasJustReleased(Button.BUMPER_RIGHT)) {
 *       // Runs once when released
 *   }
 *
 *   // Deadzone-applied sticks
 *   double drive = gp1.getLeftStickY();  // already inverted & deadzone-applied
 * </pre>
 */
public class GamepadEx {

    /** All trackable digital buttons */
    public enum Button {
        A, B, X, Y,
        DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT,
        BUMPER_LEFT, BUMPER_RIGHT,
        STICK_BUTTON_LEFT, STICK_BUTTON_RIGHT,
        BACK, START, GUIDE
    }

    // ── State ─────────────────────────────────────────────────────────────────
    private final Gamepad gamepad;
    private final boolean[] currentState  = new boolean[Button.values().length];
    private final boolean[] previousState = new boolean[Button.values().length];

    /** Deadzone applied to stick axes */
    public static double STICK_DEADZONE = 0.05;

    /** Deadzone applied to triggers */
    public static double TRIGGER_DEADZONE = 0.05;

    public GamepadEx(Gamepad gamepad) {
        this.gamepad = gamepad;
    }

    // ── Core ──────────────────────────────────────────────────────────────────

    /**
     * Read the current gamepad state. Must be called once per loop iteration,
     * before any edge-detection queries.
     */
    public void update() {
        System.arraycopy(currentState, 0, previousState, 0, currentState.length);

        currentState[Button.A.ordinal()]                  = gamepad.a;
        currentState[Button.B.ordinal()]                  = gamepad.b;
        currentState[Button.X.ordinal()]                  = gamepad.x;
        currentState[Button.Y.ordinal()]                  = gamepad.y;
        currentState[Button.DPAD_UP.ordinal()]            = gamepad.dpad_up;
        currentState[Button.DPAD_DOWN.ordinal()]          = gamepad.dpad_down;
        currentState[Button.DPAD_LEFT.ordinal()]          = gamepad.dpad_left;
        currentState[Button.DPAD_RIGHT.ordinal()]         = gamepad.dpad_right;
        currentState[Button.BUMPER_LEFT.ordinal()]        = gamepad.left_bumper;
        currentState[Button.BUMPER_RIGHT.ordinal()]       = gamepad.right_bumper;
        currentState[Button.STICK_BUTTON_LEFT.ordinal()]  = gamepad.left_stick_button;
        currentState[Button.STICK_BUTTON_RIGHT.ordinal()] = gamepad.right_stick_button;
        currentState[Button.BACK.ordinal()]               = gamepad.back;
        currentState[Button.START.ordinal()]              = gamepad.start;
        currentState[Button.GUIDE.ordinal()]              = gamepad.guide;
    }

    /** True for one loop when the button transitions from released → pressed */
    public boolean wasJustPressed(Button button) {
        int i = button.ordinal();
        return currentState[i] && !previousState[i];
    }

    /** True for one loop when the button transitions from pressed → released */
    public boolean wasJustReleased(Button button) {
        int i = button.ordinal();
        return !currentState[i] && previousState[i];
    }

    /** True while the button is held down */
    public boolean isPressed(Button button) {
        return currentState[button.ordinal()];
    }

    // ── Analog axes (deadzone-applied) ────────────────────────────────────────

    /** Left stick X (positive = right), deadzone applied */
    public double getLeftStickX() {
        return applyDeadzone(gamepad.left_stick_x, STICK_DEADZONE);
    }

    /** Left stick Y (positive = up, already inverted), deadzone applied */
    public double getLeftStickY() {
        return applyDeadzone(-gamepad.left_stick_y, STICK_DEADZONE);
    }

    /** Right stick X (positive = right), deadzone applied */
    public double getRightStickX() {
        return applyDeadzone(gamepad.right_stick_x, STICK_DEADZONE);
    }

    /** Right stick Y (positive = up, already inverted), deadzone applied */
    public double getRightStickY() {
        return applyDeadzone(-gamepad.right_stick_y, STICK_DEADZONE);
    }

    /** Left trigger (0.0 – 1.0), deadzone applied */
    public double getLeftTrigger() {
        return applyDeadzone(gamepad.left_trigger, TRIGGER_DEADZONE);
    }

    /** Right trigger (0.0 – 1.0), deadzone applied */
    public double getRightTrigger() {
        return applyDeadzone(gamepad.right_trigger, TRIGGER_DEADZONE);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static double applyDeadzone(double value, double deadzone) {
        if (Math.abs(value) < deadzone) return 0.0;
        double sign = Math.signum(value);
        return sign * (Math.abs(value) - deadzone) / (1.0 - deadzone);
    }
}
