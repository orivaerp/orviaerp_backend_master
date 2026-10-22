const sns = require('../../../src/api/v1/modules/email-marketing/sns.service');

const signed = (extra = {}) => ({
  Type: 'Notification',
  MessageId: 'id-1',
  TopicArn: 'arn:aws:sns:ap-south-1:123:ses-events',
  Message: '{"a":1}',
  Timestamp: '2026-10-21T10:00:00.000Z',
  Signature: 'c2ln',
  SignatureVersion: '1',
  SigningCertURL: 'https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-x.pem',
  ...extra,
});

describe('SNS message verification (unit)', () => {
  it('builds the string to sign in Amazon\'s documented field order', () => {
    expect(sns.stringToSign(signed())).toBe(
      'Message\n{"a":1}\nMessageId\nid-1\nTimestamp\n2026-10-21T10:00:00.000Z\nTopicArn\narn:aws:sns:ap-south-1:123:ses-events\nType\nNotification\n'
    );
    expect(sns.stringToSign(signed({ Subject: 'Hello' }))).toContain('Subject\nHello\nTimestamp');
    const confirmation = sns.stringToSign(
      signed({ Type: 'SubscriptionConfirmation', SubscribeURL: 'https://u', Token: 'tok' })
    );
    expect(confirmation).toContain('SubscribeURL\nhttps://u\nTimestamp');
    expect(confirmation).toContain('Token\ntok\nTopicArn');
  });

  it('rejects unsigned messages', async () => {
    await expect(sns.verifyMessage({ Type: 'Notification' })).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each([
    'http://sns.ap-south-1.amazonaws.com/cert.pem',
    'https://evil.example.com/cert.pem',
    'https://sns.ap-south-1.amazonaws.com.evil.example/cert.pem',
    'https://sns.ap-south-1.amazonaws.com/cert.txt',
    'not a url',
  ])('will not fetch a signing certificate from %s', async (SigningCertURL) => {
    await expect(sns.verifyMessage(signed({ SigningCertURL }))).rejects.toMatchObject({ statusCode: 403 });
  });
});
