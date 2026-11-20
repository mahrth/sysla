# 4. Integrated behavior

How does a camera frame lead to a warning? Start in [Detector.sysla](Detector.sysla). The first frame initializes the average. In the loop, the detector compares each new frame with the previous average, emits `MotionDetected` when the threshold is exceeded, then updates the average on either path.

Follow `Event AlarmDetected from detector.MotionDetected` in [AlarmSystem.sysla](AlarmSystem.sysla). In `Normal` that event triggers the transition to `Alarm`. The entry action calls the familiar `startWarning`. Leaving `Alarm` calls `stopWarning`. The comments on the four warning functions identify the corresponding detector outputs.

Trace the transition from `Off` to `Normal` separately. Which camera query guards it, and why does `logStart()` run on this transition but not when a reset returns the system to `Normal`? Compare that guard with the `requires` condition on `evaluateObservation`, which constrains when a function may start.

From the repository root, generate the diagrams and render the PDFs.

```bash
npm run gen -- demos/AlarmSystem/v04-integrated-behavior/Supersystem.sysla --source-root demos
(cd generated/AlarmSystem/v04-integrated-behavior && ./gen-pdfs.sh)
```

Open these PDFs in the generated model folder.

- `Supersystem/AlarmSystem/Detector/Detector_Function_monitorFrames.pdf`
- `Supersystem/AlarmSystem/AlarmSystem_StateMachine_AlarmBehavior.pdf`
