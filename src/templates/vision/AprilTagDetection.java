package org.firstinspires.ftc.teamcode.vision;

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.vision.VisionPortal;
import org.firstinspires.ftc.vision.apriltag.AprilTagDetection;
import org.firstinspires.ftc.vision.apriltag.AprilTagGameDatabase;
import org.firstinspires.ftc.vision.apriltag.AprilTagProcessor;

import java.util.List;

/**
 * AprilTag Detection OpMode.
 *
 * Uses the FTC SDK Vision portal and AprilTag processor to detect
 * and localize AprilTags on the field. Supports pose estimation
 * for field-relative navigation.
 *
 * Hardware required:
 *   - USB webcam configured as "Webcam 1" in robot configuration
 */
@Autonomous(name = "AprilTag Detection", group = "Vision")
public class AprilTagDetection extends LinearOpMode {

    // ── Vision ────────────────────────────────────────────────────────────────
    private VisionPortal visionPortal;
    private AprilTagProcessor aprilTagProcessor;

    // ── Tag IDs (FTC Into The Deep 2024–25) ─────────────────────────────────
    public static final int TAG_BLUE_ALLIANCE_LEFT   = 1;
    public static final int TAG_BLUE_ALLIANCE_CENTER = 2;
    public static final int TAG_BLUE_ALLIANCE_RIGHT  = 3;
    public static final int TAG_RED_ALLIANCE_LEFT    = 4;
    public static final int TAG_RED_ALLIANCE_CENTER  = 5;
    public static final int TAG_RED_ALLIANCE_RIGHT   = 6;

    @Override
    public void runOpMode() throws InterruptedException {
        initVision();

        telemetry.addData("Status", "Vision Initialized");
        telemetry.addData("Camera State", visionPortal.getCameraState());
        telemetry.update();

        waitForStart();

        while (opModeIsActive()) {
            List<AprilTagDetection> detections = aprilTagProcessor.getDetections();

            telemetry.addData("Tags Detected", detections.size());

            for (AprilTagDetection detection : detections) {
                if (detection.metadata != null) {
                    // Tag with known field position
                    telemetry.addLine(String.format(
                            "\n==== Tag #%d (%s) ====",
                            detection.id, detection.metadata.name));
                    telemetry.addData("  Range",    "%.2f inches", detection.ftcPose.range);
                    telemetry.addData("  Bearing",  "%.2f degrees", detection.ftcPose.bearing);
                    telemetry.addData("  Yaw",      "%.2f degrees", detection.ftcPose.yaw);
                    telemetry.addData("  Field X",  "%.2f", detection.ftcPose.x);
                    telemetry.addData("  Field Y",  "%.2f", detection.ftcPose.y);
                } else {
                    // Unknown tag
                    telemetry.addLine(String.format(
                            "\n==== Unknown Tag #%d ====", detection.id));
                }

                // Use tag pose for navigation
                if (detection.id == TAG_BLUE_ALLIANCE_CENTER && detection.metadata != null) {
                    navigateToTag(detection);
                }
            }

            telemetry.update();
        }

        visionPortal.close();
    }

    /** Navigate to within scoring distance of an AprilTag */
    private void navigateToTag(AprilTagDetection detection) {
        double rangeError   = detection.ftcPose.range  - 12.0; // Target: 12 inches away
        double headingError = detection.ftcPose.bearing;
        double yawError     = detection.ftcPose.yaw;

        // Simple proportional drive toward tag
        double drive  = -rangeError   * 0.05;
        double strafe =  headingError * 0.05;
        double turn   = -yawError     * 0.03;

        telemetry.addData("Nav Drive",  "%.2f", drive);
        telemetry.addData("Nav Strafe", "%.2f", strafe);
        telemetry.addData("Nav Turn",   "%.2f", turn);
    }

    private void initVision() {
        // Build the AprilTag processor with default settings
        aprilTagProcessor = new AprilTagProcessor.Builder()
                .setDrawAxes(true)
                .setDrawCubeProjection(true)
                .setDrawTagOutline(true)
                .setTagFamily(AprilTagProcessor.TagFamily.TAG_36h11)
                .setTagLibrary(AprilTagGameDatabase.getCenterStageTagLibrary())
                .setOutputUnits(DistanceUnit.INCH, AngleUnit.DEGREES)
                .build();

        // Build the Vision Portal
        visionPortal = new VisionPortal.Builder()
                .setCamera(hardwareMap.get(WebcamName.class, "Webcam 1"))
                .setCameraResolution(new android.util.Size(640, 480))
                .setStreamFormat(VisionPortal.StreamFormat.YUY2)
                .addProcessor(aprilTagProcessor)
                .build();

        // Wait for camera to open
        while (!isStarted() && !isStopRequested() &&
               visionPortal.getCameraState() != VisionPortal.CameraState.STREAMING) {
            telemetry.addData("Camera", "Waiting...");
            telemetry.update();
        }
    }
}
