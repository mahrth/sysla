# 1. Functions at the system boundary

Which functions does the alarm system offer its neighbors? Open the functional context diagram first. The box encloses the three functions visible from outside. The user both interacts with and observes the monitoring function. Movement in the environment contributes to monitoring in one direction.

Read the `FunctionalContext` and `Scenario` in [Supersystem.sysla](Supersystem.sysla) side by side. The indented declaration `Scenario MotionAlarmAndReset` belongs to `Component Supersystem`. Its qualified definition, `Scenario Supersystem.MotionAlarmAndReset`, starts at the left margin. The scenario follows one armed installation with a warning lamp. Its five steps use functions declared on the participating components. Compare `resetAlarm` in the context with `user.reset` in the scenario. One names the service the alarm offers, the other the user's action.

In the supersystem composition diagram, follow the connections across the alarm system boundary. The environment supplies light to the camera port. The user operates the switch and reset button and perceives the warning tone and light. The next stage opens the alarm system to show its internal parts.

From the repository root, generate the diagrams and render the PDFs.

```bash
npm run gen -- demos/AlarmSystem/v01-functional-context/Supersystem.sysla --source-root demos
(cd generated/AlarmSystem/v01-functional-context && ./gen-pdfs.sh)
```

Open these PDFs in the generated model folder.

- `Supersystem/Supersystem_FunctionalContext_AlarmContext.pdf`
- `Supersystem/Supersystem_Scenario_MotionAlarmAndReset.pdf`
- `Supersystem/Supersystem_Composition.pdf`
