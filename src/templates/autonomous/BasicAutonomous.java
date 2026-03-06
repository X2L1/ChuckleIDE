package org.firstinspires.ftc.teamcode.autonomous;

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.util.ElapsedTime;

@Autonomous(name = "Basic Autonomous", group = "Autonomous")
public class BasicAutonomous extends LinearOpMode {

    // ── Hardware ────────────────────────────────────────────────────────────────
    private DcMotor frontLeft, frontRight, backLeft, backRight;
    private final ElapsedTime runtime = new ElapsedTime();

    // ── Constants ───────────────────────────────────────────────────────────────
    private static final double DRIVE_SPEED  = 0.5;
    private static final double TURN_SPEED   = 0.4;
    private static final double STRAFE_SPEED = 0.5;

    @Override
    public void runOpMode() throws InterruptedException {
        // Initialize hardware
        initHardware();

        telemetry.addData("Status", "Initialized and Ready");
        telemetry.addData("Instructions", "Press PLAY to start");
        telemetry.update();

        // Wait for the game to start (driver presses PLAY)
        waitForStart();
        runtime.reset();

        if (opModeIsActive()) {
            // ── Autonomous Routine ─────────────────────────────────────────────
            telemetry.addData("Phase", "Driving forward");
            telemetry.update();
            driveForward(DRIVE_SPEED, 1.5);

            telemetry.addData("Phase", "Turning right");
            telemetry.update();
            turnRight(TURN_SPEED, 0.75);

            telemetry.addData("Phase", "Driving forward again");
            telemetry.update();
            driveForward(DRIVE_SPEED, 1.0);

            stopDriving();
            telemetry.addData("Status", "Autonomous Complete");
            telemetry.addData("Run Time", runtime.toString());
            telemetry.update();
        }
    }

    // ── Hardware Initialization ──────────────────────────────────────────────────
    private void initHardware() {
        frontLeft  = hardwareMap.get(DcMotor.class, "frontLeft");
        frontRight = hardwareMap.get(DcMotor.class, "frontRight");
        backLeft   = hardwareMap.get(DcMotor.class, "backLeft");
        backRight  = hardwareMap.get(DcMotor.class, "backRight");

        // Reverse motors on one side for correct drive direction
        frontLeft.setDirection(DcMotorSimple.Direction.REVERSE);
        backLeft.setDirection(DcMotorSimple.Direction.REVERSE);
        frontRight.setDirection(DcMotorSimple.Direction.FORWARD);
        backRight.setDirection(DcMotorSimple.Direction.FORWARD);

        // Set brake behavior
        frontLeft.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        frontRight.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        backLeft.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        backRight.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);

        // Reset and configure encoders
        setMotorRunMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        setMotorRunMode(DcMotor.RunMode.RUN_USING_ENCODER);
    }

    // ── Drive Helpers ────────────────────────────────────────────────────────────
    /** Drive forward at given power for given seconds */
    private void driveForward(double power, double seconds) throws InterruptedException {
        setMotorPowers(power, power, power, power);
        Thread.sleep((long)(seconds * 1000));
        stopDriving();
    }

    /** Drive backward at given power for given seconds */
    private void driveBackward(double power, double seconds) throws InterruptedException {
        setMotorPowers(-power, -power, -power, -power);
        Thread.sleep((long)(seconds * 1000));
        stopDriving();
    }

    /** Strafe left at given power for given seconds */
    private void strafeLeft(double power, double seconds) throws InterruptedException {
        setMotorPowers(-power, power, power, -power);
        Thread.sleep((long)(seconds * 1000));
        stopDriving();
    }

    /** Strafe right at given power for given seconds */
    private void strafeRight(double power, double seconds) throws InterruptedException {
        setMotorPowers(power, -power, -power, power);
        Thread.sleep((long)(seconds * 1000));
        stopDriving();
    }

    /** Turn right (clockwise) at given power for given seconds */
    private void turnRight(double power, double seconds) throws InterruptedException {
        setMotorPowers(power, -power, power, -power);
        Thread.sleep((long)(seconds * 1000));
        stopDriving();
    }

    /** Turn left (counter-clockwise) at given power for given seconds */
    private void turnLeft(double power, double seconds) throws InterruptedException {
        setMotorPowers(-power, power, -power, power);
        Thread.sleep((long)(seconds * 1000));
        stopDriving();
    }

    private void stopDriving() {
        setMotorPowers(0, 0, 0, 0);
    }

    private void setMotorPowers(double fl, double fr, double bl, double br) {
        frontLeft.setPower(fl);
        frontRight.setPower(fr);
        backLeft.setPower(bl);
        backRight.setPower(br);
    }

    private void setMotorRunMode(DcMotor.RunMode mode) {
        frontLeft.setMode(mode);
        frontRight.setMode(mode);
        backLeft.setMode(mode);
        backRight.setMode(mode);
    }
}
