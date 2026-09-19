const crypto = require('crypto');
const { decrypt } = require('../utils/CreatePasswordsClient');
const { captureStripeFailure } = require('../utils/captureOpsError');

const RevealInboundHash = async (req, res) => {
    try {
        const plaintext = await decrypt(req.technical_info.inbound_auth_key);
        const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
        return res.status(200).json({ hash });
    } catch (error) {
        captureStripeFailure(error, {
            phase: 'billing.inbound.reveal',
            technical_info_id: req.technical_info?.id,
        });
        return res.status(500).json({ error: 'El blob no descifra o error de BD' });
    }
};

module.exports = RevealInboundHash;
