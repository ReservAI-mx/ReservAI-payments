jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
  })),
}));

const nodemailer = require('nodemailer');
const EmailManager = require('../../utils/EmailManager');

describe('EmailManager', () => {
  const originalEmailTo1 = process.env.EMAIL_TO1;
  const originalEmailTo2 = process.env.EMAIL_TO2;

  afterEach(() => {
    process.env.EMAIL_TO1 = originalEmailTo1;
    process.env.EMAIL_TO2 = originalEmailTo2;
  });
  it('sendEmailToCustomer succeeds with env configured', async () => {
    const result = await EmailManager.sendEmailToCustomer(
      'to@example.com',
      'Subject',
      '<p>Hi</p>',
      'Hi'
    );
    expect(result.success).toBe(true);
    expect(nodemailer.createTransport).toHaveBeenCalled();
  });

  it('getInternalAlertRecipients reads EMAIL_TO1 and EMAIL_TO2', () => {
    process.env.EMAIL_TO1 = 'one@example.com';
    process.env.EMAIL_TO2 = 'two@example.com';
    expect(EmailManager.getInternalAlertRecipients()).toEqual([
      'one@example.com',
      'two@example.com',
    ]);
  });

  it('sendEmailToInternalTeam sends to both recipients', async () => {
    process.env.EMAIL_TO1 = 'one@example.com';
    process.env.EMAIL_TO2 = 'two@example.com';
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'msg-2' });
    nodemailer.createTransport.mockReturnValueOnce({ sendMail });

    const result = await EmailManager.sendEmailToInternalTeam(
      'Pago fallido',
      '<p>Fail</p>',
      'Fail'
    );

    expect(result.success).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'one@example.com, two@example.com',
        subject: 'Pago fallido',
      })
    );
  });

  it('sendEmailToInternalTeam fails when recipients are missing', async () => {
    delete process.env.EMAIL_TO1;
    delete process.env.EMAIL_TO2;
    const result = await EmailManager.sendEmailToInternalTeam('Subj', '<p>x</p>', 'x');
    expect(result.success).toBe(false);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});
