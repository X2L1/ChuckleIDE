package org.firstinspires.ftc.teamcode.commands;

import com.rowanmcalpin.nextftc.core.command.Command;

/**
 * ArmCommand – moves the arm to a specified encoder position.
 * Completes when the arm reaches within tolerance of the target.
 */
public class ArmCommand extends Command {

    private final int targetPosition;
    private final double power;
    private static final int TOLERANCE = 20;

    public ArmCommand(int targetPosition, double power) {
        this.targetPosition = targetPosition;
        this.power = power;
    }

    public ArmCommand(int targetPosition) {
        this(targetPosition, 0.8);
    }

    @Override
    public void start() {
        // ArmSubsystem.INSTANCE.moveTo(targetPosition, power);
    }

    @Override
    public boolean getDone() {
        // return ArmSubsystem.INSTANCE.isAtTarget();
        return true; // Replace with actual check
    }

    @Override
    public void end(boolean interrupted) {
        if (!interrupted) {
            // ArmSubsystem.INSTANCE.holdPosition();
        }
    }
}
