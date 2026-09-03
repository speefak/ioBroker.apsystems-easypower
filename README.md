# ioBroker.apsystems-easypower

ioBroker adapter for the **APsystems EasyPower** cloud API used by EZ1 / EZ1-M micro-inverters.

The adapter uses the EasyPower cloud API and therefore does not require local network access to the inverter.

## Data point structure

Each EasyPower system is represented as an ioBroker `folder`. Each inverter is represented as a `device`, with `channel` objects for information, realtime values and statistics.

```text
apsystems-easypower.0
├── info
│   └── connection
├── <systemId>                         folder
│   └── <inverterDevId>                device
│       ├── info                        channel
│       │   ├── alias
│       │   ├── model
│       │   └── devId
│       ├── realtime                    channel
│       │   ├── power
│       │   ├── power1
│       │   └── power2
│       ├── statistic                   channel
│       │   ├── todayEnergy
│       │   ├── monthEnergy
│       │   ├── lifetimeEnergy
│       │   └── lastPower
│       ├── online
│       ├── lastError
│       └── lastUpdate
```

## Configuration

- EasyPower username / email
- EasyPower password
- Poll interval: 10–86400 seconds, default 300 seconds
- Strict TLS certificate validation

The password is encrypted and protected in the ioBroker adapter configuration.

## Installation

For direct local installation, build a tarball with:

```bash
npm pack
```

Then install the generated `.tgz` from ioBroker Admin → Adapters → Custom Install → From File.

## Development

Requires Node.js >= 22.

```bash
npm install
npm run lint
npm run type-check
npm test
```

## API implementation

The EasyPower login and API protocol are based on community reverse-engineering of the official Android app. The API is not an officially documented public API.

## Changelog

### 0.2.3

- Completed repository CI/CD and developer-tooling setup.
- Added current ESLint/Prettier, TypeScript, release and VS Code configuration.
- Added complete translations for the current release.
- Added npm/package-lock metadata and package validation test.

### 0.2.2

- Fixed numeric API values being returned as strings while ioBroker states are declared as numbers.

### 0.2.1

- Poll interval is configured in seconds instead of minutes.
- Existing instances are migrated automatically on first start.

### 0.2.0

- Normalized object/state schema and current adapter metadata.
- Improved polling lifecycle and state definitions.

For older entries see [CHANGELOG_OLD.md](CHANGELOG_OLD.md).

## License

MIT License

Copyright (c) 2026 Speefak
