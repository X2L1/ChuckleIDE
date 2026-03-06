package org.firstinspires.ftc.teamcode.subsystems;

import com.qualcomm.robotcore.hardware.CRServo;
import com.qualcomm.robotcore.hardware.ColorSensor;
import com.qualcomm.robotcore.hardware.DistanceSensor;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.rowanmcalpin.nextftc.core.Subsystem;
import com.rowanmcalpin.nextftc.core.command.Command;
import com.rowanmcalpin.nextftc.ftc.OpModeData;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

/**
 * Intake/outtake subsystem using continuous rotation servos.
 * Optionally uses a color sensor to detect game piece possession.
 */
public class IntakeSubsystem extends Subsystem {

    public static final IntakeSubsystem INSTANCE = new IntakeSubsystem();
    private IntakeSubsystem() {}

    // ── Hardware ─────────────────────────────────────────────────────────────
    private CRServo intakeServo;
    // private ColorSensor colorSensor;
    // private DistanceSensor distanceSensor;

    // ── Constants ─────────────────────────────────────────────────────────────
    private static final double INTAKE_POWER  =  1.0;
    private static final double EJECT_POWER   = -1.0;
    private static final double HOLD_POWER    =  0.05;

    // Distance threshold to detect a game piece (centimeters)
    private static final double PIECE_THRESHOLD_CM = 3.0;

    @Override
    public void initialize() {
        HardwareMap hw = OpModeData.INSTANCE.getHardwareMap();
        intakeServo = hw.get(CRServo.class, "intake");
        // colorSensor    = hw.get(ColorSensor.class, "intakeColor");
        // distanceSensor = hw.get(DistanceSensor.class, "intakeDistance");
    }

    @Override
    public void periodic() {}

    // ── Intake Commands ───────────────────────────────────────────────────────

    /** Run intake until a game piece is detected (or timeout in CommandManager) */
    public Command intakeUntilPiece() {
        return new Command() {
            @Override
            public void start() { intakeServo.setPower(INTAKE_POWER); }

            @Override
            public boolean getDone() {
                return hasPiece();
            }

            @Override
            public void end(boolean interrupted) {
                intakeServo.setPower(HOLD_POWER);
            }
        };
    }

    /** Run intake for TeleOp control */
    public Command grab() {
        return new Command() {
            @Override public void start()           { intakeServo.setPower(INTAKE_POWER); }
            @Override public boolean getDone()      { return true; }
        };
    }

    /** Run outtake to score */
    public Command eject() {
        return new Command() {
            @Override public void start()           { intakeServo.setPower(EJECT_POWER); }
            @Override public boolean getDone()      { return true; }
        };
    }

    /** Stop the intake */
    public Command stop() {
        return new Command() {
            @Override public void start()           { intakeServo.setPower(0); }
            @Override public boolean getDone()      { return true; }
        };
    }

    // ── Sensor Helpers ────────────────────────────────────────────────────────

    /** Returns true if a game piece is detected by the distance sensor */
    public boolean hasPiece() {
        // return distanceSensor != null &&
        //        distanceSensor.getDistance(DistanceUnit.CM) < PIECE_THRESHOLD_CM;
        return false; // Replace with actual sensor check
    }

    public double getPower() { return intakeServo.getPower(); }
}
