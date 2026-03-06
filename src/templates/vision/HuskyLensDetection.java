package org.firstinspires.ftc.teamcode.vision;

import com.qualcomm.hardware.dfrobot.HuskyLens;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

/**
 * HuskyLens Vision Sensor OpMode.
 *
 * The DFRobot HuskyLens is an easy-to-use AI camera that connects via I2C.
 * It supports multiple built-in algorithms without needing a webcam or
 * external vision pipeline:
 *
 *   - Face Recognition
 *   - Object Tracking
 *   - Object Recognition
 *   - Line Tracking
 *   - Color Recognition
 *   - Tag Recognition (similar to AprilTags)
 *
 * Hardware setup:
 *   - Connect HuskyLens to an I2C port on the Control/Expansion Hub
 *   - Configure as "HuskyLens" (type: HuskyLens) in robot configuration
 *   - Select the desired algorithm on the HuskyLens screen before running,
 *     or set it in code with setAlgorithm()
 *
 * @see <a href="https://wiki.dfrobot.com/HUSKYLENS_V1.0_SKU_SEN0305_SEN0336">HuskyLens Wiki</a>
 */
@Autonomous(name = "HuskyLens Detection", group = "Vision")
public class HuskyLensDetection extends LinearOpMode {

    // ── Hardware ──────────────────────────────────────────────────────────────
    private HuskyLens huskyLens;

    @Override
    public void runOpMode() throws InterruptedException {
        initHuskyLens();

        telemetry.addData("Status", "HuskyLens Initialized");
        telemetry.addData(">", "Press START to begin detection");
        telemetry.update();

        waitForStart();

        while (opModeIsActive()) {
            // Fetch all visible blocks (detected objects)
            HuskyLens.Block[] blocks = huskyLens.blocks();

            telemetry.addData("Objects Detected", blocks.length);

            for (HuskyLens.Block block : blocks) {
                telemetry.addLine(String.format(
                        "  Block: ID=%d  x=%d  y=%d  w=%d  h=%d",
                        block.id, block.x, block.y, block.width, block.height));
            }

            // Example: react to the closest (largest) detected object
            if (blocks.length > 0) {
                HuskyLens.Block largest = getLargestBlock(blocks);
                processDetection(largest);
            }

            telemetry.update();
        }
    }

    /**
     * Process a detection — example logic for centering on an object.
     */
    private void processDetection(HuskyLens.Block block) {
        // HuskyLens frame is 320×240 by default
        int frameCenterX = 160;
        int frameCenterY = 120;

        int errorX = block.x - frameCenterX;
        int errorY = block.y - frameCenterY;

        telemetry.addData("Target ID",   block.id);
        telemetry.addData("Error X",     errorX);
        telemetry.addData("Error Y",     errorY);

        // Simple proportional turning toward the target
        double turnPower  = errorX * 0.003;
        double drivePower = -errorY * 0.003;

        telemetry.addData("Turn Power",  "%.2f", turnPower);
        telemetry.addData("Drive Power", "%.2f", drivePower);
    }

    /**
     * Return the largest block by area (likely the closest object).
     */
    private HuskyLens.Block getLargestBlock(HuskyLens.Block[] blocks) {
        HuskyLens.Block largest = blocks[0];
        int maxArea = largest.width * largest.height;

        for (int i = 1; i < blocks.length; i++) {
            int area = blocks[i].width * blocks[i].height;
            if (area > maxArea) {
                maxArea = area;
                largest = blocks[i];
            }
        }
        return largest;
    }

    /**
     * Initialize the HuskyLens with the desired algorithm.
     */
    private void initHuskyLens() {
        huskyLens = hardwareMap.get(HuskyLens.class, "huskyLens");

        // Select the algorithm — choose one:
        huskyLens.selectAlgorithm(HuskyLens.Algorithm.COLOR_RECOGNITION);
        // Other options:
        //   HuskyLens.Algorithm.FACE_RECOGNITION
        //   HuskyLens.Algorithm.OBJECT_TRACKING
        //   HuskyLens.Algorithm.OBJECT_RECOGNITION
        //   HuskyLens.Algorithm.LINE_TRACKING
        //   HuskyLens.Algorithm.COLOR_RECOGNITION
        //   HuskyLens.Algorithm.TAG_RECOGNITION
    }
}
