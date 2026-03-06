package org.firstinspires.ftc.teamcode.odometry;

import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.robotcore.hardware.HardwareMap;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Pose2D;

/**
 * GoBilda Pinpoint Odometry Computer
 *
 * The Pinpoint is a standalone I2C odometry computer that connects to two
 * GoBilda odometry pods (or REV Through Bore encoders) and fuses them with
 * an internal IMU. It handles all pose math on-chip, returning ready-to-use
 * X, Y, and heading values.
 *
 * This is the modern standard for FTC odometry — no manual dead-wheel math
 * required.
 *
 * Wiring:
 *   - Connect the Pinpoint to an I2C port on Control/Expansion Hub
 *   - Left pod  → Port X on Pinpoint
 *   - Right pod → Port Y on Pinpoint
 *   (Pod assignment is configurable below)
 *
 * Configuration:
 *   - In your robot config, add an I2C device named "pinpoint" with
 *     type GoBildaPinpointDriver
 *
 * Pod Resolution (ticks per mm):
 *   - GoBilda Odometry Pods  : use GOBILDA_SWINGARM_POD or set 13.26291192
 *   - REV Through Bore Encoder: use REV_THROUGH_BORE or set 1.0 (already in mm)
 *
 * @see <a href="https://gm0.org/en/latest/docs/software/concepts/odometry.html">gm0 Odometry</a>
 */
public class PinpointOdometry {

    // ── Hardware ──────────────────────────────────────────────────────────────
    private GoBildaPinpointDriver pinpoint;

    // ── Pod Configuration – TUNE THESE FOR YOUR ROBOT ────────────────────────
    /**
     * X offset of the forward (left) pod from the robot center, in mm.
     * Positive = left of center.
     */
    public static double X_POD_OFFSET_MM = -84.0;

    /**
     * Y offset of the strafe (right) pod from the robot center, in mm.
     * Positive = forward of center.
     */
    public static double Y_POD_OFFSET_MM = -168.0;

    /**
     * Encoder direction for each pod.
     * Flip if your pods read in the wrong direction.
     */
    public static GoBildaPinpointDriver.EncoderDirection X_DIRECTION =
            GoBildaPinpointDriver.EncoderDirection.FORWARD;
    public static GoBildaPinpointDriver.EncoderDirection Y_DIRECTION =
            GoBildaPinpointDriver.EncoderDirection.FORWARD;

    // ── Pose state (cached from device) ──────────────────────────────────────
    private double xInches, yInches, headingRadians;

    public PinpointOdometry() {}

    /**
     * Initialize the Pinpoint odometry computer.
     *
     * @param hardwareMap  the active HardwareMap
     * @param deviceName   the name of the Pinpoint in robot configuration (e.g., "pinpoint")
     */
    public void initialize(HardwareMap hardwareMap, String deviceName) {
        pinpoint = hardwareMap.get(GoBildaPinpointDriver.class, deviceName);

        // Set pod offsets (mm)
        pinpoint.setOffsets(X_POD_OFFSET_MM, Y_POD_OFFSET_MM);

        // Set encoder resolution — choose one:
        // GoBilda Swingarm pods (default):
        pinpoint.setEncoderResolution(GoBildaPinpointDriver.GoBildaOdometryPods.goBILDA_SWINGARM_POD);
        // REV Through Bore:
        // pinpoint.setEncoderResolution(GoBildaPinpointDriver.GoBildaOdometryPods.goBILDA_4_BAR_POD);

        // Set encoder directions
        pinpoint.setEncoderDirections(X_DIRECTION, Y_DIRECTION);

        // Recalibrate the IMU (robot must be stationary)
        pinpoint.recalibrateIMU();

        // Reset position to origin
        pinpoint.resetPosAndIMU();
    }

    /**
     * Initialize with a known starting pose.
     */
    public void initialize(HardwareMap hardwareMap, String deviceName,
                           double startXInches, double startYInches, double startHeadingDeg) {
        initialize(hardwareMap, deviceName);
        pinpoint.setPosition(new Pose2D(
                DistanceUnit.INCH, startXInches, startYInches,
                AngleUnit.DEGREES, startHeadingDeg
        ));
    }

    /**
     * Read the latest pose from the Pinpoint.
     * Must be called every loop iteration.
     */
    public void update() {
        pinpoint.update();
        Pose2D pose = pinpoint.getPosition();

        xInches        = pose.getX(DistanceUnit.INCH);
        yInches        = pose.getY(DistanceUnit.INCH);
        headingRadians = pose.getHeading(AngleUnit.RADIANS);
    }

    /**
     * Set the current pose (e.g., after AprilTag relocalization).
     */
    public void setPose(double xInches, double yInches, double headingDeg) {
        pinpoint.setPosition(new Pose2D(
                DistanceUnit.INCH, xInches, yInches,
                AngleUnit.DEGREES, headingDeg
        ));
    }

    /** Reset heading to zero (robot must be stationary). */
    public void recalibrateIMU() {
        pinpoint.recalibrateIMU();
    }

    /** Full reset — position and IMU (robot must be stationary). */
    public void resetPosAndIMU() {
        pinpoint.resetPosAndIMU();
    }

    /**
     * Print useful debug info to telemetry.
     */
    public void telemetryDebug(Telemetry telemetry) {
        Pose2D pos = pinpoint.getPosition();
        Pose2D vel = pinpoint.getVelocity();
        telemetry.addData("Pinpoint X (in)",       "%.2f", pos.getX(DistanceUnit.INCH));
        telemetry.addData("Pinpoint Y (in)",       "%.2f", pos.getY(DistanceUnit.INCH));
        telemetry.addData("Pinpoint Heading (deg)","%.2f", pos.getHeading(AngleUnit.DEGREES));
        telemetry.addData("Velocity X (in/s)",     "%.2f", vel.getX(DistanceUnit.INCH));
        telemetry.addData("Velocity Y (in/s)",     "%.2f", vel.getY(DistanceUnit.INCH));
        telemetry.addData("Device Status",         pinpoint.getDeviceStatus());
    }

    // ── Getters ──────────────────────────────────────────────────────────────
    public double getX()              { return xInches; }
    public double getY()              { return yInches; }
    public double getHeading()        { return headingRadians; }
    public double getHeadingDegrees() { return Math.toDegrees(headingRadians); }

    /** Get the raw Pose2D from the device (for frameworks that consume it). */
    public Pose2D getPose() {
        return pinpoint.getPosition();
    }

    /** Get velocity as a Pose2D. */
    public Pose2D getVelocity() {
        return pinpoint.getVelocity();
    }

    /** Get the underlying driver for advanced configuration. */
    public GoBildaPinpointDriver getDriver() {
        return pinpoint;
    }
}
