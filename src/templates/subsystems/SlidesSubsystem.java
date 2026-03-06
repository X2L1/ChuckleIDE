package org.firstinspires.ftc.teamcode.subsystems;

import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.hardware.TouchSensor;
import com.rowanmcalpin.nextftc.core.Subsystem;
import com.rowanmcalpin.nextftc.core.command.Command;
import com.rowanmcalpin.nextftc.ftc.OpModeData;

/**
 * Linear Slides subsystem with dual-motor synchronization and PID control.
 */
public class SlidesSubsystem extends Subsystem {

    public static final SlidesSubsystem INSTANCE = new SlidesSubsystem();
    private SlidesSubsystem() {}

    // ── Hardware ─────────────────────────────────────────────────────────────
    private DcMotor leftSlide, rightSlide;
    private TouchSensor bottomLimit; // optional

    // ── Position Presets (encoder ticks) ────────────────────────────────────
    public static final int RETRACTED    = 0;
    public static final int LOW_BASKET   = 600;
    public static final int HIGH_BASKET  = 1200;
    public static final int LOW_CHAMBER  = 400;
    public static final int HIGH_CHAMBER = 900;

    private static final double MOVE_POWER      = 0.9;
    private static final double HOLD_POWER      = 0.15;
    private static final int    TOLERANCE       = 20;

    // PID coefficients for smooth positioning
    private static final double KP = 0.008;
    private static final double KI = 0.0;
    private static final double KD = 0.0004;

    private int targetPosition = RETRACTED;
    private double integralSum = 0;
    private int lastError = 0;

    @Override
    public void initialize() {
        HardwareMap hw = OpModeData.INSTANCE.getHardwareMap();
        leftSlide  = hw.get(DcMotor.class, "leftSlide");
        rightSlide = hw.get(DcMotor.class, "rightSlide");

        leftSlide.setDirection(DcMotor.Direction.FORWARD);
        rightSlide.setDirection(DcMotor.Direction.REVERSE);

        leftSlide.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        rightSlide.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);

        resetEncoders();
        // bottomLimit = hw.get(TouchSensor.class, "slidesBottom");
    }

    @Override
    public void periodic() {
        // PID hold when not commanded
        int currentPos = leftSlide.getCurrentPosition();
        int error = targetPosition - currentPos;
        integralSum += error;
        int deltaError = error - lastError;
        lastError = error;

        if (Math.abs(error) < TOLERANCE) {
            setPower(HOLD_POWER);
        }
        // else: command will handle motion
    }

    // ── Slide Commands ────────────────────────────────────────────────────────
    public Command toRetracted()   { return moveTo(RETRACTED);    }
    public Command toLowBasket()   { return moveTo(LOW_BASKET);   }
    public Command toHighBasket()  { return moveTo(HIGH_BASKET);  }
    public Command toLowChamber()  { return moveTo(LOW_CHAMBER);  }
    public Command toHighChamber() { return moveTo(HIGH_CHAMBER); }

    public Command moveTo(int position) {
        return new Command() {
            @Override
            public void start() {
                targetPosition = position;
                integralSum = 0;
                lastError = 0;
                leftSlide.setTargetPosition(position);
                rightSlide.setTargetPosition(position);
                leftSlide.setMode(DcMotor.RunMode.RUN_TO_POSITION);
                rightSlide.setMode(DcMotor.RunMode.RUN_TO_POSITION);
                setPower(MOVE_POWER);
            }

            @Override
            public boolean getDone() {
                return !leftSlide.isBusy() || isAtTarget();
            }

            @Override
            public void end(boolean interrupted) {
                setPower(position <= RETRACTED + 50 ? 0 : HOLD_POWER);
            }
        };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private void setPower(double power) {
        leftSlide.setPower(power);
        rightSlide.setPower(power);
    }

    private void resetEncoders() {
        leftSlide.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        rightSlide.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
        leftSlide.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
        rightSlide.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
    }

    public int getCurrentPosition()  { return leftSlide.getCurrentPosition(); }
    public int getTargetPosition()   { return targetPosition; }
    public boolean isAtTarget()      {
        return Math.abs(leftSlide.getCurrentPosition() - targetPosition) <= TOLERANCE;
    }
}
