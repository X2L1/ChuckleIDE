package org.firstinspires.ftc.teamcode.utilities;

import com.qualcomm.robotcore.hardware.CRServo;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.hardware.Servo;

/**
 * ChuckleLib – Hardware Initialization Helper
 *
 * Reduces boilerplate when configuring motors and servos.
 * Methods return the configured object for fluent usage.
 *
 * Usage:
 * <pre>
 *   DcMotorEx frontLeft = HardwareCreator.createMotor(
 *       hardwareMap, "frontLeft",
 *       DcMotorSimple.Direction.REVERSE,
 *       DcMotor.ZeroPowerBehavior.BRAKE,
 *       DcMotor.RunMode.RUN_WITHOUT_ENCODER
 *   );
 *
 *   Servo claw = HardwareCreator.createServo(
 *       hardwareMap, "claw",
 *       Servo.Direction.FORWARD,
 *       0.0, 1.0   // range
 *   );
 * </pre>
 */
public final class HardwareCreator {

    private HardwareCreator() {} // Utility class — no instances

    // ── Motors ─────────────────────────────────────────────────────────────────

    /**
     * Create and configure a DcMotorEx with common settings.
     *
     * @param hw         the HardwareMap
     * @param name       device name in robot configuration
     * @param direction  motor direction (FORWARD or REVERSE)
     * @param zeroPower  behavior when power is zero (BRAKE or FLOAT)
     * @param mode       run mode (RUN_WITHOUT_ENCODER, RUN_USING_ENCODER, etc.)
     * @return the configured motor
     */
    public static DcMotorEx createMotor(HardwareMap hw,
                                        String name,
                                        DcMotorSimple.Direction direction,
                                        DcMotor.ZeroPowerBehavior zeroPower,
                                        DcMotor.RunMode mode) {
        DcMotorEx motor = hw.get(DcMotorEx.class, name);
        motor.setDirection(direction);
        motor.setZeroPowerBehavior(zeroPower);
        motor.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        motor.setMode(mode);
        return motor;
    }

    /**
     * Create a DcMotorEx with default settings:
     * direction FORWARD, BRAKE on zero power, RUN_WITHOUT_ENCODER.
     */
    public static DcMotorEx createMotor(HardwareMap hw, String name) {
        return createMotor(hw, name,
                DcMotorSimple.Direction.FORWARD,
                DcMotor.ZeroPowerBehavior.BRAKE,
                DcMotor.RunMode.RUN_WITHOUT_ENCODER);
    }

    /**
     * Create a DcMotorEx configured for RUN_TO_POSITION with specified power.
     * After calling this, use motor.setTargetPosition() + motor.setPower() to move.
     */
    public static DcMotorEx createPositionMotor(HardwareMap hw,
                                                String name,
                                                DcMotorSimple.Direction direction) {
        DcMotorEx motor = hw.get(DcMotorEx.class, name);
        motor.setDirection(direction);
        motor.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        motor.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        motor.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
        return motor;
    }

    // ── Servos ────────────────────────────────────────────────────────────────

    /**
     * Create and configure a standard servo.
     *
     * @param hw        the HardwareMap
     * @param name      device name in robot configuration
     * @param direction servo direction (FORWARD or REVERSE)
     * @param minPos    minimum scaled range (typically 0.0)
     * @param maxPos    maximum scaled range (typically 1.0)
     * @return the configured servo
     */
    public static Servo createServo(HardwareMap hw,
                                    String name,
                                    Servo.Direction direction,
                                    double minPos,
                                    double maxPos) {
        Servo servo = hw.get(Servo.class, name);
        servo.setDirection(direction);
        servo.scaleRange(minPos, maxPos);
        return servo;
    }

    /**
     * Create a standard servo with default settings: FORWARD direction, full range.
     */
    public static Servo createServo(HardwareMap hw, String name) {
        return createServo(hw, name, Servo.Direction.FORWARD, 0.0, 1.0);
    }

    /**
     * Create and configure a continuous rotation servo.
     *
     * @param hw        the HardwareMap
     * @param name      device name in robot configuration
     * @param direction servo direction (FORWARD or REVERSE)
     * @return the configured CR servo
     */
    public static CRServo createCRServo(HardwareMap hw,
                                        String name,
                                        DcMotorSimple.Direction direction) {
        CRServo servo = hw.get(CRServo.class, name);
        servo.setDirection(direction);
        return servo;
    }

    /**
     * Create a continuous rotation servo with default FORWARD direction.
     */
    public static CRServo createCRServo(HardwareMap hw, String name) {
        return createCRServo(hw, name, DcMotorSimple.Direction.FORWARD);
    }
}
