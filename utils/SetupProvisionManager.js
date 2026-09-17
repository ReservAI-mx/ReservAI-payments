const crypto = require('crypto');
const uuid = require('uuid');
const VaultCrypto = require('./VaultCrypto');
const TechnicalInfoManager = require('./TechnicalInfoManager');
const CustomersManager = require('./CustomersManager');
const AccountManager = require('./AccountManager');
const ProvisionFanout = require('./ProvisionFanout');
const { normalizePipelineTestPhone } = require('./PhoneValidator');
const { generateVaultSecrets, vaultItems } = require('./SetupSecretGenerator');
const { buildEncryptedSetup } = require('./SetupBlobBuilder');
const { createPasswords } = require('./CreatePasswordsClient');
const { captureStripeFailure } = require('./captureOpsError');

function webhookCtx(session, phase, extra = {}) {
    return {
        area: 'webhook',
        phase,
        event_type: 'checkout.session.completed',
        setup_session_id: session?.id,
        ...extra,
    };
}

async function resolveEmailAndName(accountId, stripeCustomerId, db) {
    if (stripeCustomerId) {
        const lookup = await CustomersManager.getCustomersEmailAndName(stripeCustomerId, db);
        if (lookup.success && lookup.email) {
            return { email: lookup.email, name: lookup.name || '' };
        }
    }
    const account = await AccountManager.accountExistsByID(accountId, db);
    if (account.success && account.exists && account.account?.email) {
        return { email: account.account.email, name: account.account.name || '' };
    }
    return null;
}

async function fanoutProvision(tenant, db, session) {
    if (
        !tenant
        || tenant.status !== 'pending_provision'
        || tenant.provision_error
        || !tenant.encrypted_setup_json
    ) {
        return { success: false, skipped: true };
    }
    const fanout = await ProvisionFanout.notify(tenant.id, 'provision', db);
    if (!fanout.success && !fanout.skipped) {
        captureStripeFailure(
            fanout.error || 'ProvisionFanout failed',
            webhookCtx(session, 'webhook.checkout.provision', {
                technical_info_id: tenant.id,
                subdomain: tenant.subdomain,
            })
        );
    }
    return fanout;
}

async function persistCreatePasswordsFailure(row, db, session, err) {
    captureStripeFailure(err, webhookCtx(session, 'webhook.checkout.create_passwords', {
        subdomain: row.subdomain,
        technical_info_id: row.id,
    }));
    if (row.setup_session_id) {
        return TechnicalInfoManager.insertFromSetupSession({
            ...row,
            encrypted_setup_json: null,
            provision_error: 'create_passwords',
        }, db);
    }
    await TechnicalInfoManager.setProvisionError(row.id, 'create_passwords', db);
    return { success: true, tenant: { ...row, provision_error: 'create_passwords', encrypted_setup_json: null } };
}

async function writeVaultAndBlob({ tenantId, accountId, subdomain, email, name, phone, inboundPlain, inboundBlob, plannedPlan, setupSessionId, db, session }) {
    const secrets = generateVaultSecrets();
    try {
        await createPasswords({
            account_id: accountId,
            items: vaultItems(secrets),
        });
    } catch (err) {
        return persistCreatePasswordsFailure({
            id: tenantId,
            account_id: accountId,
            subdomain,
            planned_plan: plannedPlan,
            inbound_auth_key: inboundBlob,
            setup_session_id: setupSessionId,
            pipeline_test_phone: phone,
        }, db, session, err);
    }
    const { blob } = buildEncryptedSetup({
        subdomain,
        client_email: email,
        chatwoot_client_name: name,
        pipeline_test_phone: phone,
        inboundPlain,
        secrets,
    });
    if (setupSessionId) {
        return TechnicalInfoManager.insertFromSetupSession({
            id: tenantId,
            account_id: accountId,
            subdomain,
            planned_plan: plannedPlan,
            inbound_auth_key: inboundBlob,
            setup_session_id: setupSessionId,
            encrypted_setup_json: blob,
            pipeline_test_phone: phone,
            provision_error: null,
        }, db);
    }
    const updated = await TechnicalInfoManager.updateEncryptedSetup(tenantId, blob, phone, db);
    if (!updated.success) return updated;
    if (!updated.tenant) {
        const fresh = await TechnicalInfoManager.getById(tenantId, db);
        return { success: true, tenant: fresh.tenant };
    }
    return updated;
}

