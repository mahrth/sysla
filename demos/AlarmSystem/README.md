# Alarm system tutorial

Follow one alarm system from its external functions to the behavior of its detector. Each folder contains a complete model. Start with the stage README for a reading path, a question to explore and the diagrams to open.

1. [Functions at the system boundary](v01-functional-context/README.md)
2. [Components and function refinement](v02-decomposition/README.md)
3. [States and events](v03-state-machine/README.md)
4. [Integrated behavior](v04-integrated-behavior/README.md)

Function names use lowerCamelCase, for example `monitorEnvironment()` and `isReady()`.

## Generating a stage

Run the commands from the repository root after building Sysla. Each stage uses `Supersystem.sysla` as its entry file. With `--source-root demos`, the CLI mirrors the stage folder under `generated/AlarmSystem/`. Run the generated PDF script from that folder. For example:

```bash
npm run gen -- demos/AlarmSystem/v01-functional-context/Supersystem.sysla --source-root demos
(cd generated/AlarmSystem/v01-functional-context && ./gen-pdfs.sh)
```
