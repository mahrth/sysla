# SysLa

SysLa – A Textual DSL for AI-Assisted Model-Based Systems Engineering

SysLa describes the structure of hardware and software systems in text files
with the `.sysla` extension. Components have ports, contain instances of other
components, and connect or delegate their interfaces. The language is built
with Langium and TypeScript.

The current implementation supports editing and validating models in
VSCodium/VS Code and generating text summaries and system diagrams as
Graphviz DOT files and PDFs. Hardware and software use the same modeling
constructs. Simulation, behavioral modeling, and generation of executable
software for the modeled systems are not implemented yet.

Jump to: [Quick start](#quick-start) · [Installation](#installation-and-prerequisites) · [Editor](#starting-the-sysla-editor) · [Language](#writing-a-model) · [Diagrams and PDFs](#generating-diagrams-and-pdfs) · [Development](#developing-sysla) · [Troubleshooting](#known-limitations-and-troubleshooting)

## Quick start

Prerequisites: Git, Node.js, npm, Graphviz, and VSCodium or VS Code for the editor.
Run project commands from the repository root unless instructed otherwise.

```bash
git clone https://github.com/mahrth/sysla.git
cd sysla
npm install
npm run langium:generate
npm run build
npm run gen -- demos/Computer/Computer.sysla
```

Output is written to `generated/Computer/`. Generate PDFs:

```bash
cd generated/Computer
./gen-pdfs.sh
cd ../..
```

Start the editor:

```bash
codium .
```

In VSCodium, open **Run and Debug** (`Ctrl+Shift+D`), select **Run Extension (No Debug)**, and press `F5`. Open `demos/Computer/Computer.sysla` in the new window. For VS Code, use `code .` instead; the remaining steps are the same.

## Installation and prerequisites

### Node.js, npm, and Graphviz

The language and CLI packages require at least Node.js `20.10.0` and npm `10.2.3`.
The Volta entries in the package manifests record the original development
environment: Node.js `20.19.2` and npm `10.8.2`. When the project was set up again
in October 2026, grammar generation and the build also worked with Node.js `24.18.0` and npm `11.16.0`.

Graphviz provides the `dot` command for PDF generation. On Ubuntu:

```bash
sudo apt install graphviz
```

Check your installations:

```bash
node --version
npm --version
dot -V
```

Python and pip are not required for the regular SysLa build.
Running `npm install` from the repository root installs the dependencies
for all three workspace packages. `npm ci` requires an existing `package-lock.json` that matches the package manifests; the lockfile is currently not tracked in this repository.

### VSCodium or VS Code on Ubuntu

A native DEB/APT installation is recommended for this workflow.
VSCodium provides packages named `codium_…_amd64.deb` for x86-64 machines on its
[releases page](https://github.com/VSCodium/vscodium/releases).
Run this command from the download directory:

```bash
sudo apt install ./codium_*_amd64.deb
```

For automatic updates, configure the repository using the [VSCodium installation instructions](https://vscodium.com/install). Alternatively, install VS Code as a DEB/APT package using the [official Linux instructions](https://code.visualstudio.com/docs/setup/linux).

Flatpak uses an additional runtime environment, which may prevent direct access
to development tools installed on the host. This can cause differences between
the Linux terminal and the integrated terminal. The [VS Code Flatpak documentation](https://github.com/flathub/com.visualstudio.code)
describes SDK extensions and how to use a host shell. The official [VS Code Snap](https://snapcraft.io/code) uses `--classic` and does not use the same sandbox as Flatpak.

On Ubuntu, a VSCodium Anylinux AppImage displayed a prompt to disable the
user namespace restriction system-wide through `/etc/sysctl.d/20-fix-namespaces.conf`. A native VSCodium installation was used instead for the setup described here. Ubuntu uses AppArmor to restrict user namespaces to explicitly permitted applications. If needed, prefer an application-specific permission for the editor over disabling the restriction system-wide. See the [Ubuntu AppArmor documentation](https://documentation.ubuntu.com/security/security-features/privilege-restriction/apparmor/). Using `--no-sandbox` is also not recommended as a permanent solution.

If tool versions differ between the two terminals, compare:

```bash
type -a node npm python3
node --version
npm --version
```

Also check the shell, its startup files, `PATH`, and any activated Python virtual environments.

## Starting the SysLa editor

The SysLa extension is located in `packages/extension`. This workflow loads it directly from the source project; publishing it or installing it from an extension marketplace is not required.

1. Open the entire repository root with `codium .` or `code .`.
2. For the initial setup, run `npm run langium:generate` and `npm run build` in the integrated terminal.
3. Open **Run and Debug** (`Ctrl+Shift+D`).
4. Select **Run Extension (No Debug)** and press `F5`.
5. In the second window, the Extension Development Host, open a `.sysla` file or your model folder.

Launching the extension automatically runs the `build` task. The second window provides syntax highlighting, completion, reference navigation, and diagnostics for SysLa. For a model spread across multiple files, open their shared model folder so the language server can find all of them.

**Run Extension (Debug Mode)** sets `DEBUG_BREAK=1`, causing the language server to wait for a debugger. During development, use **Attach to Language Server** after launching it, or use the combined configuration **Run Extension + Attach to Server**. For normal model editing, choose **No Debug**.

Launch configurations are defined in [.vscode/launch.json](.vscode/launch.json), and build tasks in [.vscode/tasks.json](.vscode/tasks.json).

## Writing a model

A complete small example:

```sysla
Signal Data

Component Source
    Port Value Output Data

Component Sink
    Port Value Input Data

Component Device
    Port Value Input Data
    Part Sink as sink
    Delegation Value - sink:Value

Component System
    Part Source as source
    Part Device as device
    Connection source:Value - device:Value
```

`System` contains the instances `source` and `device`. The source supplies `Data` to the input port of `device`. That external port is delegated to the input port of the internal instance `sink`.

| Construct     | Meaning                                                | Example                                  |
| ------------- | ------------------------------------------------------ | ---------------------------------------- |
| `Signal`      | Named signal type, such as data, heat, or voltage      | `Signal Data`                            |
| `Component`   | Reusable component definition                          | `Component Source`                       |
| `Port`        | Interface with an optional direction and signal type   | `Port Value Output Data`                 |
| `Part … as …` | Instance of a component inside another component       | `Part Source as source`                  |
| `Connection`  | Connection between ports of two internal instances     | `Connection source:Value - device:Value` |
| `Delegation`  | Delegation of an external port to an internal instance | `Delegation Value - sink:Value`          |

Keywords are English and case-sensitive. The syntax uses no braces or semicolons; indentation is for readability. A new `Component` starts the next component definition. Names start with a letter or `_` and may include digits after the first character. Comments use `//` or `/* … */`.

A port can be `Input`, `Output`, or `Bidirectional`. If a direction is specified, a signal type must follow. Ports without a direction or signal type can be used for mechanical connections, for example:

```text
Port Screw
Port RJ45 [Port Ethernet] Bidirectional Data
```

Subports such as `Ethernet` can be represented. Connections and delegations currently resolve only ports defined directly on the component; addressing nested subports is not implemented. A `Signal` defines a name, not values, units, or calculations.

### Validation rules

The editor checks references and model rules including the following:

- Both ports of a connection or delegation must have the same signal type, or neither port may have a signal type.
- Directed connections pair `Output` with `Input`.
- Delegations require matching directions: `Input` to `Input`, `Output` to `Output`.
- A bidirectional port can only be paired with another bidirectional port.
- A port on an instance cannot be connected more than once or be both connected and delegated. An external port can only be delegated once.

The implementation is in [sysla-validator.ts](packages/language/src/sysla-validator.ts).

### Splitting models across files

The CLI automatically loads all `.sysla` files directly in the directory of the specified file. No `import` statements are needed. This CLI loading mechanism does not search subdirectories recursively.

Keep related definitions in one folder and independent models in separate folders. The selected file determines the output folder name; all models in the same directory are processed. See [demos/DemoMulti1](demos/DemoMulti1) for a complete example.

## Generating diagrams and PDFs

From the repository root, in the Linux terminal or the integrated terminal:

```bash
npm run gen -- demos/Computer/Computer.sysla
```

Alternatively, invoke the CLI directly:

```bash
node packages/cli/bin/cli.js generate demos/Computer/Computer.sysla
```

By default, output is written to `generated/<filename>/`, relative to the current working directory. Dots and hyphens are removed from the base name.
Component folders reflect the part hierarchy, for example:

```text
generated/Computer/
├── Computer.txt
├── gen-pdfs.sh
└── Supersystem/
    ├── Supersystem_Decomposition.dot
    ├── Supersystem_Composition.dot
    ├── Supersystem_Composition_computer.dot
    └── Computer/
        ├── Computer_Decomposition.dot
        └── Computer_Composition.dot
```

| Output                         | Contents                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `<filename>.txt`               | Summary of all signals, components, ports, parts, connections, and delegations |
| `*_Decomposition.dot`          | Decomposition of a component into its own ports and parts                      |
| `*_Composition.dot`            | Structure showing part ports, signal types, and delegations                    |
| `*_Composition_<instance>.dot` | Connections between an instance and its immediate neighbors                    |
| `gen-pdfs.sh`                  | Script that recursively converts all DOT files in the output folder to PDFs    |

The general composition views do not draw `Connection` relationships as individual connection edges; use the composition views for individual instances to inspect those relationships. Identical signal types are represented by shared signal nodes in the diagrams.

Generate PDFs:

```bash
cd generated/Computer
./gen-pdfs.sh
```

Run the script from the generated model folder. PDFs are written next to the DOT files. After changing a model, run the CLI again and then regenerate the PDFs. The script alone does not read `.sysla` files.

To specify a different output directory, run this from the repository root:

```bash
npm run gen -- /path/MyModel.sysla -d /path/diagrams
```

The results are written to `/path/diagrams/MyModel/`.

## Examples and local models

| Example                                         | Purpose                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| [Demo1](demos/Demo1/Demo1.sysla)                | Small model with a hierarchy, connections, and delegations        |
| [DemoMulti1](demos/DemoMulti1/DemoMulti1.sysla) | The same model split across several files                         |
| [Computer](demos/Computer/Computer.sysla)       | Larger example with mechanical, directed, and bidirectional ports |

`generated/`, `node_modules/`, build output, and Langium-generated sources are excluded through `.gitignore` and can be regenerated. Keep private model sources outside these output folders, exclude them from Git locally if needed, and back them up separately.

## Developing SysLa

| Path                                                                                           | Purpose                                                     |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [packages/language/src/sysla.langium](packages/language/src/sysla.langium)                     | Grammar and starting point for language development         |
| [packages/language/src/sysla-scope-provider.ts](packages/language/src/sysla-scope-provider.ts) | Resolution of instance and port references in their context |
| [packages/language/src/sysla-validator.ts](packages/language/src/sysla-validator.ts)           | Semantic validation rules                                   |
| [packages/language/src/sysla-module.ts](packages/language/src/sysla-module.ts)                 | Language service registration                               |
| [packages/cli/src](packages/cli/src)                                                           | Model loading, text output, and diagram generators          |
| [packages/extension/src](packages/extension/src)                                               | VSCodium/VS Code extension and language server              |

After changing the grammar:

```bash
npm run langium:generate
npm run build
```

`npm run build` alone does not regenerate the grammar. Files under `packages/language/src/generated/` are generated from the grammar and should
not be edited manually.

For ongoing development, use two terminals:

```bash
npm run langium:watch
```

```bash
npm run watch
```

The second command watches TypeScript compilation. After changing the extension,
also run `npm run build` and restart the Extension Development Host so that the bundled `.cjs` files are updated as well.

## Known limitations and troubleshooting

- **CLI reports success for an invalid model:** The active CLI loading path runs validation but currently does not abort when diagnostics are reported. A success message therefore does not guarantee a valid model. Fix errors in the editor before generating output. The message “JavaScript code generated successfully” is leftover template text; the actual output consists of text and DOT files.
- **Tests:** `npm test` is configured but currently fails with “No test suite found” because all three test files contain commented-out templates. There are no active automated language tests yet.
- **Editor does not recognize SysLa:** Open the file in the second window launched with `F5` and check that its extension is `.sysla`.
- **References to other files are missing:** Open the shared model folder in the Extension Development Host. For the CLI, files must be directly in the same directory.
- **Language server waits on startup:** Use **Run Extension (No Debug)** or attach the debugger to the debug configuration.
- **Build cannot find generated files:** Run `npm run langium:generate` before `npm run build`. Warnings about the unused rules `INT` and `STRING` do not prevent grammar generation.
- **`dot: not found`:** Install Graphviz and check `dot -V` in the terminal you are using.
- **Old diagrams remain:** Generation overwrites current files but does not remove files for deleted or renamed model elements. If needed, delete the relevant generated model folder and regenerate it. Do not store manually maintained files there.
- **Components used more than once:** Hierarchical output generates diagrams
  once per component definition, under the first path visited. Individual
  instances appear in their parent component's diagrams.

See [LICENSE](LICENSE) for the license.
