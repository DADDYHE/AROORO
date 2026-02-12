/**
 * Simple test script to verify the ID length fix
 * Tests the exact ID generation logic from the cloud function
 */

// Copy the exact generateId function from cloudfunctions/login/index.js
const generateId = (prefix = '', openid = '') => {
  // 角色类型映射（短版本用于节省空间）
  const ROLE_TYPE_MAPPING = {
    'owner': 'own',
    'host': 'hst',
    'guest': 'gst'
  }
  
  // 使用短角色前缀
  const shortPrefix = ROLE_TYPE_MAPPING[prefix] || prefix
  
  // 生成openid哈希（8位）
  let openidHash = ''
  if (openid) {
    // 使用简单的哈希方法生成openid的8位哈希值
    let hash = 0
    for (let i = 0; i < openid.length; i++) {
      const char = openid.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    // 将哈希值转换为36进制，并确保长度为8位
    openidHash = Math.abs(hash).toString(36).padStart(8, '0').substr(0, 8)
  } else {
    // 如果没有openid，生成8位随机字符串
    openidHash = Math.random().toString(36).substr(2, 8).padEnd(8, '0').substr(0, 8)
  }
  
  // 处理标识符中的特殊字符
  let cleanIdentifier = openid
  const SPECIAL_CHAR_MAP = {
    '@': '_',
    '+': '_',
    '-': '_',
    '=': '_',
    ':': '_',
    ' ': '_',
    '.': '_',
  }
  
  Object.keys(SPECIAL_CHAR_MAP).forEach(char => {
    cleanIdentifier = cleanIdentifier.split(char).join(SPECIAL_CHAR_MAP[char])
  })
  
  // 组合ID: prefix_hash_identifier
  let userId = `${shortPrefix}_${openidHash}_${cleanIdentifier}`
  
  // 确保只包含允许的字符（字母、数字、下划线）
  userId = userId.replace(/[^a-zA-Z0-9_]/g, '')
  
  // 确保长度不超过32位
  const MAX_USER_ID_LENGTH = 32
  if (userId.length > MAX_USER_ID_LENGTH) {
    // 如果长度超过，截取标识符部分
    const maxIdentifierLength = MAX_USER_ID_LENGTH - shortPrefix.length - 1 - 8 - 1 // prefix + _ + hash + _
    const identifierPart = userId.split('_').slice(2).join('_')
    const truncatedIdentifier = identifierPart.slice(0, maxIdentifierLength)
    userId = `${shortPrefix}_${openidHash}_${truncatedIdentifier}`
  }

  // 最终确保长度为32位，防止任何情况下的长度错误
  if (userId.length > MAX_USER_ID_LENGTH) {
    userId = userId.substring(0, MAX_USER_ID_LENGTH)
  }
  
  console.log('[Test] 生成格式1 userID:', {
    originalPrefix: prefix,
    shortPrefix: shortPrefix,
    hash: openidHash,
    identifier: cleanIdentifier,
    result: userId,
    length: userId.length
  })
  
  return userId
}

// Test case: Simulate the exact scenario that was causing the 33-character ID
const testOpenid = 'oNIhl17JEstp_WtKcSq'; // This is the openid from the user's log
const testRole = 'owner';

console.log('=== Testing ID Length Fix ===\n');

// Test the problematic case
console.log('Testing the problematic case:');
console.log('Role:', testRole);
console.log('OpenID:', testOpenid);

const generatedId = generateId(testRole, testOpenid);
console.log('Generated ID:', generatedId);
console.log('Length:', generatedId.length);
console.log('Is 32 chars?', generatedId.length === 32);
console.log('Is valid?', /^[a-zA-Z0-9_]+$/.test(generatedId));

// Test the exact ID from the user's log
console.log('\nTesting the exact ID from user log:');
const problematicId = 'own_00329sc5_oNIhl17JEstp_WtKcSq';
console.log('Problematic ID:', problematicId);
console.log('Length:', problematicId.length);
console.log('Is 33 chars?', problematicId.length === 33);

// Test multiple variations to ensure consistency
console.log('\nTesting multiple variations:');
const testCases = [
  { role: 'owner', openid: 'oNIhl17JEstp_WtKcSq' },
  { role: 'owner', openid: 'o1234567890abcdefghijklmn' },
  { role: 'host', openid: 'oABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { role: 'owner', openid: 'o123456789012345678901234' },
];

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}:`);
  console.log(`Role: ${testCase.role}, OpenID: ${testCase.openid}`);
  const id = generateId(testCase.role, testCase.openid);
  console.log(`ID: ${id} (${id.length} chars)`);
  console.log(`Is 32 chars? ${id.length === 32}`);
});

console.log('\n=== Test Complete ===');
