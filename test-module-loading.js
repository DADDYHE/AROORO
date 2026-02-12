// Test script to verify module loading paths

console.log('Testing module loading from host-detail.js location...');

// Change to the directory where host-detail.js is located
process.chdir('/Users/yy/Documents/trae_projects/zuoyou/subpackages/booking');

console.log('Current directory:', process.cwd());

// Test loading imUserIdValidator
try {
  const ImUserIdValidator = require('../../utils/imUserIdValidator');
  console.log('✓ Successfully loaded imUserIdValidator');
  console.log('  Module has generateFormat1UserID:', typeof ImUserIdValidator.generateFormat1UserID === 'function');
} catch (error) {
  console.error('✗ Failed to load imUserIdValidator:', error);
}

// Test loading im-profile-manager
try {
  const imProfileManager = require('../../utils/im-profile-manager');
  console.log('✓ Successfully loaded im-profile-manager');
  console.log('  Module has updateMyProfile:', typeof imProfileManager.updateMyProfile === 'function');
  console.log('  Module has getUserProfile:', typeof imProfileManager.getUserProfile === 'function');
} catch (error) {
  console.error('✗ Failed to load im-profile-manager:', error);
}

console.log('Test completed.');
