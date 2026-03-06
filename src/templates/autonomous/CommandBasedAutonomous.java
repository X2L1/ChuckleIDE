package org.firstinspires.ftc.teamcode.autonomous;

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.rowanmcalpin.nextftc.core.Subsystem;
import com.rowanmcalpin.nextftc.core.command.Command;
import com.rowanmcalpin.nextftc.core.command.CommandManager;
import com.rowanmcalpin.nextftc.core.command.groups.ParallelCommandGroup;
import com.rowanmcalpin.nextftc.core.command.groups.SequentialCommandGroup;
import com.rowanmcalpin.nextftc.ftc.OpModeData;
import com.rowanmcalpin.nextftc.ftc.autonomous.AutonomousOpMode;

/**
 * Command-Based Autonomous Template using NextFTC.
 *
 * This template demonstrates the NextFTC command-based architecture:
 * - Subsystems encapsulate hardware and state
 * - Commands describe actions and their lifecycle
 * - CommandManager schedules and runs commands
 *
 * @see <a href="https://github.com/rowan-mcalpin/nextftc">NextFTC Documentation</a>
 */
@Autonomous(name = "Command-Based Autonomous", group = "Autonomous")
public class CommandBasedAutonomous extends AutonomousOpMode {

    // ── Subsystem Instances ───────────────────────────────────────────────────────
    // Uncomment and replace with your actual subsystems:
    // public static final DrivetrainSubsystem drivetrain = new DrivetrainSubsystem();
    // public static final ArmSubsystem arm = new ArmSubsystem();
    // public static final IntakeSubsystem intake = new IntakeSubsystem();

    /**
     * Declare all subsystems that this OpMode uses.
     * NextFTC will initialize them in the correct order.
     */
    @Override
    public Subsystem[] getSubsystems() {
        return new Subsystem[] {
            // drivetrain,
            // arm,
            // intake
        };
    }

    /**
     * Return the top-level command that runs the full autonomous routine.
     * This is typically a SequentialCommandGroup containing all actions.
     */
    @Override
    public Command getAutoCommand() {
        return new SequentialCommandGroup(
            // Phase 1: Preload scoring
            // new SequentialCommandGroup(
            //     arm.toHighBasket(),
            //     drivetrain.followPath(scoringPath),
            //     intake.score(),
            //     arm.toRest()
            // ),

            // Phase 2: Cycle (pick up + score)
            // new SequentialCommandGroup(
            //     drivetrain.followPath(pickupPath),
            //     intake.grab(),
            //     drivetrain.followPath(scoringPath),
            //     intake.score()
            // ),

            // Phase 3: Park
            // drivetrain.followPath(parkPath),

            // Placeholder – remove this when you add real commands
            new WaitCommand(500)
        );
    }

    // ── Utility Inner Commands ────────────────────────────────────────────────────

    /** Waits for a specified number of milliseconds */
    public static class WaitCommand extends Command {
        private final long waitMs;
        private long startTime;

        public WaitCommand(long waitMs) {
            this.waitMs = waitMs;
        }

        @Override
        public void start() {
            startTime = System.currentTimeMillis();
        }

        @Override
        public boolean getDone() {
            return System.currentTimeMillis() - startTime >= waitMs;
        }
    }

    /** Runs a Runnable as a one-shot command */
    public static class RunOnce extends Command {
        private final Runnable action;
        private boolean done = false;

        public RunOnce(Runnable action) {
            this.action = action;
        }

        @Override
        public void start() {
            action.run();
            done = true;
        }

        @Override
        public boolean getDone() { return done; }
    }

    /** Runs a command for a fixed duration, then stops */
    public static class TimeoutCommand extends Command {
        private final Command inner;
        private final long timeoutMs;
        private long startTime;

        public TimeoutCommand(Command inner, long timeoutMs) {
            this.inner = inner;
            this.timeoutMs = timeoutMs;
        }

        @Override
        public void start() {
            startTime = System.currentTimeMillis();
            CommandManager.INSTANCE.scheduleCommand(inner);
        }

        @Override
        public boolean getDone() {
            return inner.getDone() || System.currentTimeMillis() - startTime >= timeoutMs;
        }
    }
}
