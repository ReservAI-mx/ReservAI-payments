class EmailManager {

    static getInternalAlertRecipients() {
        return [process.env.EMAIL_TO1, process.env.EMAIL_TO2]
            .filter((email) => typeof email === 'string' && email.trim().length > 0)
            .map((email) => email.trim())
            .filter((email, index, list) => list.indexOf(email) === index);
    }

    static async sendEmailToCustomer(email, subject, content, text_content) {
        try {
            const nodemailer = require('nodemailer');
            
            if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
                throw new Error('EMAIL_USER or EMAIL_PASSWORD environment variables are not set');
            }
            
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: subject,
                html: content,
                text: text_content
            };

            await transporter.sendMail(mailOptions);
            // Log de email removido por seguridad
            return {
                success: true
            }
        } catch (error) {
            console.log('❌ EmailManager: error sending verification email:', error);
            return {
                error: error.message,
                success: false
            }
        }
    }

    static async sendEmailToInternalTeam(subject, content, text_content) {
        const recipients = this.getInternalAlertRecipients();
        if (recipients.length === 0) {
            return {
                success: false,
                error: 'EMAIL_TO1 and EMAIL_TO2 environment variables are not set'
            };
        }

        return this.sendEmailToCustomer(
            recipients.join(', '),
            subject,
            content,
            text_content
        );
    }

}

module.exports = EmailManager;