const { connectDB } = require('../data/connectDB');
const TechnicalInfoManager = require('../utils/TechnicalInfoManager');

const SUB = process.env.LOCAL_FANOUT_SUBSCRIPTION_ID;
const STATUS = process.env.LOCAL_FANOUT_STATUS;
const URL = process.env.PAYMENT_FANOUT_URL;
const TOKEN = process.env.LOCAL_FANOUT_TOKEN;
const TENANT_STATUS = STATUS === 'ok' ? 'active' : 'unpaid';

if (!SUB || !STATUS || !URL || !TOKEN) {
    console.error('LOCAL_FANOUT_SUBSCRIPTION_ID, LOCAL_FANOUT_STATUS, PAYMENT_FANOUT_URL, LOCAL_FANOUT_TOKEN required');
    process.exit(1);
}

(async () => {
    const db = await connectDB();
    await TechnicalInfoManager.setStatusBySubscriptionId(SUB, TENANT_STATUS, db);
    const res = await fetch(URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: STATUS }),
    });
    const body = await res.text();
    console.log(JSON.stringify({ http: res.status, tenant: TENANT_STATUS, body }));
    process.exit(res.ok ? 0 : 1);
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
