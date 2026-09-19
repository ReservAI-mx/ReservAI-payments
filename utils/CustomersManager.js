const CustomerExistByID = require('../queries/CustomerExistByID');
const CreateCustomerInDB = require('../queries/CreateCustomerInDB.js');
const GetCustomersEmailAndName = require('../queries/GetCustomersEmailAndName.js');
const { logCaughtError } = require('./logCaughtError');

class CustomersManager {
    static async customerExistByID(account_id, db) {
        try {
            const result = await db.query(CustomerExistByID, [account_id]);
            return {
                success: true,
                customer: result.rows[0],
                exists: result.rows[0] ? true : false
            }
        } catch (error) {
            logCaughtError('CustomersManager.customerExistByID', error);
            return {
                error: error.message,
                success: false
            }
        }
    }

    static async createCustomerInStripe(account_id, email, name, stripe) {
        let customer = null;
        try {
            customer = await stripe.customers.create({
                email: email,
                name: name,
                metadata: {
                    user_id: account_id,
                    currency: 'MXN'
                }
            });
            return {
                success: true,
                message: 'Customer created successfully',
                customer: customer
            }
        }
        catch (error) {
            logCaughtError('CustomersManager.createCustomerInStripe', error);
            return {
                error: error.message,
                success: false
            }
        }
    }

    static async createCustomerInDB(account_id, customer_id, db) {
        try {
            const result = await db.query(CreateCustomerInDB, [account_id, customer_id]);
            return {
                success: true,
                message: 'Customer created successfully',
                customer: result.rows[0]
            }
        } catch (error) {
            logCaughtError('CustomersManager.createCustomerInDB', error);
            return {
                success: false,
                message: 'Error creating customer',
                error: error.message
            }
        }
    }

    static async createPortalSession(stripe_customer_id, stripe) {
        try {
            const session = await stripe.billingPortal.sessions.create({
                customer: stripe_customer_id,
                locale: 'es'
            });
            return {
                success: true,
                message: 'Portal session created successfully',
                session: session
            }
        } catch (error) {
            logCaughtError('CustomersManager.createPortalSession', error);
            return {
                success: false,
                message: 'Error creating portal session',
                error: error.message
            }
        }
    }

    static async getCustomersEmailAndName(stripe_customer_id, db) {
        try {
            const result = await db.query(GetCustomersEmailAndName, [stripe_customer_id]);
            return {
                success: true,
                email: result.rows[0].email,
                name: result.rows[0].name
            }
        } 
        catch (error) {
            logCaughtError('CustomersManager.getCustomersEmailAndName', error);
            return {
                success: false,
                message: 'Error getting customers email and name',
                error: error.message
            }
        }
    }
}

module.exports =  CustomersManager ;    