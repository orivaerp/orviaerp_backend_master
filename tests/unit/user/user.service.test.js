jest.mock('../../../src/api/v1/modules/user/user.model', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

const User = require('../../../src/api/v1/modules/user/user.model');
const userService = require('../../../src/api/v1/modules/user/user.service');

// Chainable, awaitable stand-in for a mongoose Query (find().sort().skip().limit()).
function makeQueryMock(resolvedValue) {
  const query = {};
  query.sort = jest.fn(() => query);
  query.skip = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.then = (resolve, reject) => Promise.resolve(resolvedValue).then(resolve, reject);
  return query;
}

describe('user.service', () => {
  afterEach(() => jest.clearAllMocks());

  it('findAllUsers passes the filter through to User.find', async () => {
    User.find.mockReturnValue(makeQueryMock([{ _id: '1' }]));
    const result = await userService.findAllUsers({ role: 'admin' });
    expect(User.find).toHaveBeenCalledWith({ role: 'admin' });
    expect(result).toEqual([{ _id: '1' }]);
  });

  it('findAllUsers applies skip/limit when a page is given', async () => {
    const query = makeQueryMock([]);
    User.find.mockReturnValue(query);
    await userService.findAllUsers({}, { skip: 30, limit: 10 });
    expect(query.skip).toHaveBeenCalledWith(30);
    expect(query.limit).toHaveBeenCalledWith(10);
  });

  it('findAllUsers defaults to an empty filter', async () => {
    User.find.mockReturnValue(makeQueryMock([]));
    await userService.findAllUsers();
    expect(User.find).toHaveBeenCalledWith({});
  });

  it('findUserById delegates to User.findById', async () => {
    User.findById.mockResolvedValue({ _id: '1' });
    const result = await userService.findUserById('1');
    expect(User.findById).toHaveBeenCalledWith('1');
    expect(result).toEqual({ _id: '1' });
  });

  it('findUserByEmail delegates to User.findOne', async () => {
    User.findOne.mockResolvedValue({ email: 'a@b.com' });
    await userService.findUserByEmail('a@b.com');
    expect(User.findOne).toHaveBeenCalledWith({ email: 'a@b.com' });
  });

  it('createUser delegates to User.create', async () => {
    User.create.mockResolvedValue({ _id: '1' });
    const payload = { firstName: 'A' };
    await userService.createUser(payload);
    expect(User.create).toHaveBeenCalledWith(payload);
  });

  it('updateUserById runs validators and requests the new doc', async () => {
    User.findByIdAndUpdate.mockResolvedValue({ _id: '1', firstName: 'B' });
    await userService.updateUserById('1', { firstName: 'B' });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      '1',
      { firstName: 'B' },
      { returnDocument: 'after', runValidators: true }
    );
  });

  it('deleteUserById delegates to User.findByIdAndDelete', async () => {
    User.findByIdAndDelete.mockResolvedValue({ _id: '1' });
    await userService.deleteUserById('1');
    expect(User.findByIdAndDelete).toHaveBeenCalledWith('1');
  });
});
