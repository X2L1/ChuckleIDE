package org.firstinspires.ftc.teamcode.teleop;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorSimple;

/**
 * Basic TeleOp OpMode with tank drive or arcade drive.
 */
@TeleOp(name = "Basic TeleOp", group = "TeleOp")
public class BasicTeleOp extends LinearOpMode {

    private DcMotor frontLeft, frontRight, backLeft, backRight;

    @Override
    public void runOpMode() throws InterruptedException {
        frontLeft  = hardwareMap.get(DcMotor.class, "frontLeft");
        frontRight = hardwareMap.get(DcMotor.class, "frontRight");
        backLeft   = hardwareMap.get(DcMotor.class, "backLeft");
        backRight  = hardwareMap.get(DcMotor.class, "backRight");

        frontLeft.setDirection(DcMotorSimple.Direction.REVERSE);
        backLeft.setDirection(DcMotorSimple.Direction.REVERSE);

        telemetry.addData("Status", "Initialized");
        telemetry.update();
        waitForStart();

        while (opModeIsActive()) {
            double y  = -gamepad1.left_stick_y;
            double x  =  gamepad1.left_stick_x * 1.1;
            double rx =  gamepad1.right_stick_x;

            double denom = Math.max(Math.abs(y) + Math.abs(x) + Math.abs(rx), 1);
            frontLeft.setPower((y + x + rx) / denom);
            frontRight.setPower((y - x - rx) / denom);
            backLeft.setPower((y - x + rx) / denom);
            backRight.setPower((y + x - rx) / denom);

            telemetry.addData("Status", "Running");
            telemetry.update();
        }
    }
}
