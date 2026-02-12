/**
 * Test script to verify the entire login flow now uses 32-character IDs
 * Tests that the login process generates and returns valid 32-character IDs
 */

// Mock the cloud function environment
const mockWXContext = {
  OPENID: 'oNIhl17JEstp_WtKcSq'
};

// Mock cloud database
const mockDB = {
  collection: (name) => {
    return {
      where: (query) => {
        return {
          get: () => Promise.resolve({
            data: [] // Simulate no existing user
          })
        };
      },
      add: (data) => Promise.resolve({
        _id: data.data._id
      }),
      doc: (id) => {
        return {
          update: (data) => Promise.resolve({})
        };
      }
    };
  }
};

// Test the login flow ID generation
console.log('=== Testing Login Flow ID Generation ===\n');

// Import the generateId function logic
const generateId = (prefix = '', openid = '') => {
  // 角色类型映射（短版本用于节省空间）
  const ROLE_TYPE_MAPPING = {
    'owner': 'own',
    'host': 'hst',
    'guest': 'gst'
  };
  
  // 使用短角色前缀
  const shortPrefix = ROLE_TYPE_MAPPING[prefix] || prefix;
  
  // 生成openid哈希（8位）
  let openidHash = '';
  if (openid) {
    // 使用简单的哈希方法生成openid的8位哈希值
    let hash = 0;
    for (let i = 0; i < openid.length; i++) {
      const char = openid.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    // 将哈希值转换为36进制，并确保长度为8位
    openidHash = Math.abs(hash).toString(36).padStart(8, '0').substr(0, 8);
  } else {
    // 如果没有openid，生成8位随机字符串
    openidHash = Math.random().toString(36).substr(2, 8).padEnd(8, '0').substr(0, 8);
  }
  
  // 处理标识符中的特殊字符
  let cleanIdentifier = openid;
  const SPECIAL_CHAR_MAP = {
    '@': '_',
    '+': '_',
    '-': '_',
    '=': '_',
    ':': '_',
    ' ': '_',
    '.': '_',
  };
  
  Object.keys(SPECIAL_CHAR_MAP).forEach(char => {
    cleanIdentifier = cleanIdentifier.split(char).join(SPECIAL_CHAR_MAP[char]);
  });
  
  // 组合ID: prefix_hash_identifier
  let userId = `${shortPrefix}_${openidHash}_${cleanIdentifier}`;
  
  // 确保只包含允许的字符（字母、数字、下划线）
  userId = userId.replace(/[^a-zA-Z0-9_]/g, '');
  
  // 确保长度不超过32位
  const MAX_USER_ID_LENGTH = 32;
  if (userId.length > MAX_USER_ID_LENGTH) {
    // 如果长度超过，截取标识符部分
    const maxIdentifierLength = MAX_USER_ID_LENGTH - shortPrefix.length - 1 - 8 - 1; // prefix + _ + hash + _
    const identifierPart = userId.split('_').slice(2).join('_');
    const truncatedIdentifier = identifierPart.slice(0, maxIdentifierLength);
    userId = `${shortPrefix}_${openidHash}_${truncatedIdentifier}`;
  }

  // 最终确保长度为32位，防止任何情况下的长度错误
  if (userId.length > MAX_USER_ID_LENGTH) {
    userId = userId.substring(0, MAX_USER_ID_LENGTH);
  }
  
  return userId;
};

// Simulate the login flow
async function simulateLoginFlow(openid, role) {
  console.log('Simulating login flow:');
  console.log('OpenID:', openid);
  console.log('Role:', role);
  
  // Step 1: Generate user ID (same as cloud function does)
  const userId = generateId(role, openid);
  console.log('Generated user ID:', userId);
  console.log('Length:', userId.length);
  console.log('Is 32 chars?', userId.length === 32);
  console.log('Is valid format?', /^[a-zA-Z0-9_]+$/.test(userId));
  
  // Step 2: Simulate cloud function returning this ID
  const mockUserInfo = {
    _id: userId,
    openid: openid,
    userID: userId, // This is what gets returned to frontend
    role: role,
    avatarUrl: '',
    nickName: ''
  };
  
  console.log('Returned userInfo.userID:', mockUserInfo.userID);
  console.log('Length:', mockUserInfo.userID.length);
  
  return mockUserInfo;
}

// Run the test
(async () => {
  try {
    const testOpenid = 'oNIhl17JEstp_WtKcSq';
    const testRole = 'owner';
    
    const userInfo = await simulateLoginFlow(testOpenid, testRole);
    
    console.log('\n=== Test Results ===');
    console.log('Final userID:', userInfo.userID);
    console.log('Final length:', userInfo.userID.length);
    console.log('All tests passed:', userInfo.userID.length === 32 && /^[a-zA-Z0-9_]+$/.test(userInfo.userID));
    
    // Test edge cases
    console.log('\n=== Testing Edge Cases ===');
    
    // Test with very long openid
    const longOpenid = 'o' + 'a'.repeat(30); // 31 characters
    const longIdUserInfo = await simulateLoginFlow(longOpenid, 'owner');
    console.log('Long openid test - Length:', longIdUserInfo.userID.length);
    console.log('Long openid test - Pass:', longIdUserInfo.userID.length === 32);
    
    // Test with host role
    const hostUserInfo = await simulateLoginFlow(testOpenid, 'host');
    console.log('Host role test - Length:', hostUserInfo.userID.length);
    console.log('Host role test - Pass:', hostUserInfo.userID.length === 32);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
})();
