package org.firstinspires.ftc.teamcode.autonomous;

import com.pedropathing.follower.Follower;
import com.pedropathing.localization.Pose;
import com.pedropathing.pathgen.BezierLine;
import com.pedropathing.pathgen.Path;
import com.pedropathing.pathgen.Point;
import com.pedropathing.util.Constants;
import com.pedropathing.util.Timer;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

/**
 * PedroPathing Tuning OpMode
 *
 * Use this OpMode to tune your PedroPathing constants.
 * It drives the robot forward, backward, strafe left, strafe right,
 * and turns in place to help you verify and tune:
 *   - xMovement / yMovement
 *   - forwardZeroPowerAcceleration / lateralZeroPowerAcceleration
 *   - Translational, heading, and drive PIDF coefficients (primary and secondary)
 *   - GoBilda Pinpoint localizer pod offsets and encoder settings
 *
 * Steps:
 *   1. Set your FConstants and LConstants classes before running.
 *   2. Run this OpMode and observe telemetry.
 *   3. Adjust constants in FConstants/LConstants based on results.
 *   4. Repeat until the robot drives accurately.
 *
 * @see <a href="https://pedropathing.com/commonIssues/tuning.html">PedroPathing Tuning Guide</a>
 */
@Autonomous(name = "Pedro Tuning OpMode", group = "Tuning")
public class PedroTuningOpMode extends LinearOpMode {

    private Follower follower;
    private Timer timer;

    // ── Tuning distances (inches) and angles (degrees) ──
    private static final double FORWARD_DISTANCE  = 48.0;
    private static final double STRAFE_DISTANCE   = 24.0;
    private static final double TURN_ANGLE        = 90.0;
    private static final double TURN_PATH_EPSILON = 0.01;

    // ── Starting pose ──
    private final Pose startPose = new Pose(0, 0, Math.toRadians(0));

    @Override
    public void runOpMode() throws InterruptedException {
        // Initialize follower with your constants.
        // Uncomment the line below and ensure FConstants and LConstants classes exist in your project.
        Constants.setConstants(FConstants.class, LConstants.class);
        follower = new Follower(hardwareMap);
        follower.setStartingPose(startPose);
        timer = new Timer();

        telemetry.addData("Status", "Pedro Tuning OpMode Ready");
        telemetry.addData("Instructions", "Press START to begin tuning sequence");
        telemetry.addData("Forward Distance", FORWARD_DISTANCE + " in");
        telemetry.addData("Strafe Distance", STRAFE_DISTANCE + " in");
        telemetry.addData("Turn Angle", TURN_ANGLE + "°");
        telemetry.update();

        waitForStart();
        timer.resetTimer();

        // ── Step 1: Drive Forward ──
        telemetry.addData("Step", "1/5 - Driving FORWARD " + FORWARD_DISTANCE + " inches");
        telemetry.update();

        Path forwardPath = new Path(new BezierLine(
                new Point(startPose),
                new Point(startPose.getX() + FORWARD_DISTANCE, startPose.getY(), Point.CARTESIAN)
        ));
        forwardPath.setConstantHeadingInterpolation(startPose.getHeading());

        follower.followPath(forwardPath, true);
        while (opModeIsActive() && follower.isBusy()) {
            follower.update();
            updateTelemetry("Forward");
        }
        logResult("Forward", FORWARD_DISTANCE);
        sleep(1000);

        // ── Step 2: Drive Backward (return to start) ──
        if (!opModeIsActive()) return;
        telemetry.addData("Step", "2/5 - Driving BACKWARD to start");
        telemetry.update();

        Pose currentPose = follower.getPose();
        Path backwardPath = new Path(new BezierLine(
                new Point(currentPose),
                new Point(startPose)
        ));
        backwardPath.setConstantHeadingInterpolation(startPose.getHeading());

        follower.followPath(backwardPath, true);
        while (opModeIsActive() && follower.isBusy()) {
            follower.update();
            updateTelemetry("Backward");
        }
        logResult("Backward (return)", 0);
        sleep(1000);

        // ── Step 3: Strafe Left ──
        if (!opModeIsActive()) return;
        telemetry.addData("Step", "3/5 - Strafing LEFT " + STRAFE_DISTANCE + " inches");
        telemetry.update();

        currentPose = follower.getPose();
        Path strafeLeftPath = new Path(new BezierLine(
                new Point(currentPose),
                new Point(currentPose.getX(), currentPose.getY() + STRAFE_DISTANCE, Point.CARTESIAN)
        ));
        strafeLeftPath.setConstantHeadingInterpolation(startPose.getHeading());

        follower.followPath(strafeLeftPath, true);
        while (opModeIsActive() && follower.isBusy()) {
            follower.update();
            updateTelemetry("Strafe Left");
        }
        logResult("Strafe Left", STRAFE_DISTANCE);
        sleep(1000);

        // ── Step 4: Strafe Right (return to start) ──
        if (!opModeIsActive()) return;
        telemetry.addData("Step", "4/5 - Strafing RIGHT to start");
        telemetry.update();

        currentPose = follower.getPose();
        Path strafeRightPath = new Path(new BezierLine(
                new Point(currentPose),
                new Point(startPose)
        ));
        strafeRightPath.setConstantHeadingInterpolation(startPose.getHeading());

        follower.followPath(strafeRightPath, true);
        while (opModeIsActive() && follower.isBusy()) {
            follower.update();
            updateTelemetry("Strafe Right");
        }
        logResult("Strafe Right (return)", 0);
        sleep(1000);

        // ── Step 5: Turn in place ──
        if (!opModeIsActive()) return;
        telemetry.addData("Step", "5/5 - Turning " + TURN_ANGLE + " degrees");
        telemetry.update();

        currentPose = follower.getPose();
        Path turnPath = new Path(new BezierLine(
                new Point(currentPose),
                new Point(currentPose.getX() + TURN_PATH_EPSILON, currentPose.getY(), Point.CARTESIAN)
        ));
        turnPath.setLinearHeadingInterpolation(
                currentPose.getHeading(),
                currentPose.getHeading() + Math.toRadians(TURN_ANGLE)
        );

        follower.followPath(turnPath, true);
        while (opModeIsActive() && follower.isBusy()) {
            follower.update();
            updateTelemetry("Turn");
        }
        logResult("Turn", TURN_ANGLE);

        // ── Done ──
        telemetry.addData("Status", "TUNING COMPLETE");
        telemetry.addData("Final Pose", formatPose(follower.getPose()));
        telemetry.addData("Expected Final Heading", String.format("%.1f°", TURN_ANGLE));
        telemetry.update();

        while (opModeIsActive()) {
            idle();
        }
    }

    private void updateTelemetry(String step) {
        Pose pose = follower.getPose();
        telemetry.addData("Current Step", step);
        telemetry.addData("Pose", formatPose(pose));
        telemetry.addData("Following", follower.isBusy());
        telemetry.addData("Timer", String.format("%.1fs", timer.getElapsedTimeSeconds()));
        telemetry.update();
    }

    private void logResult(String step, double expected) {
        Pose pose = follower.getPose();
        telemetry.addData("Completed", step);
        telemetry.addData("Final Pose", formatPose(pose));
        if (expected > 0) {
            telemetry.addData("Expected Distance/Angle", expected);
        }
        telemetry.update();
    }

    private String formatPose(Pose p) {
        return String.format("X: %.2f, Y: %.2f, H: %.1f°",
                p.getX(), p.getY(), Math.toDegrees(p.getHeading()));
    }
}
