# ioBroker.apsystems-easypower

![Adapter icon](admin/apsystems-easypower.png)

ioBroker adapter for the **APsystems EasyPower Cloud API** used by **EZ1 / EZ1-M micro-inverters**.

The adapter uses the same encrypted cloud API as the official EasyPower app. Therefore, **no local network access to the inverter is required** — only a working EasyPower account.

> **Important:** The EasyPower API is not an officially documented public API. The login, encryption scheme and API protocol are based on community reverse-engineering of the official EasyPower APK.

## Features

* Access APsystems EZ1 / EZ1-M micro-inverters through the EasyPower Cloud
* No local network connection to the inverter required
* EasyPower username/password authentication
* Configurable polling interval
* Realtime AC power values
* Per-channel power values
* Daily, monthly and lifetime energy values
* Inverter online/communication status
* Last update timestamp
* Last error information
* Device metadata such as alias, model and device ID
* Proper ioBroker device/channel/state hierarchy
* System and inverter names can be freely renamed in the ioBroker Objects view

## Installation

The adapter is currently **not listed in the official ioBroker adapter repository**.

Therefore, installation is currently done directly from GitHub or using a generated `.tgz` package.

### Option A — Admin GUI, directly from GitHub

Recommended for installation and updates.

In ioBroker Admin:

**Adapter List → Install from URL → GitHub "Cat" Button → Custom**

Enter:

```text
https://github.com/speefak/ioBroker.apsystems-easypower
```

Then select **Install**.

For an update, run the same dialog again using the same URL.

If npm uses a stale cached version, append:

```text
#master
```

to explicitly select the `master` branch.

> Because the adapter is not listed in the official ioBroker repository, the Admin interface may not display an "update available" notification after a new GitHub release.

### Option B — Install from a `.tgz` package

On any machine with Node.js/npm and the cloned repository:

```bash
cd ioBroker.apsystems-easypower
npm pack
```

This creates a package similar to:

```text
iobroker.apsystems-easypower-X.Y.Z.tgz
```

In ioBroker Admin:

**Adapter List → Install from URL → From File**

Select the generated `.tgz` file and install it.

> Use a **Tarball (.tgz)**. Do not upload a ZIP file.

For an update, create a new package with `npm pack` and upload the new `.tgz` again.

### Option C — Installation from the shell

For direct installation or on-site debugging:

```bash
sudo iobroker stop apsystems-easypower.0

cd /opt/iobroker/node_modules

sudo -u iobroker git clone \
  https://github.com/speefak/ioBroker.apsystems-easypower.git \
  iobroker.apsystems-easypower

cd iobroker.apsystems-easypower

sudo -u iobroker npm install --omit=dev

iobroker upload apsystems-easypower
iobroker add apsystems-easypower
iobroker start apsystems-easypower.0
```

For an update:

```bash
sudo iobroker stop apsystems-easypower.0

cd /opt/iobroker/node_modules/iobroker.apsystems-easypower

sudo -u iobroker git pull
sudo -u iobroker npm install --omit=dev

iobroker upload apsystems-easypower
iobroker start apsystems-easypower.0
```

After installation, enter the EasyPower username and password in the adapter instance configuration.

> **Important:** The installation directory must be exactly:
>
> `iobroker.apsystems-easypower`
>
> The npm/ioBroker tooling is case-sensitive.

## Configuration

The adapter provides the following configuration options:

| Option                         | Description                                 |
| ------------------------------ | ------------------------------------------- |
| **EasyPower username / email** | Username or email used by the EasyPower app |
| **EasyPower password**         | Password used by the EasyPower app          |
| **Poll interval**              | Polling interval from 1–1440 minutes        |
| **Strict TLS**                 | Strict TLS certificate validation           |

The default polling interval is **5 minutes**.

Do not normally use intervals below 1 minute. The cloud service does not refresh the data faster, and aggressive polling may result in rate limiting or account problems.

The password is encrypted and protected by the ioBroker adapter configuration mechanism.

### Strict TLS

Strict TLS certificate validation can be enabled when required.

The EasyPower cloud has historically presented certificates that are not always compatible with strict TLS validation. Therefore, this option is disabled by default.

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

