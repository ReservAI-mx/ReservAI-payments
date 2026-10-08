const { addRequestTraceStep, logAction } = require('../utils/RequestTrace');
const WebhooksManager = require('../utils/WebhooksManager');
const getStripeInstance = require('../data/StripeInstanceGetter');
const { captureStripeFailure } = require('../utils/captureOpsError');

const VerifyStripeEvent = async (req, res, next) => {
    let stripe = null;
    try {
        stripe = await getStripeInstance();
    } catch (error) {
        logAction(req, 'error', 'VerifyStripeEvent', 'stripe', error);
        captureStripeFailure(error, { area: 'webhook', phase: 'verify.getStripeInstance' });
        return res.status(500).json({ error: 'Internal server error' });
    }
    // Stripe envía la firma en el header 'stripe-signature'
    const signature = req.headers['stripe-signature'];
    
    if (!signature) {
        logAction(req, 'warning', 'VerifyStripeEvent', 'missing signature');
        return res.status(403).json({ 
            error: 'Missing stripe-signature header',
            message: 'El webhook debe incluir el header stripe-signature'
        });
    }

    // El payload viene como Buffer desde express.raw()
    const payload = req.body;
    
    if (!payload || payload.length === 0) {
        logAction(req, 'warning', 'VerifyStripeEvent', 'empty payload');
        return res.status(400).json({ 
            error: 'Empty payload',
            message: 'El webhook debe incluir un payload'
        });
    }

    const result = await WebhooksManager.createEvent(signature, payload, stripe);
    
    if (result.error) {
        logAction(req, 'warning', 'VerifyStripeEvent', 'verify failed');
        captureStripeFailure(result.error, { area: 'webhook', phase: 'verify.signature' });
        return res.status(403).json({ 
            error: result.error,
            message: 'No se pudo verificar la firma del webhook'
        });
    }
    
    if (!result.success) {
        logAction(req, 'warning', 'VerifyStripeEvent', 'not verified');
        captureStripeFailure(result.message || 'Webhook verification failed', {
            area: 'webhook',
            phase: 'verify.failed',
        });
        return res.status(403).json({ 
            error: result.message || 'Webhook verification failed'
        });
    }
    
    req.event = result.event;
    addRequestTraceStep(req, 'VerifyStripeEvent', {
        stripe_event_id: result.event.id,
        stripe_event_type: result.event.type,
    });
    next();
}

module.exports = VerifyStripeEvent;
