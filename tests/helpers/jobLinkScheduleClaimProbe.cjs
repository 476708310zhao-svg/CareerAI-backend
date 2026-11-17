'use strict';

const crypto = require('node:crypto');
const store = require('../../utils/adminJobsStore');

const slot = process.argv[2];
const nowMs = Number(process.argv[3]);
const owner = crypto.randomUUID();
const result = store.claimScheduledLinkCheck({ slot, owner, nowMs, leaseMs: 300000 });
process.stdout.write(`${JSON.stringify(result)}\n`);
