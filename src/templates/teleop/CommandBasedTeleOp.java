package org.firstinspires.ftc.teamcode.teleop;

import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.rowanmcalpin.nextftc.core.Subsystem;
import com.rowanmcalpin.nextftc.core.command.Command;
import com.rowanmcalpin.nextftc.ftc.GamepadEx;
import com.rowanmcalpin.nextftc.ftc.teleop.TeleOpOpMode;

/**
 * Command-Based TeleOp template using NextFTC.
 *
 * Bind gamepad buttons to commands via GamepadEx.
 * Commands are scheduled through CommandManager automatically.
 *
 * @see <a href="https://github.com/rowan-mcalpin/nextftc">NextFTC Documentation</a>
 */
@TeleOp(name = "Command-Based TeleOp", group = "TeleOp")
public class CommandBasedTeleOp extends TeleOpOpMode {

    // ── Subsystem Instances ───────────────────────────────────────────────────────
    // public static final DrivetrainSubsystem drivetrain = new DrivetrainSubsystem();
    // public static final ArmSubsystem arm = new ArmSubsystem();
    // public static final IntakeSubsystem intake = new IntakeSubsystem();

    // ── Gamepads ──────────────────────────────────────────────────────────────────
    public final GamepadEx driver   = new GamepadEx(gamepad1);
    public final GamepadEx operator = new GamepadEx(gamepad2);

    @Override
    public Subsystem[] getSubsystems() {
        return new Subsystem[] {
            // drivetrain,
            // arm,
            // intake
        };
    }

    /**
     * Bind gamepad buttons to commands.
     * Called once when the OpMode initializes.
     */
    @Override
    public void bindButtons() {
        // ── Driver controls ────────────────────────────────────────────────────
        // drivetrain is handled via joystick in DrivetrainSubsystem.periodic()

        // driver.a.onPress(intake.grab());
        // driver.b.onPress(intake.release());
        // driver.rightBumper.onPress(drivetrain.toggleFieldCentric());

        // ── Operator controls ──────────────────────────────────────────────────
        // operator.y.onPress(arm.toHighBasket());
        // operator.a.onPress(arm.toRest());
        // operator.x.onPress(arm.toPickup());
        // operator.leftBumper.onPress(intake.grab());
        // operator.rightBumper.onPress(intake.release());

        // ── D-pad presets ──────────────────────────────────────────────────────
        // operator.dpadUp.onPress(arm.toHighPole());
        // operator.dpadRight.onPress(arm.toMidPole());
        // operator.dpadDown.onPress(arm.toLowPole());
        // operator.dpadLeft.onPress(arm.toGround());
    }
}
