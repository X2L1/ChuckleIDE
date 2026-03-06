package org.firstinspires.ftc.teamcode.commands;

import com.rowanmcalpin.nextftc.core.command.Command;
import com.qualcomm.robotcore.hardware.Gamepad;

/**
 * DriveCommand – reads gamepad and drives the drivetrain each loop iteration.
 *
 * This command never ends naturally; it runs until interrupted.
 * Bind to a subsystem's default command for TeleOp driving.
 */
public class DriveCommand extends Command {

    private final Gamepad gamepad;
    private final double speedMultiplier;

    /**
     * @param gamepad         The gamepad to read input from
     * @param speedMultiplier Scale factor for all motor powers (0.0–1.0)
     */
    public DriveCommand(Gamepad gamepad, double speedMultiplier) {
        this.gamepad = gamepad;
        this.speedMultiplier = speedMultiplier;
    }

    public DriveCommand(Gamepad gamepad) {
        this(gamepad, 1.0);
    }

    @Override
    public void start() {
        // Nothing to initialize
    }

    @Override
    public void update() {
        double y  = -gamepad.left_stick_y;
        double x  =  gamepad.left_stick_x * 1.1;
        double rx =  gamepad.right_stick_x;

        // Reduce speed when right bumper held
        double speed = gamepad.right_bumper ? 0.35 : speedMultiplier;

        double denom = Math.max(Math.abs(y) + Math.abs(x) + Math.abs(rx), 1);
        double fl = (y + x + rx) / denom * speed;
        double fr = (y - x - rx) / denom * speed;
        double bl = (y - x + rx) / denom * speed;
        double br = (y + x - rx) / denom * speed;

        // Pass powers to drivetrain subsystem
        // DrivetrainSubsystem.INSTANCE.setMotorPowers(fl, fr, bl, br);
    }

    /** This command never ends on its own */
    @Override
    public boolean getDone() {
        return false;
    }

    @Override
    public void end(boolean interrupted) {
        // Stop the drivetrain when command ends
        // DrivetrainSubsystem.INSTANCE.setMotorPowers(0, 0, 0, 0);
    }
}
