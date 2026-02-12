// Simple test script to verify module loading

console.log('Testing module loading...');

// Test absolute path first
const absolutePath = '/Users/yy/Documents/trae_projects/zuoyou/utils/';

try {
  const ImUserIdValidator = require(absolutePath + 'imUserIdValidator');
  console.log('✓ Successfully loaded imUserIdValidator with absolute path');
} catch (error) {
  console.error('✗ Failed to load imUserIdValidator with absolute path:', error.message);
}

try {
  const imProfileManager = require(absolutePath + 'im-profile-manager');
  console.log('✓ Successfully loaded im-profile-manager with absolute path');
} catch (error) {
  console.error('✗ Failed to load im-profile-manager with absolute path:', error.message);
}

// Test relative path from project root
const relativePath = './utils/';

try {
  const ImUserIdValidator = require(relativePath + 'imUserIdValidator');
  console.log('✓ Successfully loaded imUserIdValidator with relative path from root');
} catch (error) {
  console.error('✗ Failed to load imUserIdValidator with relative path from root:', error.message);
}

try {
  const imProfileManager = require(relativePath + 'im-profile-manager');
  console.log('✓ Successfully loaded im-profile-manager with relative path from root');
} catch (error) {
  console.error('✗ Failed to load im-profile-manager with relative path from root:', error.message);
}

console.log('Test completed.');
