// 关键：在文件最开始初始化全局a变量
a = a || {};
a.functions = a.functions || {};
a.functions.getAuthCode = a.functions.getAuthCode || function() { return Promise.resolve(''); };

console.log('message-parse: 全局a.functions 已初始化');

// 使用require语句代替import语句
const { emojiMap, emojiUrl, emojiSymbolMap } = require('./emojiMap');
/** 传入message.element（群系统消息SystemMessage，群提示消息GroupTip除外）
 * content = {
 *  type: 'TIMTextElem',
 *  content: {
 *    text: 'AAA[龇牙]AAA[龇牙]AAA[龇牙AAA]'
 *  }
 *}
 **/

// 群提示消息的含义 (opType)
const GROUP_TIP_TYPE = {
  MEMBER_JOIN: 1,
  MEMBER_QUIT: 2,
  MEMBER_KICKED_OUT: 3,
  MEMBER_SET_ADMIN: 4, // 被设置为管理员
  MEMBER_CANCELED_ADMIN: 5, // 被取消管理员
  GROUP_INFO_MODIFIED: 6, // 修改群资料，转让群组为该类型，msgBody.msgGroupNewInfo.ownerAccount表示新群主的ID
  MEMBER_INFO_MODIFIED: 7, // 修改群成员信息
};

// 解析小程序text, 表情信息也是[嘻嘻]文本
function parseText(message) {
  const renderDom = [];
  // 添加空值检查，确保message和message.payload存在
  if (!message || !message.payload || !message.payload.text) {
    return renderDom;
  }
  let temp = message.payload.text;
  let left = -1;
  let right = -1;
  while (temp !== '') {
    left = temp.indexOf('[');
    right = temp.indexOf(']');
    switch (left) {
      case 0:
        if (right === -1) {
          renderDom.push({
            name: 'span',
            text: temp,
          });
          temp = '';
        } else {
          const _emoji = temp.slice(0, right + 1);
          // 使用emojiSymbolMap将文本描述转换为实际表情符号
          const emojiSymbol = emojiSymbolMap[_emoji] || _emoji;
          renderDom.push({
            name: 'span',
            text: emojiSymbol,
          });
          temp = temp.substring(right + 1);
        }
        break;
      case -1:
        renderDom.push({
          name: 'span',
          text: temp,
        });
        temp = '';
        break;
      default:
        renderDom.push({
          name: 'span',
          text: temp.slice(0, left),
        });
        temp = temp.substring(left);
        break;
    }
  }
  return renderDom;
}
// 解析群系统消息 operationType详情见 https://web.sdk.qcloud.com/im/doc/preview/Message.html#.GroupSystemNoticePayload
function parseGroupSystemNotice(message) {
  // 添加空值检查，确保message和message.payload存在
  if (!message || !message.payload || !message.payload.groupProfile) {
    return '群系统通知';
  }
  const { payload } = message;
  const groupName = payload.groupProfile.name || payload.groupProfile.groupID;
  const { groupID } = payload.groupProfile;
  let text;

  switch (payload.operationType) {
    case 1:
      text = `${payload.operatorID} 申请加入群组：${groupName}（群ID:${groupID})`;
      break;
    case 2:
      text = `成功加入群组：${groupName} （群ID:${groupID})`;
      break;
    case 3:
      text = `申请加入群组：${groupName} （群ID:${groupID})被拒绝`;
      break;
    case 4:
      text = `被管理员${payload.operatorID}踢出群组：${groupName}（群ID:${groupID})`;
      break;
    case 5:
      text = `群：${groupName} （群ID:${groupID})已被${payload.operatorID}解散`;
      break;
    case 6:
      text = `我（用户ID:${payload.operatorID}）成功创建群聊:${groupName}（群ID:${groupID})`;
      break;
    case 7:
      text = `用户ID：${payload.operatorID}邀请你加群：${groupName}（群ID:${groupID})`;
      break;
    case 8:
      text = `你退出群组：${groupName}（群ID:${groupID})`;
      break;
    case 9:
      text = `你被${payload.operatorID}设置为群：${groupName}（群ID:${groupID})的管理员`;
      break;
    case 10:
      text = `你被${payload.operatorID}撤销群：${groupName} （群ID:${groupID})的管理员身份`;
      break;
    case 255:
      text = `自定义群系统通知: ${payload.userDefinedField}`;
      break;
    default:
      text = '群系统通知';
      break;
  }
  return text;
}
// 解析群提示消息
function parseGroupTip(message) {
  // 添加空值检查，确保message和message.payload存在
  if (!message || !message.payload) {
    return [{
      name: 'groupTip',
      text: '群提示消息',
    }];
  }
  const { payload } = message;
  const userName = message.nick || (payload.userIDList ? payload.userIDList.join(',') : '未知用户');
  let tip;
  let user;
  switch (payload.operationType) {
    case GROUP_TIP_TYPE.MEMBER_JOIN:
      tip = `${userName} 加入群聊`;
      break;
    case GROUP_TIP_TYPE.MEMBER_QUIT:
      tip = `群成员退群：${userName}`;
      break;
    case GROUP_TIP_TYPE.MEMBER_KICKED_OUT:
      tip = `群成员被踢：${userName}`;
      break;
    case GROUP_TIP_TYPE.MEMBER_SET_ADMIN:
      tip = `${payload.operatorID || '管理员'}将 ${userName}设置为管理员`;
      break;
    case GROUP_TIP_TYPE.MEMBER_CANCELED_ADMIN:
      tip = `${payload.operatorID || '管理员'}将 ${userName}取消作为管理员`;
      break;
    case GROUP_TIP_TYPE.GROUP_INFO_MODIFIED:
      tip = '群资料修改';
      break;
    case GROUP_TIP_TYPE.MEMBER_INFO_MODIFIED:
      if (payload.memberList && payload.memberList.length > 0) {
        for (const member of payload.memberList) {
          if (member.muteTime > 0) {
            tip = `群成员：${member.userID}被禁言${member.muteTime}秒`;
          } else {
            tip = `群成员：${member.userID}被取消禁言`;
          }
        }
      } else {
        tip = '群成员信息修改';
      }
      break;
    case 256:
      user = message.nick || message.from || '未知用户';
      if (payload.text === '无应答') {
        user = payload.userIDList ? payload.userIDList.join(',') : '未知用户';
      }
      tip = payload.text === '结束群聊' ? '结束群聊' : `"${user}" ${payload.text || ''}`;
      break;
    default:
      tip = '群提示消息';
      break;
  }
  return [{
    name: 'groupTip',
    text: tip,
  }];
}

