package org.firstinspires.ftc.teamcode.subsystems;

import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.hardware.TouchSensor;
import com.rowanmcalpin.nextftc.core.Subsystem;
import com.rowanmcalpin.nextftc.core.command.Command;
import com.rowanmcalpin.nextftc.ftc.OpModeData;

/**
 * Arm subsystem with encoder-based position control.
 * Uses RUN_TO_POSITION for reliable positioning.
 */
public class ArmSubsystem extends Subsystem {

    public static final ArmSubsystem INSTANCE = new ArmSubsystem();
    private ArmSubsystem() {}

    // ── Hardware ─────────────────────────────────────────────────────────────
    private DcMotor armMotor;
    private TouchSensor limitSwitch; // optional: limit switch at bottom

    // ── Position Constants (encoder ticks) ───────────────────────────────────
    public static final int REST_POSITION      = 0;
    public static final int LOW_POSITION       = 200;
    public static final int MID_POSITION       = 500;
    public static final int HIGH_POSITION      = 900;
    public static final int PICKUP_POSITION    = 50;

    private static final double HOLD_POWER     = 0.3;
    private static final double MOVE_POWER     = 0.8;
    private static final int    POSITION_TOLERANCE = 15;

    private int targetPosition = REST_POSITION;

    @Override
    public void initialize() {
        HardwareMap hw = OpModeData.INSTANCE.getHardwareMap();
        armMotor = hw.get(DcMotor.class, "armMotor");
        armMotor.setDirection(DcMotorSimple.Direction.FORWARD);
        armMotor.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        armMotor.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        armMotor.setMode(DcMotor.RunMode.RUN_USING_ENCODER);

        // Optional: limit switch
        // limitSwitch = hw.get(TouchSensor.class, "armLimit");
    }

    @Override
    public void periodic() {
        // Optional: telemetry or hold logic
    }

    // ── Arm Commands ──────────────────────────────────────────────────────────

    /** Move arm to a named preset position */
    public Command toRest()    { return moveTo(REST_POSITION);   }
    public Command toLow()     { return moveTo(LOW_POSITION);    }
    public Command toMid()     { return moveTo(MID_POSITION);    }
    public Command toHigh()    { return moveTo(HIGH_POSITION);   }
    public Command toPickup()  { return moveTo(PICKUP_POSITION); }

    /** Move arm to a specific encoder position */
    public Command moveTo(int position) {
        return new Command() {
            @Override
            public void start() {
                targetPosition = position;
                armMotor.setTargetPosition(position);
                armMotor.setMode(DcMotor.RunMode.RUN_TO_POSITION);
                armMotor.setPower(MOVE_POWER);
            }

            @Override
            public boolean getDone() {
                return !armMotor.isBusy() ||
                       Math.abs(armMotor.getCurrentPosition() - position) <= POSITION_TOLERANCE;
            }

            @Override
            public void end(boolean interrupted) {
                if (!interrupted) {
                    armMotor.setPower(HOLD_POWER);
                }
            }
        };
    }

    /** Home the arm using limit switch (if installed) */
    public Command home() {
        return new Command() {
            @Override
            public void start() {
                armMotor.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
                armMotor.setPower(-0.3);
            }

            @Override
            public boolean getDone() {
                // If no limit switch, rely on timeout in CommandManager
                // return limitSwitch != null && limitSwitch.isPressed();
                return false;
            }

            @Override
            public void end(boolean interrupted) {
                armMotor.setPower(0);
                armMotor.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
                armMotor.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
            }
        };
    }

    // ── Getters ───────────────────────────────────────────────────────────────
    public int getCurrentPosition() { return armMotor.getCurrentPosition(); }
    public int getTargetPosition()  { return targetPosition; }
    public boolean isAtTarget()     {
        return Math.abs(armMotor.getCurrentPosition() - targetPosition) <= POSITION_TOLERANCE;
    }
}
