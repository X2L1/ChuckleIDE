package org.firstinspires.ftc.teamcode.vision;

import com.qualcomm.hardware.limelightvision.LLResult;
import com.qualcomm.hardware.limelightvision.LLResultTypes;
import com.qualcomm.hardware.limelightvision.Limelight3A;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

import org.firstinspires.ftc.robotcore.external.navigation.Pose3D;

import java.util.List;

/**
 * Limelight 3A Vision OpMode.
 *
 * The Limelight 3A is a smart camera designed for FTC that connects via USB
 * and provides high-performance vision processing including:
 *
 *   - AprilTag detection with 3D pose estimation
 *   - Neural network object detection (custom pipelines)
 *   - Color/contour detection pipelines
 *   - Python-scripted custom pipelines
 *   - MegaTag localization (multi-tag field positioning)
 *
 * Configuration is done via the Limelight web interface (http://limelight.local:5801)
 * where you set up numbered pipelines (0–9).
 *
 * Hardware setup:
 *   - Connect Limelight 3A to USB port on Control Hub
 *   - Configure as "limelight" (type: Limelight3A) in robot configuration
 *   - Set up pipelines via the Limelight web UI before running
 *
 * @see <a href="https://docs.limelightvision.io/docs/docs-limelight/getting-started/FTC/getting-started-FTC">Limelight FTC Docs</a>
 */
@Autonomous(name = "Limelight Detection", group = "Vision")
public class LimelightDetection extends LinearOpMode {

    // ── Hardware ──────────────────────────────────────────────────────────────
    private Limelight3A limelight;

    // ── Pipeline indices (configured in Limelight web UI) ────────────────────
    private static final int PIPELINE_APRILTAG = 0;
    private static final int PIPELINE_NEURAL   = 1;
    private static final int PIPELINE_COLOR    = 2;

    @Override
    public void runOpMode() throws InterruptedException {
        initLimelight();

        telemetry.addData("Status", "Limelight Initialized");
        telemetry.addData(">", "Press START to begin detection");
        telemetry.update();

        waitForStart();

        while (opModeIsActive()) {
            LLResult result = limelight.getLatestResult();

            if (result != null && result.isValid()) {
                processAprilTags(result);
                processNeuralDetections(result);
                processColorTargets(result);

                // Limelight's built-in robot pose from MegaTag
                Pose3D botPose = result.getBotpose();
                if (botPose != null) {
                    telemetry.addData("Bot Pose X (m)", "%.3f", botPose.getPosition().x);
                    telemetry.addData("Bot Pose Y (m)", "%.3f", botPose.getPosition().y);
                    telemetry.addData("Bot Pose Z (m)", "%.3f", botPose.getPosition().z);
                }

                telemetry.addData("Pipeline", result.getPipelineIndex());
                telemetry.addData("Tx", "%.2f", result.getTx());
                telemetry.addData("Ty", "%.2f", result.getTy());
                telemetry.addData("Ta", "%.2f", result.getTa());
            } else {
                telemetry.addData("Limelight", "No valid result");
            }

            telemetry.update();
        }

        limelight.stop();
    }

    /**
     * Process AprilTag results from the Limelight.
     */
    private void processAprilTags(LLResult result) {
        List<LLResultTypes.FiducialResult> fiducials = result.getFiducialResults();

        for (LLResultTypes.FiducialResult fiducial : fiducials) {
            int tagId = fiducial.getFiducialId();
            double tx = fiducial.getTargetXDegrees();
            double ty = fiducial.getTargetYDegrees();

            telemetry.addLine(String.format(
                    "  AprilTag #%d  tx=%.1f°  ty=%.1f°", tagId, tx, ty));

            // 3D pose relative to the tag
            Pose3D tagPose = fiducial.getRobotPoseTargetSpace();
            if (tagPose != null) {
                telemetry.addData("    Range (m)", "%.3f",
                        tagPose.getPosition().toUnit(
                                org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit.METER
                        ).x);
            }
        }
    }

    /**
     * Process neural network detections (custom trained or built-in).
     */
    private void processNeuralDetections(LLResult result) {
        List<LLResultTypes.DetectorResult> detections = result.getDetectorResults();

        for (LLResultTypes.DetectorResult detection : detections) {
            String className = detection.getClassName();
            double confidence = detection.getConfidence();

            telemetry.addLine(String.format(
                    "  Detector: %s (%.0f%% conf)  tx=%.1f  ty=%.1f",
                    className, confidence * 100,
                    detection.getTargetXDegrees(),
                    detection.getTargetYDegrees()));
        }
    }

    /**
     * Process color/contour pipeline targets.
     */
    private void processColorTargets(LLResult result) {
        List<LLResultTypes.ColorResult> colorResults = result.getColorResults();

        for (LLResultTypes.ColorResult colorTarget : colorResults) {
            telemetry.addLine(String.format(
                    "  Color target: tx=%.1f  ty=%.1f  ta=%.2f",
                    colorTarget.getTargetXDegrees(),
                    colorTarget.getTargetYDegrees(),
                    colorTarget.getTargetArea()));
        }
    }

    /**
     * Switch the active pipeline at runtime.
     *
     * @param pipelineIndex pipeline number (0–9) configured in Limelight web UI
     */
    public void switchPipeline(int pipelineIndex) {
        limelight.pipelineSwitch(pipelineIndex);
    }

    /**
     * Initialize the Limelight 3A.
     */
    private void initLimelight() {
        limelight = hardwareMap.get(Limelight3A.class, "limelight");

        // Start with AprilTag pipeline
        limelight.pipelineSwitch(PIPELINE_APRILTAG);

        // Start polling for results
        limelight.start();

        telemetry.addData("Limelight", "Connected: %b", limelight.isConnected());
    }
}
