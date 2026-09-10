const express = require('express');
const router = express.Router();

//middlewares
const AccountIsAClient = require('../middlewares/AccountIsAClient');
const AccountIsAdmin = require('../middlewares/AccountIsAdmin');
const CustomerIsAvailable = require('../middlewares/CustomerIsAvailable');
const CustomerExistByID = require('../middlewares/CustomerExistByID');
const AccountExistByID = require('../middlewares/AccountExistByID');
const VerifyToken = require('../middlewares/VerifyToken');
const AccessTokenType = require('../middlewares/AccessTokenType');
const PathSecurityValidator = require('../middlewares/PathSecurityValidator');
const TechnicalInfoExistByID = require('../middlewares/TechnicalInfoExistByID');

//handlers
const CreateStripeCustomer = require('../handlers/CreateStripeCustomer');
const CreatePortalSession = require('../handlers/CreatePortalSession');
const GetMyPaymentLinks = require('../handlers/GetMyPaymentLinks');
const GetMySubscriptions = require('../handlers/GetMySubscriptions');
const GetMyProvision = require('../handlers/GetMyProvision');
const ActivateSubscription = require('../handlers/ActivateSubscription');
const ListTenants = require('../handlers/ListTenants');
const GetTenant = require('../handlers/GetTenant');
const UpdateTenant = require('../handlers/UpdateTenant');
const DeleteTenant = require('../handlers/DeleteTenant');
const RevealInboundHash = require('../handlers/RevealInboundHash');
const RetryProvision = require('../handlers/RetryProvision');
const ListJobs = require('../handlers/ListJobs');
const GetJob = require('../handlers/GetJob');
const RetryJob = require('../handlers/RetryJob');

router.use(PathSecurityValidator.middleware());

router.get('/health', (req, res) => {
    console.log('Health check: OK, time: ', new Date().toISOString());
    return res.status(200).json({
      status: 'OK',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

const withAccess = [VerifyToken, AccessTokenType, AccountExistByID, AccountIsAClient];
const withAdmin = [VerifyToken, AccessTokenType, AccountExistByID, AccountIsAdmin];

router.post("/customer", ...withAccess, CustomerIsAvailable, CreateStripeCustomer);
router.get("/portal", ...withAccess, CustomerExistByID, CreatePortalSession);
router.get("/links", ...withAccess, CustomerExistByID, GetMyPaymentLinks);
router.get("/status", ...withAccess, CustomerExistByID, GetMySubscriptions);
router.get("/setup", ...withAccess, CustomerExistByID, GetMyProvision);
router.post("/activate", ...withAccess, CustomerExistByID, ActivateSubscription);

router.get("/tenants", ...withAdmin, ListTenants);
router.post("/tenants/:id/reveal-hash", ...withAdmin, TechnicalInfoExistByID, RevealInboundHash);
router.post("/tenants/:id/retry-provision", ...withAdmin, TechnicalInfoExistByID, RetryProvision);
router.get("/tenants/:id", ...withAdmin, TechnicalInfoExistByID, GetTenant);
router.patch("/tenants/:id", ...withAdmin, TechnicalInfoExistByID, UpdateTenant);
router.delete("/tenants/:id", ...withAdmin, TechnicalInfoExistByID, DeleteTenant);

router.get("/jobs", ...withAdmin, ListJobs);
router.get("/jobs/:id", ...withAdmin, GetJob);
router.post("/jobs/:id/retry", ...withAdmin, RetryJob);

router.use((req, res) => {
    return res.status(404).json({
      error: 'Ruta no encontrada',
      path: req.originalUrl,
      method: req.method
    });
  });

module.exports = router;
