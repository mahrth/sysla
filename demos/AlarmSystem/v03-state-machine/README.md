# 3. States and events

When does detection change the behavior of the alarm system? Trace the state machine in [AlarmSystem.sysla](AlarmSystem.sysla) from its initial state `Off`. After `SwitchOnRequested`, the system is in `Normal`. Only from there can `AlarmDetected` move it into `Alarm`.

Follow the two arrows out of `Alarm`. A reset restores monitoring, while switching off takes the system to `Off`. [Supersystem.sysla](Supersystem.sysla) declares `ResetCommand as Event`, so reception of that signal can trigger a transition directly. The other triggers are named events. Their origins and the actions on state changes are introduced in stage 4.

From the repository root, generate the diagrams and render the PDFs.

```bash
npm run gen -- demos/AlarmSystem/v03-state-machine/Supersystem.sysla --source-root demos
(cd generated/AlarmSystem/v03-state-machine && ./gen-pdfs.sh)
```

Open these PDFs in the generated model folder.

- `Supersystem/AlarmSystem/AlarmSystem_StateMachine_AlarmBehavior.pdf`
