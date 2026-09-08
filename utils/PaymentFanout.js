const VaultCrypto = require('./VaultCrypto');
const TechnicalInfoManager = require('./TechnicalInfoManager');

const DEFAULT_URL = 'https://knowledge.{subdomain}.reservai.com.mx/webhooks/payment';
const LOCAL_URL = 'http://api:8000/webhooks/payment';

function isProd() {
    return process.env.STAGE === 'production' || process.env.NODE_ENV === 'production';
}

class PaymentFanout {
    static urlFor(subdomain) {
        const template = process.env.PAYMENT_FANOUT_URL || (isProd() ? DEFAULT_URL : LOCAL_URL);
        const url = template.replaceAll('{subdomain}', subdomain);
        if (!isProd() && url.includes('reservai.com.mx')) {
            return LOCAL_URL;
        }
        return url;
    }

    static async notifyBySubscriptionId(stripe_subscription_id, status, db) {
        if (!stripe_subscription_id) return;
        const lookup = await TechnicalInfoManager.getForFanout(stripe_subscription_id, db);
        if (!lookup.success || !lookup.tenant) return;
        let token = process.env.PAYMENT_FANOUT_TOKEN;
        if (!token) {
            try {
                token = VaultCrypto.decrypt(lookup.tenant.inbound_auth_key);
            } catch {
                return;
            }
        }
        try {
            await fetch(this.urlFor(lookup.tenant.subdomain), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status }),
            });
        } catch {
            // Fan-out is best-effort; webhook ACK already went out.
        }
    }
}

module.exports = PaymentFanout;
