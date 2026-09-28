// Mocks the AWS transport (not the app's own code) so these tests exercise
// the real Express route, multer-s3 middleware and file-upload.service —
// without making network calls to real S3.
const mockUploadDone = jest.fn();
const mockSend = jest.fn();

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(({ params }) => ({
    on: jest.fn(),
    done: mockUploadDone.mockImplementation(() =>
      Promise.resolve({
        Location: `https://mock-public-bucket.s3.ap-south-1.amazonaws.com/${params.Key}`,
        ETag: '"mock-etag"',
      })
    ),
  })),
}));

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  };
});

const request = require('supertest');
const app = require('../../helpers/app');
const { buildUserPayload } = require('../../helpers/factories');

async function createLoggedInAgent(overrides = {}) {
  const payload = buildUserPayload(overrides);
  const created = await request(app).post('/api/v1/users').send(payload);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: payload.email, password: payload.password });
  return { agent, user: created.body.data };
}

function blogPayload(overrides = {}) {
  return {
    title: 'Cover Image Test Post',
    content: 'This post exists purely to exercise the cover-image upload endpoints in tests.',
    status: 'draft',
    ...overrides,
  };
}

describe('Blog cover-image routes (integration)', () => {
  beforeEach(() => {
    mockSend.mockReset().mockResolvedValue({});
    mockUploadDone.mockClear();
  });

  it('PUT /blogs/:id/cover-image uploads and stores a new { url, key } cover image', async () => {
    const { agent } = await createLoggedInAgent();
    const created = await agent.post('/api/v1/blogs').send(blogPayload());

    const res = await agent
      .put(`/api/v1/blogs/${created.body.data._id}/cover-image`)
      .attach('coverImage', Buffer.from('fake-image-bytes'), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data.coverImage.key).toMatch(/^blog-covers\/\d+-photo\.png$/);
    expect(res.body.data.coverImage.url).toContain(res.body.data.coverImage.key);
    // No previous cover image existed, so nothing should have been deleted.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('PUT /blogs/:id/cover-image deletes the previous S3 object when replacing an existing cover image', async () => {
    const { agent } = await createLoggedInAgent();
    const created = await agent.post('/api/v1/blogs').send(blogPayload());
    const id = created.body.data._id;

    const first = await agent
      .put(`/api/v1/blogs/${id}/cover-image`)
      .attach('coverImage', Buffer.from('first-image'), { filename: 'first.png', contentType: 'image/png' });
    const firstKey = first.body.data.coverImage.key;

    const second = await agent
      .put(`/api/v1/blogs/${id}/cover-image`)
      .attach('coverImage', Buffer.from('second-image'), { filename: 'second.png', contentType: 'image/png' });

    expect(second.status).toBe(200);
    expect(second.body.data.coverImage.key).not.toBe(firstKey);

    // The old key was deleted from S3 before the new one was saved.
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].input).toEqual({ Bucket: 'test-public-bucket', Key: firstKey });
  });

  it('PUT /blogs/:id/cover-image requires the file field and rejects non-owners', async () => {
    const { agent } = await createLoggedInAgent();
    const created = await agent.post('/api/v1/blogs').send(blogPayload());

    const noFile = await agent.put(`/api/v1/blogs/${created.body.data._id}/cover-image`);
    expect(noFile.status).toBe(400);

    const { agent: otherAgent } = await createLoggedInAgent();
    const forbidden = await otherAgent
      .put(`/api/v1/blogs/${created.body.data._id}/cover-image`)
      .attach('coverImage', Buffer.from('x'), { filename: 'x.png', contentType: 'image/png' });
    expect(forbidden.status).toBe(403);
  });

  it('DELETE /blogs/:id/cover-image removes the S3 object and clears the field', async () => {
    const { agent } = await createLoggedInAgent();
    const created = await agent.post('/api/v1/blogs').send(blogPayload());
    const id = created.body.data._id;

    const uploaded = await agent
      .put(`/api/v1/blogs/${id}/cover-image`)
      .attach('coverImage', Buffer.from('img'), { filename: 'img.png', contentType: 'image/png' });
    const key = uploaded.body.data.coverImage.key;

    const res = await agent.delete(`/api/v1/blogs/${id}/cover-image`);

    expect(res.status).toBe(200);
    expect(res.body.data.coverImage.url).toBeNull();
    expect(res.body.data.coverImage.key).toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].input).toEqual({ Bucket: 'test-public-bucket', Key: key });
  });

  it('DELETE /blogs/:id deletes the cover image from S3 along with the post', async () => {
    const { agent } = await createLoggedInAgent();
    const created = await agent.post('/api/v1/blogs').send(blogPayload());
    const id = created.body.data._id;

    const uploaded = await agent
      .put(`/api/v1/blogs/${id}/cover-image`)
      .attach('coverImage', Buffer.from('img'), { filename: 'img.png', contentType: 'image/png' });
    const key = uploaded.body.data.coverImage.key;

    const res = await agent.delete(`/api/v1/blogs/${id}`);

    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].input).toEqual({ Bucket: 'test-public-bucket', Key: key });
  });
});
