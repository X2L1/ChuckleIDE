package org.firstinspires.ftc.teamcode.autonomous;

import com.pedropathing.follower.Follower;
import com.pedropathing.localization.Pose;
import com.pedropathing.pathgen.BezierCurve;
import com.pedropathing.pathgen.BezierLine;
import com.pedropathing.pathgen.Path;
import com.pedropathing.pathgen.PathChain;
import com.pedropathing.pathgen.Point;
import com.pedropathing.util.Constants;
import com.pedropathing.util.Timer;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

/**
 * PedroPathing Autonomous Template
 *
 * Uses PedroPathing for smooth, curve-following path execution.
 * Field coordinates: X = forward, Y = left, heading = radians CCW from forward.
 *
 * @see <a href="https://pedropathing.com">PedroPathing Documentation</a>
 */
@Autonomous(name = "PedroPathing Autonomous", group = "Autonomous")
public class PedroPathingAutonomous extends LinearOpMode {

    // ── PedroPathing ────────────────────────────────────────────────────────────
    private Follower follower;
    private Timer pathTimer;
    private int pathState;

    // ── Starting Pose (field-centric, inches) ────────────────────────────────────
    private final Pose startPose     = new Pose(9.0, 63.0, Math.toRadians(0));

    // ── Key Waypoints ────────────────────────────────────────────────────────────
    private final Pose scorePose     = new Pose(36.0, 63.0, Math.toRadians(0));
    private final Pose pickupPose    = new Pose(48.0, 24.0, Math.toRadians(270));
    private final Pose parkPose      = new Pose(60.0, 12.0, Math.toRadians(0));

    // ── Paths ────────────────────────────────────────────────────────────────────
    private Path driveToScore, driveToPickup, driveToPark;
    private PathChain scoreAndPickup;

    @Override
    public void runOpMode() throws InterruptedException {
        // Initialize PedroPathing follower
        Constants.setConstants(FConstants.class, LConstants.class);
        follower = new Follower(hardwareMap);
        follower.setStartingPose(startPose);

        pathTimer = new Timer();
        pathState = 0;

        buildPaths();

        // Initialize your robot hardware here
        // initRobot();

        telemetry.addData("Status", "PedroPathing Initialized");
        telemetry.addData("Start Pose", "X: %.1f, Y: %.1f, H: %.1f°",
                startPose.getX(), startPose.getY(), Math.toDegrees(startPose.getHeading()));
        telemetry.update();

        waitForStart();
        pathTimer.resetTimer();

        // Start following the first path
        follower.followPath(driveToScore, true);
        setPathState(1);

        while (opModeIsActive()) {
            follower.update();
            autonomousPathUpdate();

            telemetry.addData("Path State", pathState);
            telemetry.addData("Following Path", follower.isBusy());
            telemetry.addData("Robot X", follower.getPose().getX());
            telemetry.addData("Robot Y", follower.getPose().getY());
            telemetry.addData("Robot Heading", Math.toDegrees(follower.getPose().getHeading()));
            telemetry.addData("Path Timer", pathTimer.getElapsedTimeSeconds());
            telemetry.update();
        }
    }

    /** Build all paths before the match starts */
    private void buildPaths() {
        // Simple straight line to score position
        driveToScore = new Path(new BezierLine(
                new Point(startPose),
                new Point(scorePose)
        ));
        driveToScore.setLinearHeadingInterpolation(startPose.getHeading(), scorePose.getHeading());
        driveToScore.setZeroPowerAccelerationMultiplier(4);

        // Curve from score to pickup
        driveToPickup = new Path(new BezierCurve(
                new Point(scorePose),
                new Point(40.0, 48.0, Point.CARTESIAN),  // control point
                new Point(pickupPose)
        ));
        driveToPickup.setLinearHeadingInterpolation(scorePose.getHeading(), pickupPose.getHeading());

        // Straight line to park
        driveToPark = new Path(new BezierLine(
                new Point(pickupPose),
                new Point(parkPose)
        ));
        driveToPark.setLinearHeadingInterpolation(pickupPose.getHeading(), parkPose.getHeading());

        // Chain paths together for smooth execution
        scoreAndPickup = follower.pathBuilder()
                .addPath(driveToScore)
                .setLinearHeadingInterpolation(startPose.getHeading(), scorePose.getHeading())
                .addPath(driveToPickup)
                .setLinearHeadingInterpolation(scorePose.getHeading(), pickupPose.getHeading())
                .build();
    }