This follows the standard ioBroker hierarchy:

```text
device
└── channel
    └── state
```

## Data points

| State                      | Description                        | Role / Unit           |
| -------------------------- | ---------------------------------- | --------------------- |
| `realtime.power`           | Current total AC power             | `value.power` / W     |
| `realtime.power1`          | Current AC power, channel 1        | `value.power` / W     |
| `realtime.power2`          | Current AC power, channel 2        | `value.power` / W     |
| `statistic.todayEnergy`    | Energy generated today             | `value.energy` / kWh  |
| `statistic.monthEnergy`    | Energy generated this month        | `value.energy` / kWh  |
| `statistic.lifetimeEnergy` | Lifetime energy yield              | `value.energy` / kWh  |
| `statistic.lastPower`      | Last known power value             | `value.power` / W     |
| `online`                   | Inverter communication status      | `indicator.reachable` |
| `info.connection`          | Adapter/cloud connection status    | `indicator.connected` |
| `info.alias`               | Inverter alias                     | `text`                |
| `info.model`               | Inverter model                     | `text`                |
| `info.devId`               | Inverter device ID                 | `text`                |
| `lastUpdate`               | Time of the last successful update | `date` / Unix ms      |
| `lastError`                | Last error message                 | `text`                |

## Renaming devices and systems

System and inverter objects are created with a `common.name` property.

Their names can therefore be freely changed in the **ioBroker Objects** view.

The adapter does not overwrite these names during the next polling cycle.

This allows meaningful local names such as:

```text
Balkon
Garage
Süddach
Wechselrichter 1
```

instead of using only the system or inverter IDs.

## API implementation

The adapter communicates with the APsystems EasyPower Cloud API.

The login and encryption implementation is based on the community reverse-engineered implementation used by:

* [node-red-contrib-apsystems-easypower](https://github.com/Graefer/node-red-contrib-apsystems-easypower)
* [apsystems-easypower-ha](https://github.com/Meyblaubaer/apsystems-easypower-ha)

The implementation uses, among other things:

* RSA-wrapped AES-256-CBC credential encryption
* EasyPower `app_id`
* EasyPower `app_secret`
* API endpoints derived from the official EasyPower application
* RSA public key extracted from the EasyPower APK

These values are application constants extracted from the APK.

> **Important:** APsystems can change the API, authentication mechanism, encryption or application constants at any time.

If APsystems changes these values or the API protocol, authentication or data retrieval may stop working until the implementation is updated.

## API limitations

The adapter depends entirely on the EasyPower Cloud API.

This means:

* The inverter does not need to be reachable from the local network.
* The adapter requires Internet access.
* Data availability depends on the EasyPower cloud.
* Cloud outages can temporarily prevent updates.
* APsystems may change the API without notice.
* Excessive polling should be avoided.

## Development

### Requirements

* Node.js **>= 22**
* ioBroker
* npm

Install dependencies:

```bash
npm install
```

Basic syntax checks:

```bash
node --check main.js
node --check lib/apsystems-api.js
```

The adapter uses:

```text
@iobroker/adapter-core
```

and follows the current ioBroker object/state schema.

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

This project is provided free of charge for the open-source community.

### Donations

If you find the adapter useful and would like to support future development:

```text
Bitcoin (BTC):
33AXe8Z8XBuGKx9eHHmGnvbawrNYjSgDcM

Ethereum (ETH):
0xa61d178EA84C2200A8617b51B4bCf98F87ff59Ff

Solana (SOL):
BDf5EgsN8fRUicYzeM8cuaNhL7zdty2qsEjmC2jA4Fm

Ripple (XRP):
rLHzPsX6oXkzU2qL12kHCH8G8cnZv1rBJh

Cardano (ADA):
addr1q8anur2wvvc6pv3cpp30vv05makyra8huh0lk0yhdk6hcnlrzr27g03klu862usxqsru794d03gzkk8n86ta34n85z0svn5ams

USDT:
0xa61d178EA84C2200A8617b51B4bCf98F87ff59Ff
```

Thank you for supporting open-source development.

