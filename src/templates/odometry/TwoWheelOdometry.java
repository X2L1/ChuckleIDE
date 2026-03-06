package org.firstinspires.ftc.teamcode.odometry;

import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.hardware.IMU;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;

/**
 * Two Dead-Wheel + IMU Odometry
 *
 * Uses two tracking wheels (one parallel, one perpendicular)
 * plus the built-in REV Hub IMU for heading.
 *
 * Simpler than three-wheel odometry but accurate heading from IMU.
 */
public class TwoWheelOdometry {

    // ── Configuration – TUNE THESE ────────────────────────────────────────────
    public static double TICKS_PER_REV  = 8192.0;
    public static double WHEEL_RADIUS   = 0.944882; // inches
    public static double TICKS_PER_INCH = TICKS_PER_REV / (2 * Math.PI * WHEEL_RADIUS);

    /** X offset of parallel pod from robot center (positive = forward) */
    public static double PARALLEL_X_OFFSET = 0.0;
    /** Y offset of parallel pod from robot center (positive = left) */
    public static double PARALLEL_Y_OFFSET = 3.0;

    /** X offset of perpendicular pod from robot center */
    public static double PERP_X_OFFSET = -4.5;
    /** Y offset of perpendicular pod from robot center */
    public static double PERP_Y_OFFSET = 0.0;

    // ── Hardware ──────────────────────────────────────────────────────────────
    private DcMotorEx parallelEncoder, perpEncoder;
    private IMU imu;

    // ── State ─────────────────────────────────────────────────────────────────
    private double x, y, heading;
    private int lastParallel, lastPerp;
    private double lastHeading;

    public TwoWheelOdometry() {}

    public void initialize(HardwareMap hardwareMap,
                           String parallelName, String perpName) {
        parallelEncoder = hardwareMap.get(DcMotorEx.class, parallelName);
        perpEncoder     = hardwareMap.get(DcMotorEx.class, perpName);

        imu = hardwareMap.get(IMU.class, "imu");
        imu.initialize(new IMU.Parameters(
                new RevHubOrientationOnRobot(
                        RevHubOrientationOnRobot.LogoFacingDirection.UP,
                        RevHubOrientationOnRobot.UsbFacingDirection.FORWARD
                )
        ));
        imu.resetYaw();

        resetEncoders();
        x = 0; y = 0; heading = 0; lastHeading = 0;
    }

    public void initialize(HardwareMap hardwareMap,
                           String parallelName, String perpName,
                           double startX, double startY, double startHeading) {
        initialize(hardwareMap, parallelName, perpName);
        x = startX; y = startY;
        heading = startHeading;
        lastHeading = startHeading;
    }

    public void update() {
        // Read IMU heading
        YawPitchRollAngles angles = imu.getRobotYawPitchRollAngles();
        double currentHeading = angles.getYaw(AngleUnit.RADIANS);

        int currentParallel = parallelEncoder.getCurrentPosition();
        int currentPerp     = perpEncoder.getCurrentPosition();

        int dParallel = currentParallel - lastParallel;
        int dPerp     = currentPerp     - lastPerp;

        lastParallel = currentParallel;
        lastPerp     = currentPerp;

        double dHeading = currentHeading - lastHeading;
        lastHeading = currentHeading;
        heading = currentHeading;

        double dParallelIn = dParallel / TICKS_PER_INCH;
        double dPerpIn     = dPerp     / TICKS_PER_INCH;

        // Correct for arc (subtract rotational component)
        double dForward = dParallelIn - PARALLEL_Y_OFFSET * dHeading;
        double dStrafe  = dPerpIn     - PERP_X_OFFSET     * dHeading;

        double avgHeading = heading - dHeading / 2.0;

        x += dForward * Math.cos(avgHeading) - dStrafe * Math.sin(avgHeading);
        y += dForward * Math.sin(avgHeading) + dStrafe * Math.cos(avgHeading);
    }

    public void resetEncoders() {
        parallelEncoder.setMode(com.qualcomm.robotcore.hardware.DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        perpEncoder.setMode(com.qualcomm.robotcore.hardware.DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        parallelEncoder.setMode(com.qualcomm.robotcore.hardware.DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        perpEncoder.setMode(com.qualcomm.robotcore.hardware.DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        lastParallel = lastPerp = 0;
    }

    public void setPose(double x, double y) {
        this.x = x; this.y = y;
    }

    public double getX()              { return x; }
    public double getY()              { return y; }
    public double getHeading()        { return heading; }
    public double getHeadingDegrees() { return Math.toDegrees(heading); }
}
