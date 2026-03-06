package org.firstinspires.ftc.teamcode.odometry;

import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.HardwareMap;

/**
 * Three Dead-Wheel Odometry (Tracking Wheels)
 *
 * Configuration:
 *   - Left pod:   parallel encoder (forward/backward, left side)
 *   - Right pod:  parallel encoder (forward/backward, right side)
 *   - Center pod: perpendicular encoder (strafe, front/back)
 *
 * Coordinate system: X = forward, Y = left, heading = radians CCW
 *
 * Pod physical constants must be tuned for your robot.
 */
public class ThreeWheelOdometry {

    // ── Configuration – TUNE THESE FOR YOUR ROBOT ─────────────────────────────
    public static double TICKS_PER_REV  = 8192.0;   // GoBilda Odometry Pod
    public static double WHEEL_RADIUS   = 0.944882;  // inches (24 mm radius)
    public static double TICKS_PER_INCH = TICKS_PER_REV / (2 * Math.PI * WHEEL_RADIUS);

    /** Y offset of left parallel pod from robot center (positive = left) */
    public static double LEFT_Y_OFFSET   =  1.75;
    /** Y offset of right parallel pod from robot center (positive = left) */
    public static double RIGHT_Y_OFFSET  = -1.75;
    /** X offset of center perpendicular pod from robot center (positive = forward) */
    public static double CENTER_X_OFFSET = -4.0;

    // ── Encoders ──────────────────────────────────────────────────────────────
    private DcMotorEx leftEncoder, rightEncoder, centerEncoder;

    // ── Pose state ────────────────────────────────────────────────────────────
    private double x, y, heading;
    private int lastLeft, lastRight, lastCenter;

    public ThreeWheelOdometry() {}

    public void initialize(HardwareMap hardwareMap,
                           String leftName, String rightName, String centerName) {
        leftEncoder   = hardwareMap.get(DcMotorEx.class, leftName);
        rightEncoder  = hardwareMap.get(DcMotorEx.class, rightName);
        centerEncoder = hardwareMap.get(DcMotorEx.class, centerName);

        resetEncoders();
        x = 0; y = 0; heading = 0;
    }

    public void initialize(HardwareMap hardwareMap,
                           String leftName, String rightName, String centerName,
                           double startX, double startY, double startHeading) {
        initialize(hardwareMap, leftName, rightName, centerName);
        x = startX; y = startY; heading = startHeading;
    }

    /**
     * Update the robot's pose estimate.
     * Must be called every loop iteration.
     */
    public void update() {
        int currentLeft   = leftEncoder.getCurrentPosition();
        int currentRight  = rightEncoder.getCurrentPosition();
        int currentCenter = centerEncoder.getCurrentPosition();

        int dLeft   = currentLeft   - lastLeft;
        int dRight  = currentRight  - lastRight;
        int dCenter = currentCenter - lastCenter;

        lastLeft   = currentLeft;
        lastRight  = currentRight;
        lastCenter = currentCenter;

        double dLeftIn   = dLeft   / TICKS_PER_INCH;
        double dRightIn  = dRight  / TICKS_PER_INCH;
        double dCenterIn = dCenter / TICKS_PER_INCH;

        // Change in heading from the two parallel pods
        double dHeading = (dRightIn - dLeftIn) / (LEFT_Y_OFFSET - RIGHT_Y_OFFSET);

        // Forward arc component
        double dForward = (dLeftIn + dRightIn) / 2.0;

        // Strafe component corrected for rotation
        double dStrafe = dCenterIn - CENTER_X_OFFSET * dHeading;

        // Rotate delta into global frame
        double avgHeading = heading + dHeading / 2.0;

        x += dForward * Math.cos(avgHeading) - dStrafe * Math.sin(avgHeading);
        y += dForward * Math.sin(avgHeading) + dStrafe * Math.cos(avgHeading);
        heading += dHeading;

        // Normalize heading to [-π, π]
        heading = normalizeAngle(heading);
    }

    /** Reset all encoder counts and pose */
    public void resetEncoders() {
        leftEncoder.setMode(com.qualcomm.robotcore.hardware.DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        rightEncoder.setMode(com.qualcomm.robotcore.hardware.DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        centerEncoder.setMode(com.qualcomm.robotcore.hardware.DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        leftEncoder.setMode(com.qualcomm.robotcore.hardware.DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        rightEncoder.setMode(com.qualcomm.robotcore.hardware.DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        centerEncoder.setMode(com.qualcomm.robotcore.hardware.DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        lastLeft = lastRight = lastCenter = 0;
    }

    /** Set a new pose (e.g., after relocalization with AprilTags) */
    public void setPose(double x, double y, double heading) {
        this.x = x; this.y = y; this.heading = heading;
    }

    // ── Getters ───────────────────────────────────────────────────────────────
    public double getX()              { return x; }
    public double getY()              { return y; }
    public double getHeading()        { return heading; }
    public double getHeadingDegrees() { return Math.toDegrees(heading); }

    private double normalizeAngle(double angle) {
        while (angle > Math.PI)  angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }
}
