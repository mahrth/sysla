# 2. Components and function refinement

How does the system produce the warning observed in stage 1? Start with the composition diagram and trace the path from the camera's USB port to the detector. The camera receives environmental light and delivers an `ImageFrame`. Separate detector outputs carry the warning command to the siren and lamp.

Now find `Function AlarmSystem.startWarning` in [AlarmSystem.sysla](AlarmSystem.sysla). Its two calls are parallel branches. The join means that starting the warning completes once both branches have completed. The scenario still describes this as one step. [User.sysla](User.sysla) uses the same pattern to refine perception.

From the repository root, generate the diagrams and render the PDFs.

```bash
npm run gen -- demos/AlarmSystem/v02-decomposition/Supersystem.sysla --source-root demos
(cd generated/AlarmSystem/v02-decomposition && ./gen-pdfs.sh)
```

Open these PDFs in the generated model folder.

- `Supersystem/AlarmSystem/AlarmSystem_Composition.pdf`
- `Supersystem/AlarmSystem/AlarmSystem_Function_startWarning.pdf`
