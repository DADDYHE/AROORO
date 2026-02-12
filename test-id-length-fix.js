/**
 * Test script to verify the ID length fix
 * Tests that the system no longer generates 33-character IDs
 */

const { generateId } = require('./cloudfunctions/login/index.js');
const { generateFormat1UserID } = require('./utils/imUserIdValidator.js');

// Test case: Simulate the exact scenario that was causing the 33-character ID
const testOpenid = 'oNIhl17JEstp_WtKcSq'; // This should be a real openid that was causing issues
const testRole = 'owner';

console.log('=== Testing ID Length Fix ===\n');

// Test cloud function generateId
console.log('1. Testing cloud function generateId:');
console.log('   Role:', testRole);
console.log('   OpenID:', testOpenid);

const cloudGeneratedId = generateId(testRole, testOpenid);
console.log('   Generated ID:', cloudGeneratedId);
console.log('   Length:', cloudGeneratedId.length);
console.log('   Is 32 chars?', cloudGeneratedId.length === 32);
console.log('   Is valid?', /^[a-zA-Z0-9_]+$/.test(cloudGeneratedId));
console.log('');

// Test frontend generateFormat1UserID
console.log('2. Testing frontend generateFormat1UserID:');
console.log('   Role:', testRole);
console.log('   OpenID:', testOpenid);

try {
  const frontendGeneratedId = generateFormat1UserID(testOpenid, testRole);
  console.log('   Generated ID:', frontendGeneratedId);
  console.log('   Length:', frontendGeneratedId.length);
  console.log('   Is 32 chars?', frontendGeneratedId.length === 32);
  console.log('   Is valid?', /^[a-zA-Z0-9_]+$/.test(frontendGeneratedId));
} catch (error) {
  console.error('   Error:', error.message);
}
console.log('');

// Test multiple openids to ensure consistency
console.log('3. Testing multiple openids:');
const testOpenids = [
  'oNIhl17JEstp_WtKcSq',
  'o1234567890abcdefghijklmn',
  'oABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'o123456789012345678901234',
];

testOpenids.forEach((openid, index) => {
  const id = generateId('owner', openid);
  console.log(`   Test ${index + 1}: ${id} (${id.length} chars)`);
  console.log(`     Is 32 chars? ${id.length === 32}`);
});

console.log('\n=== Test Complete ===');
