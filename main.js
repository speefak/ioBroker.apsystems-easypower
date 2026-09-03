'use strict';

/**
 * ioBroker.apsystems-easypower
 * Author: Speefak
 * License: MIT
 */

const utils = require('@iobroker/adapter-core');
const { APSystemsAPI, APSystemsInverterOfflineError } = require('./lib/apsystems-api');

class ApsystemsEasypower extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'apsystems-easypower' });
        this.api = null;
        this.pollTimer = null;
        this.pollInProgress = false;
        this.pollIntervalMs = 300 * 1000;

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        if (!this.config.username || !this.config.password) {
            this.log.error('Username/password not set - open the adapter configuration.');
            return;
        }

        await this.migratePollIntervalToSeconds();
        this.api = new APSystemsAPI({
            username: this.config.username,
            password: this.config.password,
            rejectUnauthorized: !!this.config.rejectUnauthorized,
            logger: {
                debug: message => this.log.debug(message),
                info: message => this.log.info(message),
                warn: message => this.log.warn(message),
                error: message => this.log.error(message),
            },
        });

        const configuredInterval = Number.parseInt(this.config.pollInterval, 10);
        const intervalSec = Math.min(86400, Math.max(10, Number.isFinite(configuredInterval) ? configuredInterval : 300));
        this.pollIntervalMs = intervalSec * 1000;

        await this.setStateAsync('info.connection', { val: false, ack: true });
        this.log.info(`Starting poll cycle every ${intervalSec} second(s)`);
        await this.pollAll();
        this.scheduleNextPoll();
    }

    /**
     * Migrate instances created before v0.2.1 from minutes to seconds.
     */
    async migratePollIntervalToSeconds() {
        if (this.config.pollIntervalUnit === 'seconds') {
            return;
        }
        const rawInterval = Number.parseInt(this.config.pollInterval, 10);
        const oldMinutes = Number.isFinite(rawInterval) ? rawInterval : 5;
        const migratedSeconds = Math.min(86400, Math.max(10, oldMinutes * 60));

        this.log.info(`Migrating pollInterval config from minutes (${oldMinutes}) to seconds (${migratedSeconds})`);
        const instanceObjectId = `system.adapter.${this.namespace}`;
        const obj = await this.getForeignObjectAsync(instanceObjectId);

        if (obj && obj.native) {
            obj.native.pollInterval = migratedSeconds;
            obj.native.pollIntervalUnit = 'seconds';
            await this.setForeignObjectAsync(instanceObjectId, obj);
        }

        this.config.pollInterval = migratedSeconds;
        this.config.pollIntervalUnit = 'seconds';
    }

    scheduleNextPoll() {
        if (this.pollTimer) {
            this.clearTimeout(this.pollTimer);
        }

        this.pollTimer = this.setTimeout(async () => {
            this.pollTimer = null;
            if (!this.pollInProgress) {
                await this.pollAll();
            }
            this.scheduleNextPoll();
        }, this.pollIntervalMs);
    }

    onUnload(callback) {
        if (this.pollTimer) {
            this.clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        callback();
    }

    sanitize(id) {
        return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    async ensureState(id, common, value) {
        await this.setObjectNotExistsAsync(id, {
            type: 'state',
            common: {
                ...common,
                read: common.read !== false,
                write: common.write === true,
            },
            native: {},
        });
        if (value !== undefined) {
            await this.setStateAsync(id, {
                val: this.coerceStateValue(common.type, value),
                ack: true,
            });
        }
    }

    coerceStateValue(type, value) {
        if (value === null || value === undefined) {
            return null;
        }
        if (type === 'number' && typeof value !== 'number') {
            const parsed = Number.parseFloat(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        if (type === 'boolean' && typeof value !== 'boolean') {
            return Boolean(value);
        }
        if (type === 'string' && typeof value !== 'string') {
            return String(value);
        }
        return value;
    }

    async ensureContainer(id, type, name, native = {}) {
        await this.setObjectNotExistsAsync(id, {
            type,
            common: { name },
            native,
        });
    }

    async pollInverter(base, inverter) {
        const devId = String(inverter.inverter_dev_id);
        await this.ensureState(`${base}.info.alias`, { name: 'Alias', type: 'string', role: 'text' }, inverter.alias || '');
        await this.ensureState(`${base}.info.model`, { name: 'Model', type: 'string', role: 'text' }, inverter.model || '');
        await this.ensureState(`${base}.info.devId`, { name: 'Device ID', type: 'string', role: 'text' }, devId);

        try {
            const realtime = await this.api.getInverterRealtime(devId);
            await this.ensureState(`${base}.realtime.power`, { name: 'AC power total', type: 'number', role: 'value.power', unit: 'W' }, realtime.power ?? null);
            await this.ensureState(`${base}.realtime.power1`, { name: 'AC power channel 1', type: 'number', role: 'value.power', unit: 'W' }, realtime.power1 ?? null);
            await this.ensureState(`${base}.realtime.power2`, { name: 'AC power channel 2', type: 'number', role: 'value.power', unit: 'W' }, realtime.power2 ?? null);

            const statistic = await this.api.getInverterStatistic(devId);
            await this.ensureState(`${base}.statistic.todayEnergy`, { name: 'Energy today', type: 'number', role: 'value.energy', unit: 'kWh' }, statistic.todayEnergy ?? null);
            await this.ensureState(`${base}.statistic.monthEnergy`, { name: 'Energy this month', type: 'number', role: 'value.energy', unit: 'kWh' }, statistic.monthEnergy ?? null);
            await this.ensureState(`${base}.statistic.lifetimeEnergy`, { name: 'Lifetime energy', type: 'number', role: 'value.energy', unit: 'kWh' }, statistic.lifetimeEnergy ?? null);
            await this.ensureState(`${base}.statistic.lastPower`, { name: 'Last known power', type: 'number', role: 'value.power', unit: 'W' }, statistic.lastPower ?? null);

            await this.api.getInverterStatus(devId);
            await this.ensureState(`${base}.online`, { name: 'Inverter online', type: 'boolean', role: 'indicator.reachable' }, true);
            await this.ensureState(`${base}.lastError`, { name: 'Last error', type: 'string', role: 'text' }, '');
        } catch (error) {
            if (error instanceof APSystemsInverterOfflineError) {
                await this.ensureState(`${base}.online`, { name: 'Inverter online', type: 'boolean', role: 'indicator.reachable' }, false);
            } else {
                this.log.warn(`Error polling ${devId}: ${error.message}`);
                await this.ensureState(`${base}.lastError`, { name: 'Last error', type: 'string', role: 'text' }, error.message);
            }
        }

        await this.ensureState(`${base}.lastUpdate`, { name: 'Last update', type: 'number', role: 'date', unit: 'ms' }, Date.now());
    }

    async pollAll() {
        if (this.pollInProgress || !this.api) {
            return;
        }

        this.pollInProgress = true;
        try {
            const systems = await this.api.getSystems();
            await this.setStateAsync('info.connection', { val: true, ack: true });

            for (const system of systems) {
                const systemId = this.sanitize(system.system_id);
                await this.ensureContainer(systemId, 'folder', system.system_name || system.address || system.system_id, {
                    systemId: system.system_id,
                });

                const inverters = await this.api.getInverterList(system.system_id);
                for (const inverter of inverters) {
                    const inverterId = this.sanitize(inverter.inverter_dev_id);
                    const base = `${systemId}.${inverterId}`;
                    await this.ensureContainer(base, 'device', inverter.alias || inverter.inverter_dev_id, {
                        devId: inverter.inverter_dev_id,
                    });
                    await this.ensureContainer(`${base}.info`, 'channel', 'Information');
                    await this.ensureContainer(`${base}.realtime`, 'channel', 'Realtime power');
                    await this.ensureContainer(`${base}.statistic`, 'channel', 'Energy statistics');
                    await this.pollInverter(base, inverter);
                }
            }
            this.log.debug(`Poll cycle done (${systems.length} system(s))`);
        } catch (error) {
            this.log.error(`Poll cycle failed: ${error.message}`);
            await this.setStateAsync('info.connection', { val: false, ack: true });
        } finally {
            this.pollInProgress = false;
        }
    }
}

if (require.main !== module) {
    module.exports = options => new ApsystemsEasypower(options);
} else {
    new ApsystemsEasypower();
}
