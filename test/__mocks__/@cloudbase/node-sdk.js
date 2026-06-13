// Mock for @cloudbase/node-sdk
module.exports = {
  initialize: jest.fn(() => ({ _type: 'app-secret-sdk', _initialized: true })),
  CloudBase: jest.fn().mockImplementation(() => ({ _type: 'api-key-sdk', _initialized: true })),
}
