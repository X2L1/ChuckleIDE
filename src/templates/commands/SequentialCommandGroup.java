package org.firstinspires.ftc.teamcode.commands;

import com.rowanmcalpin.nextftc.core.command.Command;
import java.util.Arrays;
import java.util.LinkedList;
import java.util.Queue;

/**
 * SequentialCommandGroup – runs commands one at a time in order.
 * Each command must finish before the next one starts.
 */
public class SequentialCommandGroup extends Command {

    private final Queue<Command> commands;
    private Command current = null;

    public SequentialCommandGroup(Command... commands) {
        this.commands = new LinkedList<>(Arrays.asList(commands));
    }

    @Override
    public void start() {
        advanceToNext();
    }

    @Override
    public void update() {
        if (current == null) return;

        current.update();

        if (current.getDone()) {
            current.end(false);
            advanceToNext();
        }
    }

    @Override
    public boolean getDone() {
        return current == null && commands.isEmpty();
    }

    @Override
    public void end(boolean interrupted) {
        if (current != null) {
            current.end(true);
            current = null;
        }
    }

    private void advanceToNext() {
        current = commands.poll();
        if (current != null) current.start();
    }
}
