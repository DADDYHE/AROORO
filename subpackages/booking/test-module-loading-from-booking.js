// Test script to verify module loading from booking directory

console.log('Testing module loading from booking directory...');

// Test loading with relative path from booking directory
try {
  const ImUserIdValidator = require('../../utils/imUserIdValidator');
  console.log('✓ Successfully loaded imUserIdValidator with ../../utils/');
  console.log('  Module has generateFormat1UserID:', typeof ImUserIdValidator.generateFormat1UserID === 'function');
} catch (error) {
  console.error('✗ Failed to load imUserIdValidator with ../../utils/:', error.message);
}

try {
  const imProfileManager = require('../../utils/im-profile-manager');
  console.log('✓ Successfully loaded im-profile-manager with ../../utils/');
  console.log('  Module has updateMyProfile:', typeof imProfileManager.updateMyProfile === 'function');
} catch (error) {
  console.error('✗ Failed to load im-profile-manager with ../../utils/:', error.message);
}

console.log('Test completed.');
