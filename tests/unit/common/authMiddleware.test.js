const isAuthenticated = require('../../../src/common/middlewares/auth.middleware');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('auth.middleware', () => {
  it('calls next() when req.isAuthenticated() returns true', () => {
    const req = { isAuthenticated: () => true };
    const res = mockRes();
    const next = jest.fn();

    isAuthenticated(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 401 when req.isAuthenticated() returns false', () => {
    const req = { isAuthenticated: () => false };
    const res = mockRes();
    const next = jest.fn();

    isAuthenticated(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('responds 401 when isAuthenticated is not present (no passport session middleware)', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    isAuthenticated(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
