const crypto = require('crypto');
const VaultCrypto = require('../utils/VaultCrypto');

const RevealInboundHash = async (req, res) => {
    try {
        const plaintext = VaultCrypto.decrypt(req.technical_info.inbound_auth_key);
        const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
        return res.status(200).json({ hash });
    } catch (error) {
        return res.status(500).json({ error: 'El blob no descifra o error de BD' });
    }
};

module.exports = RevealInboundHash;