    /**
     * State machine to advance through path states.
     * Each state waits for the path to finish (or a timeout), then
     * performs an action and moves to the next state.
     */
    private void autonomousPathUpdate() {
        switch (pathState) {
            case 1: // Driving to score position
                if (!follower.isBusy()) {
                    // Robot has reached score position
                    // scoreGamePiece(); // perform scoring action
                    setPathState(2);
                    follower.followPath(driveToPickup, true);
                }
                break;

            case 2: // Driving to pickup position
                if (!follower.isBusy()) {
                    // Robot has reached pickup position
                    // pickupGamePiece(); // perform pickup action
                    setPathState(3);
                    follower.followPath(driveToPark, true);
                }
                break;

            case 3: // Driving to park position
                if (!follower.isBusy()) {
                    // Robot has parked
                    setPathState(4);
                }
                break;

            case 4: // Done
                telemetry.addData("Status", "Autonomous Complete!");
                break;
        }
    }

    private void setPathState(int state) {
        pathState = state;
        pathTimer.resetTimer();
    }

    /**
     * PedroPathing follower constants.
     * Copy from the PedroPathing tuning OpModes and adjust for your robot.
     */
    public static class FConstants {
        // Motor powers and PID coefficients – tune with PedroPathing tuners
        public static double xMovement = 81.34056;
        public static double yMovement = 65.43028;
        public static double forwardZeroPowerAcceleration = -34.02962;
        public static double lateralZeroPowerAcceleration = -78.31929;
        public static double translationalPIDFCoefficients_p = 0.1;
        public static double translationalPIDFCoefficients_i = 0;
        public static double translationalPIDFCoefficients_d = 0;
        public static double translationalPIDFCoefficients_f = 0;
        public static double headingPIDFCoefficients_p = 1.0;
        public static double headingPIDFCoefficients_i = 0;
        public static double headingPIDFCoefficients_d = 0;
        public static double headingPIDFCoefficients_f = 0;
        public static double drivePIDFCoefficients_p = 0.023;
        public static double drivePIDFCoefficients_i = 0;
        public static double drivePIDFCoefficients_d = 0.00001;
        public static double drivePIDFCoefficients_f = 0.005;

        // Secondary PIDF coefficients – used when the robot is close to the target
        // Set useSecondary*PID to true and tune the switch thresholds
        public static boolean useSecondaryTranslationalPID = false;
        public static double secondaryTranslationalPIDFCoefficients_p = 0.02;
        public static double secondaryTranslationalPIDFCoefficients_i = 0;
        public static double secondaryTranslationalPIDFCoefficients_d = 0;
        public static double secondaryTranslationalPIDFCoefficients_f = 0;
        public static double secondaryTranslationalPIDFSwitch = 3;  // inches

        public static boolean useSecondaryHeadingPID = false;
        public static double secondaryHeadingPIDFCoefficients_p = 0.5;
        public static double secondaryHeadingPIDFCoefficients_i = 0;
        public static double secondaryHeadingPIDFCoefficients_d = 0;
        public static double secondaryHeadingPIDFCoefficients_f = 0;
        public static double secondaryHeadingPIDFSwitch = 5;  // degrees

        public static boolean useSecondaryDrivePID = false;
        public static double secondaryDrivePIDFCoefficients_p = 0.01;
        public static double secondaryDrivePIDFCoefficients_i = 0;
        public static double secondaryDrivePIDFCoefficients_d = 0;
        public static double secondaryDrivePIDFCoefficients_f = 0;
        public static double secondaryDrivePIDFSwitch = 3;  // inches
    }

    /**
     * Localization constants for GoBilda Pinpoint odometry computer.
     * Adjust pod offsets and encoder settings for your robot's physical layout.
     */
    public static class LConstants {
        // Pinpoint device name in robot configuration
        public static String hardwareMapName = "pinpoint";

        // Pod offsets from robot center (mm) – MEASURE FOR YOUR ROBOT
        // These are example values; adjust based on your physical pod placement.
        public static double xOffset = -84.0;
        public static double yOffset = -168.0;

        // Encoder resolution – use a preset or set a custom value
        // GoBilda Swingarm Pod: GoBildaPinpointDriver.GoBildaOdometryPods.goBILDA_SWINGARM_POD
        // GoBilda 4-Bar Pod:    GoBildaPinpointDriver.GoBildaOdometryPods.goBILDA_4_BAR_POD
        public static boolean useCustomEncoderResolution = false;
        public static double customEncoderResolution = 13.26291192;  // ticks per mm

        // Encoder directions – flip if a pod reads in the wrong direction
        // GoBildaPinpointDriver.EncoderDirection.FORWARD or REVERSED
        public static boolean forwardEncoderReversed = false;
        public static boolean strafeEncoderReversed = false;

        // Yaw scalar – set to true and adjust if heading drifts
        public static boolean useYawScalar = false;
        public static double yawScalar = 1.0;
    }
}