async function ensureEncryptedSetup(tenant, db, session = null) {
    if (tenant?.encrypted_setup_json) {
        return { success: true, tenant };
    }
    const phone = normalizePipelineTestPhone(tenant.pipeline_test_phone);
    if (!phone.ok) {
        captureStripeFailure('PIPELINE_TEST_PHONE_INVALID', webhookCtx(session, 'webhook.checkout.phone', {
            technical_info_id: tenant.id,
            subdomain: tenant.subdomain,
        }));
        await TechnicalInfoManager.setProvisionError(tenant.id, 'create_passwords', db);
        return { success: false, error: 'PIPELINE_TEST_PHONE_INVALID' };
    }
    const identity = await resolveEmailAndName(tenant.account_id, null, db);
    if (!identity) {
        captureStripeFailure('setup email missing', webhookCtx(session, 'webhook.checkout.collect', {
            technical_info_id: tenant.id,
            subdomain: tenant.subdomain,
        }));
        await TechnicalInfoManager.setProvisionError(tenant.id, 'create_passwords', db);
        return { success: false, error: 'setup email missing' };
    }
    let inboundPlain;
    try {
        inboundPlain = VaultCrypto.decrypt(tenant.inbound_auth_key);
    } catch (err) {
        captureStripeFailure(err, webhookCtx(session, 'webhook.checkout.inbound', {
            technical_info_id: tenant.id,
        }));
        await TechnicalInfoManager.setProvisionError(tenant.id, 'create_passwords', db);
        return { success: false, error: 'inbound decrypt failed' };
    }
    const result = await writeVaultAndBlob({
        tenantId: tenant.id,
        accountId: tenant.account_id,
        subdomain: tenant.subdomain,
        email: identity.email,
        name: identity.name,
        phone: phone.canonical,
        inboundPlain,
        inboundBlob: tenant.inbound_auth_key,
        plannedPlan: tenant.planned_plan,
        setupSessionId: null,
        db,
        session,
    });
    if (!result.success) return result;
    if (!result.tenant?.encrypted_setup_json) {
        return { success: false, error: 'create_passwords', tenant: result.tenant };
    }
    return { success: true, tenant: result.tenant };
}

async function handleExisting(tenant, session, db) {
    if (tenant.status !== 'pending_provision') {
        return { inserted: false, tenant };
    }
    if (tenant.encrypted_setup_json) {
        if (tenant.provision_error) return { inserted: false, tenant };
        await fanoutProvision(tenant, db, session);
        return { inserted: false, tenant };
    }
    const ensured = await ensureEncryptedSetup(tenant, db, session);
    if (!ensured.success) return { inserted: false, tenant: ensured.tenant || tenant };
    await fanoutProvision(ensured.tenant, db, session);
    return { inserted: false, tenant: ensured.tenant };
}

async function handleSetupPaid(session, db) {
    const metadata = session.metadata || {};
    if (metadata.kind !== 'setup') {
        return { inserted: false };
    }
    if (!metadata.subdomain || !metadata.account_id) {
        captureStripeFailure('setup metadata missing', webhookCtx(session, 'webhook.checkout.metadata', {
            subdomain: metadata.subdomain,
        }));
        return { inserted: false };
    }
    const phone = normalizePipelineTestPhone(metadata.pipeline_test_phone);
    if (!phone.ok) {
        captureStripeFailure('PIPELINE_TEST_PHONE_INVALID', webhookCtx(session, 'webhook.checkout.phone', {
            subdomain: metadata.subdomain,
        }));
        return { inserted: false };
    }

    const existing = await TechnicalInfoManager.getBySetupSessionId(session.id, db);
    if (existing.error) {
        captureStripeFailure(existing.error, webhookCtx(session, 'webhook.checkout.lookup', {
            subdomain: metadata.subdomain,
        }));
    }
    if (existing.tenant) {
        return handleExisting(existing.tenant, session, db);
    }

    const tenantId = uuid.v4();
    const inboundPlain = crypto.randomBytes(32).toString('hex');
    const inboundBlob = VaultCrypto.encrypt(inboundPlain);
    const identity = await resolveEmailAndName(metadata.account_id, session.customer, db);
    if (!identity) {
        captureStripeFailure('setup email missing', webhookCtx(session, 'webhook.checkout.collect', {
            subdomain: metadata.subdomain,
        }));
        const inserted = await TechnicalInfoManager.insertFromSetupSession({
            id: tenantId,
            account_id: metadata.account_id,
            subdomain: metadata.subdomain,
            planned_plan: metadata.planned_plan,
            inbound_auth_key: inboundBlob,
            setup_session_id: session.id,
            encrypted_setup_json: null,
            pipeline_test_phone: phone.canonical,
            provision_error: 'create_passwords',
        }, db);
        return { inserted: Boolean(inserted.success && inserted.tenant), tenant: inserted.tenant || null };
    }

    const inserted = await writeVaultAndBlob({
        tenantId,
        accountId: metadata.account_id,
        subdomain: metadata.subdomain,
        email: identity.email,
        name: identity.name,
        phone: phone.canonical,
        inboundPlain,
        inboundBlob,
        plannedPlan: metadata.planned_plan,
        setupSessionId: session.id,
        db,
        session,
    });
    if (!inserted.success) {
        captureStripeFailure(
            inserted.error || 'insert technical_info failed',
            webhookCtx(session, 'webhook.checkout.insert', { subdomain: metadata.subdomain })
        );
        return { inserted: false, tenant: null };
    }

    let tenant = inserted.tenant || null;
    if (!tenant) {
        const lookup = await TechnicalInfoManager.getBySetupSessionId(session.id, db);
        tenant = lookup.tenant || null;
        if (tenant) return handleExisting(tenant, session, db);
        captureStripeFailure(
            'checkout setup completed but tenant missing after insert/lookup',
            webhookCtx(session, 'webhook.checkout.no_tenant', { subdomain: metadata.subdomain })
        );
        return { inserted: false, tenant: null };
    }

    await fanoutProvision(tenant, db, session);
    return {
        inserted: true,
        tenant,
        eventData: {
            amount_total: session.amount_total,
            currency: session.currency,
            subdomain: metadata.subdomain,
            planned_plan: metadata.planned_plan,
        },
    };
}

module.exports = { handleSetupPaid, ensureEncryptedSetup };
