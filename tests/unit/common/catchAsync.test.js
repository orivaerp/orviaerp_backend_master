const catchAsync = require('../../../src/common/utils/catchAsync');

describe('catchAsync', () => {
  it('calls the wrapped fn with (req, res, next) and does not touch next on success', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const req = {};
    const res = {};
    const next = jest.fn();

    await catchAsync(fn)(req, res, next);

    expect(fn).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards a rejected promise to next', async () => {
    const err = new Error('boom');
    const fn = jest.fn().mockRejectedValue(err);
    const req = {};
    const res = {};
    const next = jest.fn();

    await catchAsync(fn)(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it('does not catch a synchronously thrown error (only rejected promises)', () => {
    // catchAsync wraps the fn's return value in Promise.resolve(), so a throw
    // that happens before fn ever returns a promise propagates immediately -
    // it's on the caller (route handlers here are always async) to avoid this.
    const err = new Error('sync boom');
    const fn = jest.fn(() => {
      throw err;
    });
    const next = jest.fn();

    expect(() => catchAsync(fn)({}, {}, next)).toThrow(err);
    expect(next).not.toHaveBeenCalled();
  });
});
