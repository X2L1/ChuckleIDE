package org.firstinspires.ftc.teamcode.subsystems;

import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.rowanmcalpin.nextftc.core.Subsystem;
import com.rowanmcalpin.nextftc.core.command.Command;
import com.rowanmcalpin.nextftc.ftc.OpModeData;

/**
 * Mecanum drivetrain subsystem (NextFTC architecture).
 *
 * Handles hardware initialization and provides commands for movement.
 * In TeleOp, reads gamepad directly in periodic(). In Auto, use path commands.
 */
public class DrivetrainSubsystem extends Subsystem {

    // ── Singleton ─────────────────────────────────────────────────────────────
    public static final DrivetrainSubsystem INSTANCE = new DrivetrainSubsystem();
    private DrivetrainSubsystem() {}

    // ── Hardware ─────────────────────────────────────────────────────────────
    private DcMotor frontLeft, frontRight, backLeft, backRight;

    // ── State ─────────────────────────────────────────────────────────────────
    private boolean fieldCentric = false;
    private double heading = 0.0;

    // ── Constants ─────────────────────────────────────────────────────────────
    private static final double FINE_SPEED_MULTIPLIER = 0.35;

    @Override
    public void initialize() {
        HardwareMap hw = OpModeData.INSTANCE.getHardwareMap();

        frontLeft  = hw.get(DcMotor.class, "frontLeft");
        frontRight = hw.get(DcMotor.class, "frontRight");
        backLeft   = hw.get(DcMotor.class, "backLeft");
        backRight  = hw.get(DcMotor.class, "backRight");

        frontLeft.setDirection(DcMotorSimple.Direction.REVERSE);
        backLeft.setDirection(DcMotorSimple.Direction.REVERSE);
        frontRight.setDirection(DcMotorSimple.Direction.FORWARD);
        backRight.setDirection(DcMotorSimple.Direction.FORWARD);

        setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        setRunMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
    }

    /**
     * Called every loop while the OpMode is active.
     * In TeleOp, directly reads gamepad1 for smooth control.
     */
    @Override
    public void periodic() {
        if (OpModeData.INSTANCE.getGamepad1() == null) return;

        double y  = -OpModeData.INSTANCE.getGamepad1().left_stick_y;
        double x  =  OpModeData.INSTANCE.getGamepad1().left_stick_x * 1.1;
        double rx =  OpModeData.INSTANCE.getGamepad1().right_stick_x;

        // Fine control with right bumper
        double speed = OpModeData.INSTANCE.getGamepad1().right_bumper
                ? FINE_SPEED_MULTIPLIER : 1.0;

        // Field-centric rotation correction
        if (fieldCentric) {
            double rotX =  x * Math.cos(-heading) - y * Math.sin(-heading);
            double rotY =  x * Math.sin(-heading) + y * Math.cos(-heading);
            x = rotX;
            y = rotY;
        }

        setDrivePowers(y, x, rx, speed);
    }

    // ── Commands ───────────────────────────────────────────────────────────────

    /** Drive with specific motor powers (for autonomous) */
    public Command drive(double fl, double fr, double bl, double br) {
        return new Command() {
            @Override public void start() { setMotorPowers(fl, fr, bl, br); }
            @Override public boolean getDone() { return true; }
        };
    }

    /** Stop all drive motors */
    public Command stop() {
        return new Command() {
            @Override public void start() { setMotorPowers(0, 0, 0, 0); }
            @Override public boolean getDone() { return true; }
        };
    }

    /** Toggle field-centric drive mode */
    public Command toggleFieldCentric() {
        return new Command() {
            @Override public void start() { fieldCentric = !fieldCentric; }
            @Override public boolean getDone() { return true; }
        };
    }

    // ── Helper Methods ────────────────────────────────────────────────────────

    public void setDrivePowers(double y, double x, double rx, double speed) {
        double denom = Math.max(Math.abs(y) + Math.abs(x) + Math.abs(rx), 1);
        setMotorPowers(
            (y + x + rx) / denom * speed,
            (y - x - rx) / denom * speed,
            (y - x + rx) / denom * speed,
            (y + x - rx) / denom * speed
        );
    }

    public void setMotorPowers(double fl, double fr, double bl, double br) {
        frontLeft.setPower(fl);
        frontRight.setPower(fr);
        backLeft.setPower(bl);
        backRight.setPower(br);
    }

    public void setHeading(double headingRad) {
        this.heading = headingRad;
    }

    private void setZeroPowerBehavior(DcMotor.ZeroPowerBehavior behavior) {
        frontLeft.setZeroPowerBehavior(behavior);
        frontRight.setZeroPowerBehavior(behavior);
        backLeft.setZeroPowerBehavior(behavior);
        backRight.setZeroPowerBehavior(behavior);
    }

    private void setRunMode(DcMotor.RunMode mode) {
        frontLeft.setMode(mode);
        frontRight.setMode(mode);
        backLeft.setMode(mode);
        backRight.setMode(mode);
    }
}
