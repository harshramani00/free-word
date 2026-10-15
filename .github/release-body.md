Quill is a free, open-source Word alternative for macOS. It opens and saves real **.docx** files, exports **PDF**, and runs entirely on your Mac: no account, no telemetry, no AI. Cloud sync and Claude access are optional and self-hosted; see the README.

## Install

Download the `.dmg` below (macOS on Apple Silicon), open it and drag **Quill** to Applications.

The build is not notarised with Apple, so macOS warns the first time. Right-click the app and choose **Open**, or run:

```bash
xattr -d com.apple.quarantine /Applications/Quill.app
```

## Quill Cloud server

`quill-cloud-server.mjs` is the optional sync + Claude (MCP) server, one file that runs on Node 22.13+ (Node 24 recommended). Setup for a Windows machine is in `server/deploy/README.md`.
