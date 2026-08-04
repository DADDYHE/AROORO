/**
 * orderService 寄养（boarding）订单专用状态机（TypeScript 源文件 - Sprint 49 迁移）
 *
 * 解决：
 *   - orders.js 中"操作 → 目标状态"的硬编码重复
 *   - 不同操作对当前状态的合法性校验分散在多处
 *
 * 状态机：
 *   pending_payment → paid → confirmed → in_progress → completed
 *         ↓                    ↓
 *    cancelled           cancelled / rejected
 *
 * 用法：
 *   import { boardingOrderStateMachine, getTargetStatusByOperation, canPerformOperation } from './common/boarding-state-machine'
 *   import { BOARDING_OPERATION_TARGET } from './common/boarding-state-machine'
 *
 *   const newStatus = getTargetStatusByOperation('confirm')
 *   if (!canPerformOperation(currentStatus, 'confirm')) {
 *     // 业务层抛出 INVALID_STATE_TRANSITION 错误
 *   }
 *
 * 编译：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 *   （运行时仍消费 .js 编译产物）
 */
import type { StateMachine } from './types';
/**
 * 寄养订单状态枚举
 */
export type BoardingState = 'pending_payment' | 'paid' | 'confirmed' | 'in_progress' | 'completed' | 'rejected' | 'cancelled' | 'refunded' | 'deleted';
/** 状态转移表 */
export type BoardingTransitions = Record<BoardingState, BoardingState[]>;
/**
 * 商家操作类型
 */
export type BoardingOperation = 'confirm' | 'reject' | 'complete' | 'cancel';
/**
 * 寄养订单状态机
 *   - pending_payment → paid / cancelled
 *   - paid            → confirmed / rejected / cancelled
 *   - confirmed       → in_progress / completed / cancelled
 *   - in_progress     → completed / cancelled
 *   - completed / rejected / cancelled / refunded / deleted 为终态
 */
export declare const boardingOrderStateMachine: StateMachine<BoardingState> & {
    initial: BoardingState;
    states: BoardingState[];
    transitions: BoardingTransitions;
    isValidState: (s: string) => s is BoardingState;
    nextStates: (from: BoardingState) => BoardingState[];
    isTerminal: (state: BoardingState) => boolean;
    getMetadata: (state: BoardingState) => Record<string, unknown> | null;
};
/**
 * 商家操作 → 目标状态
 *   - confirm:  商家确认订单
 *   - reject:   商家拒绝订单
 *   - complete: 完成服务
 *   - cancel:   取消订单
 */
export declare const BOARDING_OPERATION_TARGET: Record<BoardingOperation, BoardingState>;
/**
 * 根据操作获取目标状态
 * @returns 目标状态，无效操作返回 null
 */
export declare function getTargetStatusByOperation(operation: unknown): BoardingState | null;
/**
 * 判断当前状态下是否可以执行指定操作
 *   1. 操作必须存在于 BOARDING_OPERATION_ALLOWED_FROM
 *   2. 当前状态必须在允许的源状态中
 *   3. 状态机本身必须允许该转移
 */
export declare function canPerformOperation(currentStatus: unknown, operation: unknown): boolean;
