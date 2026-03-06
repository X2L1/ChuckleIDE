package org.firstinspires.ftc.teamcode.vision;

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;
import org.firstinspires.ftc.vision.VisionPortal;
import org.firstinspires.ftc.vision.tfod.TfodProcessor;
import org.firstinspires.ftc.robotcore.external.tfod.Recognition;

import java.util.List;

/**
 * TensorFlow Lite Object Detection OpMode.
 *
 * Uses TfodProcessor with a custom or default model to detect game elements.
 * Customize with your own .tflite model for game-specific objects.
 */
@Autonomous(name = "TensorFlow Detection", group = "Vision")
public class TensorFlowDetection extends LinearOpMode {

    // ── TensorFlow config ─────────────────────────────────────────────────────
    // Replace with your custom model asset name, or use null for the default FTC model
    private static final String TFOD_MODEL_ASSET = null;
    private static final String[] LABELS = {
        "Yellow Pixel", "Purple Pixel", "Green Pixel", "White Pixel"
        // Update these to match your .tflite model's labels
    };

    // ── Vision ────────────────────────────────────────────────────────────────
    private VisionPortal visionPortal;
    private TfodProcessor tfodProcessor;

    // ── Detection result ───────────────────────────────────────────────────────
    public enum TeamPropPosition { LEFT, CENTER, RIGHT, UNKNOWN }
    private TeamPropPosition propPosition = TeamPropPosition.UNKNOWN;

    @Override
    public void runOpMode() throws InterruptedException {
        initVision();

        // Pre-match: determine starting position
        while (!isStarted() && !isStopRequested()) {
            detectTeamProp();
            telemetry.addData("Prop Position", propPosition);
            telemetry.addData("Press PLAY", "to start autonomous");
            telemetry.update();
        }

        waitForStart();

        // Execute path based on detected position
        switch (propPosition) {
            case LEFT:
                telemetry.addData("Executing", "LEFT path");
                break;
            case CENTER:
                telemetry.addData("Executing", "CENTER path");
                break;
            case RIGHT:
                telemetry.addData("Executing", "RIGHT path");
                break;
            default:
                telemetry.addData("Executing", "DEFAULT path (center)");
                break;
        }

        while (opModeIsActive()) {
            List<Recognition> recognitions = tfodProcessor.getRecognitions();

            telemetry.addData("Objects Detected", recognitions.size());

            for (Recognition rec : recognitions) {
                double x = (rec.getLeft() + rec.getRight()) / 2.0;
                double y = (rec.getTop() + rec.getBottom()) / 2.0;
                telemetry.addData("", " ");
                telemetry.addData("Image", "%s (%.0f %% conf.)", rec.getLabel(), rec.getConfidence() * 100);
                telemetry.addData("- Position", "%.0f / %.0f", x, y);
                telemetry.addData("- Size",     "%.0f x %.0f", rec.getWidth(), rec.getHeight());
            }

            telemetry.update();
        }

        visionPortal.close();
    }

    /** Detect team prop position in pre-match using camera center lines */
    private void detectTeamProp() {
        List<Recognition> recognitions = tfodProcessor.getRecognitions();

        double highestConfidence = 0;
        Recognition bestDetection = null;

        for (Recognition rec : recognitions) {
            if (rec.getConfidence() > highestConfidence) {
                highestConfidence = rec.getConfidence();
                bestDetection = rec;
            }
        }

        if (bestDetection != null && bestDetection.getConfidence() > 0.6) {
            double centerX = (bestDetection.getLeft() + bestDetection.getRight()) / 2.0;
            double imageWidth = bestDetection.getImageWidth();

            // Divide frame into thirds
            if (centerX < imageWidth / 3.0) {
                propPosition = TeamPropPosition.LEFT;
            } else if (centerX < 2.0 * imageWidth / 3.0) {
                propPosition = TeamPropPosition.CENTER;
            } else {
                propPosition = TeamPropPosition.RIGHT;
            }
        } else {
            propPosition = TeamPropPosition.UNKNOWN;
        }
    }

    private void initVision() {
        TfodProcessor.Builder tfodBuilder = new TfodProcessor.Builder()
                .setMinResultConfidence(0.6f)
                .setIsModelTensorFlow2(true)
                .setInputSize(300);

        if (TFOD_MODEL_ASSET != null) {
            tfodBuilder.setModelAssetName(TFOD_MODEL_ASSET);
            tfodBuilder.setModelLabels(LABELS);
        }

        tfodProcessor = tfodBuilder.build();

        visionPortal = new VisionPortal.Builder()
                .setCamera(hardwareMap.get(WebcamName.class, "Webcam 1"))
                .setCameraResolution(new android.util.Size(640, 480))
                .addProcessor(tfodProcessor)
                .build();

        while (!isStarted() && !isStopRequested() &&
               visionPortal.getCameraState() != VisionPortal.CameraState.STREAMING) {
            telemetry.addData("Camera", "Opening...");
            telemetry.update();
        }
    }
}
