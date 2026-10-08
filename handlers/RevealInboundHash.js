const crypto = require('crypto');
const { decrypt } = require('../utils/CreatePasswordsClient');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const RevealInboundHash = async (req, res) => {
    try {
        const plaintext = await decrypt(req.technical_info.inbound_auth_key);
        const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
        logAction(req, 'info', 'RevealInboundHash', `ok id=${req.technical_info?.id}`);
        return res.status(200).json({ hash });
    } catch (error) {
        logAction(req, 'error', 'RevealInboundHash', `id=${req.technical_info?.id}`, error);
        captureStripeFailure(error, {
            phase: 'billing.inbound.reveal',
            technical_info_id: req.technical_info?.id,
        });
        return res.status(500).json({ error: 'El blob no descifra o error de BD' });
    }
};

module.exports = RevealInboundHash;