// 解析图片消息
function parseImage(message) {
  // 获取图片URL，添加错误处理
  let imageUrl = '';
  try {
    // 检查消息和payload是否存在
    if (message && message.payload && message.payload.imageInfoArray && message.payload.imageInfoArray.length > 0) {
      imageUrl = message.payload.imageInfoArray[0].url;
    }
  } catch (error) {
    console.error('解析图片消息失败:', error);
  }
  
  // 如果没有图片URL或图片URL是临时路径，使用默认图片
  if (!imageUrl || imageUrl.includes('tmp/') || imageUrl.includes('__tmp__/') || imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    imageUrl = '';
  }
  
  const renderDom = [{
    name: 'image',
    // 这里默认渲染的是 1080P 的图片
    src: imageUrl,
  }];
  return renderDom;
}
// 解析视频消息
function parseVideo(message) {
  // 添加空值检查，确保message和message.payload存在
  if (!message || !message.payload || !message.payload.videoUrl) {
    return [];
  }
  const renderDom = [{
    name: 'video',
    src: message.payload.videoUrl,
  }];
  return renderDom;
}
// 解析语音消息
function parseAudio(message) {
  // 添加空值检查，确保message和message.payload存在
  if (!message || !message.payload || !message.payload.url) {
    return [];
  }
  const renderDom = [{
    name: 'audio',
    src: message.payload.url,
    second: message.payload.second === 0 ? 1 : (message.payload.second || 1),
  }];
  return renderDom;
}


module.exports = {
  parseText,
  parseGroupSystemNotice,
  parseGroupTip,
  parseImage,
  parseVideo,
  parseAudio,
};
