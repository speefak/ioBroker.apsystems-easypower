'use strict';

/**
 * Client for the AP Systems EasyPower cloud API.
 * The protocol is based on community reverse-engineering of the official app.
 */
const crypto = require('node:crypto');
const https = require('node:https');
const axios = require('axios');

const API_BASE_URL = 'https://app.api.apsystemsema.com:9223';
const API_APP_ID = '4029817264d4821d0164d4821dd80015';
const API_APP_SECRET = 'EZAd2023';
const RSA_PUBLIC_KEY_B64 =
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgdwBhVodMQ84lYZhDSGO' +
    'UDQAks+NMa7WQ83mR1OyHiIWtZ1wWAh4H7fclkdNS3lWCmDH9ldF7Kf6JlEvZTc0' +
    'Textv+YMLXO2gdDIoBvg7vlhY4HxOjXUIFQ+s7cWRrmEIgVVnTBLZU1GMC8zld7W' +
    'H9v9EYCAqK7rvGJP0STZ/g6BP8RGJKhdpY6b+ndMXRUBYwkqy8m1SDJHm1FeHSLQ' +
    'WTaWbP5pz1yrGkkwvx+pib6wli+WE70/uPHp0zXZK5iUwmRQfOkTjDOGJyEE1dqk' +
    'fHDTqne5ED81M4fCIEFYhyvnr1rifVJKHCDRGYQpJ0CiffjjH1ZOGSIN4JPG1EEIj' +
    'QIDAQAB';
const TOKEN_EXPIRED_CODES = new Set([2006, 3000, 3001, 3002, 3003, 3004, 5000]);
const INVERTER_OFFLINE_CODE = 1001;

class APSystemsAuthError extends Error {}
class APSystemsAPIError extends Error {
    constructor(msg, code) {
        super(msg);
        this.code = code;
    }
}
class APSystemsInverterOfflineError extends Error {}

function rsaEncrypt(data) {
    const der = Buffer.from(RSA_PUBLIC_KEY_B64.replace(/\s+/g, ''), 'base64');
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    return crypto
        .publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(data, 'utf8'))
        .toString('base64');
}

function aesEncryptHex(data, keyStr, ivStr) {
    let keyBytes = Buffer.from(keyStr, 'utf8');
    if (keyBytes.length < 16) {
        keyBytes = Buffer.concat([keyBytes, Buffer.alloc(16 - keyBytes.length, 0x30)]);
    }
    const iv = Buffer.from(ivStr, 'utf8').slice(0, 16);
    const buf = Buffer.from(data, 'utf8');
    const padded = Buffer.concat([buf, Buffer.alloc(16 - (buf.length % 16), 0)]);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBytes, iv);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(padded), cipher.final()]).toString('hex');
}

function prepareLoginParams(username, password) {
    const aesKey = crypto.randomBytes(16).toString('hex');
    const version = String(Math.floor(Math.random() * 1e16)).padStart(16, '0');
    return {
        app_id: API_APP_ID,
        app_secret: API_APP_SECRET,
        key: rsaEncrypt(aesKey),
        version: rsaEncrypt(version),
        username: aesEncryptHex(username, aesKey, version),
        password: aesEncryptHex(password, aesKey, version),
    };
}

class APSystemsAPI {
    constructor({ username, password, rejectUnauthorized = false, logger } = {}) {
        if (!username || !password) {
            throw new Error('username and password required');
        }
        this.username = username;
        this.password = password;
        this.logger = logger || { debug() {}, info() {}, warn() {}, error() {} };
        this.accessToken = null;
        this.userId = null;
        this.http = axios.create({
            baseURL: API_BASE_URL,
            timeout: 30000,
            httpsAgent: new https.Agent({ rejectUnauthorized }),
            validateStatus: status => status >= 200 && status < 500,
        });
    }

    async authenticate() {
        const form = new URLSearchParams(prepareLoginParams(this.username, this.password)).toString();
        const resp = await this.http.post('/api/token/generateToken/user/loginEncrypt', form, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (resp.status >= 400) {
            throw new APSystemsAuthError(`Login HTTP ${resp.status}`);
        }
        const body = resp.data;
        if (!body || body.code !== 0) {
            throw new APSystemsAuthError(`Login failed: ${JSON.stringify(body)}`);
        }
        this.accessToken = body.data.access_token;
        this.userId = body.data.user_id;
        this.logger.debug(`APsystems EasyPower: login ok, user_id=${this.userId}`);
    }

    async _request(path, { retryAuth = true } = {}) {
        if (!this.accessToken) {
            await this.authenticate();
        }
        const doCall = () =>
            this.http.request({
                method: 'GET',
                url: `/aps-api-web/${path}`,
                headers: { Authorization: `Bearer ${this.accessToken}`, 'Accept-Language': 'en' },
            });

        let resp = await doCall();
        let body = resp.data || {};
        if (retryAuth && TOKEN_EXPIRED_CODES.has(body.code)) {
            this.logger.debug(`Token expired (code=${body.code}), re-authenticating`);
            await this.authenticate();
            resp = await doCall();
            body = resp.data || {};
        }
        if (body.code === INVERTER_OFFLINE_CODE) {
            throw new APSystemsInverterOfflineError(`Inverter offline on ${path}`);
        }
        if (body.code !== 0) {
            throw new APSystemsAPIError(`API error on ${path}: code=${body.code} ${body.message || ''}`, body.code);
        }
        return body.data || {};
    }

    async getUserInfo() {
        if (!this.userId) {
            await this.authenticate();
        }
        return this._request(`api/v2/user/ezUser/${this.userId}`);
    }

    async getSystems() {
        const info = await this.getUserInfo();
        const list = info.systemInfo;
        if (!list || (Array.isArray(list) && list.length === 0)) {
            throw new APSystemsAPIError('No systems found for this account');
        }
        return Array.isArray(list) ? list : [list];
    }

    async getInverterList(systemId) {
        const data = await this._request(`api/v2/device/ezInverter/inverterList/${systemId}`);
        return data.inverter || [];
    }

    getInverterStatistic(devId) {
        return this._request(`api/v2/data/device/ezInverter/statistic/${devId}`);
    }

    getInverterRealtime(devId) {
        return this._request(`api/v2/data/device/ezInverter/realTime/${devId}`);
    }

    getInverterStatus(devId) {
        return this._request(`api/v2/data/device/ezInverter/status/${devId}`);
    }
}

module.exports = {
    APSystemsAPI,
    APSystemsAuthError,
    APSystemsAPIError,
    APSystemsInverterOfflineError,
    API_BASE_URL,
};
