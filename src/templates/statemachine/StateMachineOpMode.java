package org.firstinspires.ftc.teamcode.statemachine;

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.util.ElapsedTime;

/**
 * State Machine OpMode – demonstrates a robust enum-based state machine.
 *
 * Benefits over sequential code:
 *   - Non-blocking state transitions
 *   - Easy to add new states without restructuring
 *   - Clear separation of concerns per state
 *   - Can respond to sensor input at any state
 */
@Autonomous(name = "State Machine OpMode", group = "Autonomous")
public class StateMachineOpMode extends LinearOpMode {

    // ── State Enum ────────────────────────────────────────────────────────────
    private enum RobotState {
        INIT,
        DRIVE_FORWARD,
        STRAFE_RIGHT,
        TURN_180,
        SCORE,
        PICKUP,
        RETURN,
        PARK,
        DONE
    }

    // ── Hardware ─────────────────────────────────────────────────────────────
    private DcMotor frontLeft, frontRight, backLeft, backRight;

    // ── State Machine Variables ───────────────────────────────────────────────
    private RobotState currentState = RobotState.INIT;
    private final ElapsedTime stateTimer = new ElapsedTime();

    // ── State Timeouts (seconds) ──────────────────────────────────────────────
    private static final double DRIVE_FORWARD_TIME = 2.0;
    private static final double STRAFE_RIGHT_TIME  = 1.0;
    private static final double TURN_TIME          = 0.8;
    private static final double SCORE_TIME         = 1.5;
    private static final double PICKUP_TIME        = 1.0;

    @Override
    public void runOpMode() throws InterruptedException {
        initHardware();
        telemetry.addData("Status", "Initialized – waiting for start");
        telemetry.update();

        waitForStart();
        stateTimer.reset();
        currentState = RobotState.DRIVE_FORWARD;

        while (opModeIsActive()) {
            runStateMachine();
            telemetry.addData("State", currentState);
            telemetry.addData("State Time", "%.2f s", stateTimer.seconds());
            telemetry.update();

            if (currentState == RobotState.DONE) break;
        }

        stopAllMotors();
        telemetry.addData("Status", "Autonomous Complete");
        telemetry.update();
    }

    private void runStateMachine() {
        switch (currentState) {

            case DRIVE_FORWARD:
                setDrivePowers(0.5, 0.5, 0.5, 0.5);
                if (stateTimer.seconds() >= DRIVE_FORWARD_TIME) {
                    transitionTo(RobotState.STRAFE_RIGHT);
                }
                break;

            case STRAFE_RIGHT:
                setDrivePowers(0.5, -0.5, -0.5, 0.5);
                if (stateTimer.seconds() >= STRAFE_RIGHT_TIME) {
                    transitionTo(RobotState.TURN_180);
                }
                break;

            case TURN_180:
                setDrivePowers(0.4, -0.4, 0.4, -0.4);
                if (stateTimer.seconds() >= TURN_TIME) {
                    transitionTo(RobotState.SCORE);
                }
                break;

            case SCORE:
                stopAllMotors();
                // Trigger scoring mechanism here
                // e.g., liftMotor.setTargetPosition(HIGH_POSITION);
                if (stateTimer.seconds() >= SCORE_TIME) {
                    transitionTo(RobotState.PICKUP);
                }
                break;

            case PICKUP:
                // Drive to pickup zone
                setDrivePowers(-0.4, -0.4, -0.4, -0.4);
                if (stateTimer.seconds() >= PICKUP_TIME) {
                    transitionTo(RobotState.PARK);
                }
                break;

            case PARK:
                setDrivePowers(0.3, 0.3, 0.3, 0.3);
                if (stateTimer.seconds() >= 1.5) {
                    transitionTo(RobotState.DONE);
                }
                break;

            case DONE:
                stopAllMotors();
                break;
        }
    }

    /** Transition to a new state and reset the state timer */
    private void transitionTo(RobotState newState) {
        stopAllMotors();
        currentState = newState;
        stateTimer.reset();
        telemetry.addData("Transitioning to", newState);
    }

    // ── Hardware Helpers ──────────────────────────────────────────────────────
    private void initHardware() {
        frontLeft  = hardwareMap.get(DcMotor.class, "frontLeft");
        frontRight = hardwareMap.get(DcMotor.class, "frontRight");
        backLeft   = hardwareMap.get(DcMotor.class, "backLeft");
        backRight  = hardwareMap.get(DcMotor.class, "backRight");

        frontLeft.setDirection(DcMotorSimple.Direction.REVERSE);
        backLeft.setDirection(DcMotorSimple.Direction.REVERSE);

        frontLeft.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        frontRight.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        backLeft.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        backRight.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
    }

    private void setDrivePowers(double fl, double fr, double bl, double br) {
        frontLeft.setPower(fl);
        frontRight.setPower(fr);
        backLeft.setPower(bl);
        backRight.setPower(br);
    }

    private void stopAllMotors() {
        setDrivePowers(0, 0, 0, 0);
    }
}
