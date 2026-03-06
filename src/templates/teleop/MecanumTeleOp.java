package org.firstinspires.ftc.teamcode.teleop;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.util.Range;

/**
 * Mecanum Drive TeleOp with field-centric and robot-centric modes.
 *
 * Controls:
 *   Left stick X/Y  → Translation (strafe + drive)
 *   Right stick X   → Rotation
 *   Left bumper     → Toggle field-centric mode
 *   Right bumper    → Fine control (reduce speed)
 *   A               → Servo action example
 *   B               → Servo action example
 */
@TeleOp(name = "Mecanum Drive TeleOp", group = "TeleOp")
public class MecanumTeleOp extends LinearOpMode {

    // ── Hardware ─────────────────────────────────────────────────────────────────
    private DcMotor frontLeft, frontRight, backLeft, backRight;
    // private Servo clawServo;
    // private DcMotor liftMotor;

    // ── State ─────────────────────────────────────────────────────────────────────
    private boolean fieldCentric = false;
    private boolean lastBumperState = false;

    // ── Constants ─────────────────────────────────────────────────────────────────
    private static final double NORMAL_SPEED = 1.0;
    private static final double FINE_SPEED   = 0.3;

    @Override
    public void runOpMode() throws InterruptedException {
        initHardware();

        telemetry.addData("Status", "Initialized");
        telemetry.addData("Mode", "Robot-Centric");
        telemetry.addData("Tip", "Press Left Bumper to toggle field-centric");
        telemetry.update();

        waitForStart();

        while (opModeIsActive()) {
            handleDrive();
            // handleArm();
            // handleIntake();
            updateTelemetry();
        }
    }

    private void handleDrive() {
        // ── Read gamepad ────────────────────────────────────────────────────────
        double y  = -gamepad1.left_stick_y;   // note: y is inverted on gamepad
        double x  =  gamepad1.left_stick_x * 1.1; // counteract imperfect strafing
        double rx =  gamepad1.right_stick_x;

        // Toggle field-centric on left bumper press
        if (gamepad1.left_bumper && !lastBumperState) {
            fieldCentric = !fieldCentric;
        }
        lastBumperState = gamepad1.left_bumper;

        // ── Field-centric transformation ─────────────────────────────────────
        if (fieldCentric) {
            // Rotate the movement direction counter to the robot's rotation
            double botHeading = 0; // Replace with IMU heading: imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.RADIANS)
            double rotX =  x * Math.cos(-botHeading) - y * Math.sin(-botHeading);
            double rotY =  x * Math.sin(-botHeading) + y * Math.cos(-botHeading);
            x = rotX;
            y = rotY;
        }

        // ── Speed multiplier ─────────────────────────────────────────────────
        double speedMultiplier = gamepad1.right_bumper ? FINE_SPEED : NORMAL_SPEED;

        // ── Calculate motor powers ────────────────────────────────────────────
        double denominator = Math.max(Math.abs(y) + Math.abs(x) + Math.abs(rx), 1);
        double flPower = (y + x + rx) / denominator * speedMultiplier;
        double frPower = (y - x - rx) / denominator * speedMultiplier;
        double blPower = (y - x + rx) / denominator * speedMultiplier;
        double brPower = (y + x - rx) / denominator * speedMultiplier;

        frontLeft.setPower(flPower);
        frontRight.setPower(frPower);
        backLeft.setPower(blPower);
        backRight.setPower(brPower);
    }

    private void initHardware() {
        frontLeft  = hardwareMap.get(DcMotor.class, "frontLeft");
        frontRight = hardwareMap.get(DcMotor.class, "frontRight");
        backLeft   = hardwareMap.get(DcMotor.class, "backLeft");
        backRight  = hardwareMap.get(DcMotor.class, "backRight");

        frontLeft.setDirection(DcMotorSimple.Direction.REVERSE);
        backLeft.setDirection(DcMotorSimple.Direction.REVERSE);
        frontRight.setDirection(DcMotorSimple.Direction.FORWARD);
        backRight.setDirection(DcMotorSimple.Direction.FORWARD);

        frontLeft.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        frontRight.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        backLeft.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        backRight.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);

        frontLeft.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        frontRight.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        backLeft.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        backRight.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);

        // clawServo = hardwareMap.get(Servo.class, "claw");
    }

    private void updateTelemetry() {
        telemetry.addData("Mode", fieldCentric ? "Field-Centric" : "Robot-Centric");
        telemetry.addData("Fine Control", gamepad1.right_bumper ? "ON" : "OFF");
        telemetry.addData("Left Stick", "X:%.2f  Y:%.2f", gamepad1.left_stick_x, gamepad1.left_stick_y);
        telemetry.addData("Right Stick X", "%.2f", gamepad1.right_stick_x);
        telemetry.addData("FL/FR Power", "%.2f / %.2f", frontLeft.getPower(), frontRight.getPower());
        telemetry.addData("BL/BR Power", "%.2f / %.2f", backLeft.getPower(), backRight.getPower());
        telemetry.update();
    }
}
