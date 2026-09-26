const Joi = require('joi');
const validate = require('../../../src/common/middlewares/validate.middleware');

const schema = Joi.object({ name: Joi.string().required() });

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('validate.middleware', () => {
  it('calls next() and strips unknown fields on a valid body', () => {
    const req = { body: { name: 'x', extra: 'y' } };
    const res = mockRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ name: 'x' });
  });

  it('responds 400 with validation error details on an invalid body', () => {
    const req = { body: {} };
    const res = mockRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.message).toBe('Validation failed');
    expect(payload.errors.length).toBeGreaterThan(0);
  });
});
