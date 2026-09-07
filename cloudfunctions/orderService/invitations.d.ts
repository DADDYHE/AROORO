/**
 * orderService/invitations.ts - 寄养家庭主动开单（boarding_invitations）
 *
 * 业务背景（2026-09-07 产品决策）：
 *   寄养家庭与用户线下沟通好后，由家庭主动开单：家庭选定寄养日期/时间段/
 *   宠物数量/总价，生成开单邀请分享给用户；用户在分享页填写宠物信息
 *   （含健康信息）并支付定金或全款，支付成功后订单自动确认（跳过接单环节）。
 *
 * 共 6 个 handler：
 *   1. createInvitation     家庭创建开单邀请（hosting 权限）
 *   2. getMyInvitations     家庭的开单列表（分页 + 状态筛选）
 *   3. cancelInvitation     家庭取消邀请（仅 active 可取消，手动，无自动过期）
 *   4. getInvitationByCode  公开读：用户从分享卡片/小程序码进入填写页
 *   5. submitInvitation     用户提交：原子占用邀请 + 生成正式订单
 *   6. getInviteQrCode      家庭获取小程序码（wxacode.getUnlimited，云端缓存）
 *
 * 关键设计：
 *   - 邀请是独立实体，不混入 orders；用户提交且支付成功后才进入订单体系
 *   - 价格权威：订单 totalPrice 取邀请快照，服务端不重新计价，用户不可改
 *   - 防并发：submitInvitation 用条件更新（status='active'）原子占用，
 *     两人同抢时后者报「已被占用」（产品决策：不绑定用户、谁打开谁填）
 *   - 宠物健康信息（既往病史/过敏源/药品/保养品/疫苗/绝育/驱虫/行为习惯）
 *     由前端先行调用 petService.createPet/updatePet 持久化到宠物档案，
 *     本模块只接收最终 petIds（已含 healthInfo 校验，避免跨函数调用）
 *   - bookingKey 使用 invit_${invitationId} 前缀：天然防重复成单（一次性）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 */
declare const _handlers: {
    createInvitation: any;
    getMyInvitations: any;
    cancelInvitation: any;
    getInvitationByCode: any;
    submitInvitation: any;
    getInviteQrCode: any;
};
export default _handlers;
