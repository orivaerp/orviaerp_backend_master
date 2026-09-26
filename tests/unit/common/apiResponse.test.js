const { success, error } = require('../../../src/common/utils/apiResponse');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('apiResponse', () => {
  it('success() sends the expected envelope with defaults', () => {
    const res = mockRes();
    success(res, {});
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Success', data: null });
  });

  it('success() honors overrides', () => {
    const res = mockRes();
    success(res, { statusCode: 201, message: 'Created', data: { id: 1 } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Created', data: { id: 1 } });
  });

  it('error() sends the expected envelope with defaults', () => {
    const res = mockRes();
    error(res, {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Something went wrong',
      errors: null,
    });
  });

  it('error() honors overrides', () => {
    const res = mockRes();
    error(res, { statusCode: 404, message: 'Not found', errors: ['x'] });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Not found', errors: ['x'] });
  });
});
