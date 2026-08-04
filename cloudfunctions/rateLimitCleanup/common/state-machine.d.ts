/**
 * 通用状态机（数据驱动，TypeScript 源文件 - Sprint 13 迁移）
 *
 * 解决：
 *   - 散落在 orderService/orders.js#allowedTransitions、adminService/services/stateMachine.js 等处的重复 if-else
 *   - 状态转移合法性校验不统一
 *
 * 用法：
 *   const { createStateMachine, IllegalTransitionError } = require('./common/state-machine')
 *
 *   const orderSM = createStateMachine({
 *     initial: 'pending',
 *     states: ['pending', 'paid', 'shipped', 'completed', 'cancelled'],
 *     transitions: {
 *       pending: ['paid', 'cancelled'],
 *       paid: ['shipped', 'cancelled'],
 *       shipped: ['completed'],
 *       completed: [],
 *       cancelled: [],
 *     },
 *   })
 *
 *   orderSM.canTransition('pending', 'paid')      // true
 *   orderSM.assertTransition('pending', 'paid')   // OK
 *   orderSM.assertTransition('pending', 'completed') // throws IllegalTransitionError
 *   orderSM.nextStates('pending')                  // ['paid', 'cancelled']
 *   orderSM.isTerminal('cancelled')                // true
 *
 * 兼容：
 *   - adminService/services/stateMachine.js 中的 4 张表可平滑迁移到本模块
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 *   （运行时仍消费 .js 编译产物）
 */
import type { StateMachine, StateMachineNode } from './types';
/**
 * 非法状态转移异常
 */
export declare class IllegalTransitionError extends Error {
    readonly name: 'IllegalTransitionError';
    readonly from: string;
    readonly to: string;
    readonly allowed: string[];
    constructor(from: string, to: string, allowed: string[], message?: string | null);
}
/**
 * 状态机配置
 */
export interface StateMachineConfig<S extends string = string> {
    initial: S;
    states: S[];
    transitions: Record<S, S[]>;
    metadata?: Partial<Record<S, Record<string, unknown>>>;
}
/**
 * 校验 transitions 配置合法性
 * @param config
 * @throws {BusinessError} 配置错误
 */
export declare function validateConfig<S extends string = string>(config: StateMachineConfig<S>): void;
/**
 * 创建状态机实例
 * @param config
 * @returns 状态机实例
 */
export declare function createStateMachine<S extends string = string>(config: StateMachineConfig<S>): StateMachine<S> & {
    initial: S;
    states: S[];
    transitions: Record<S, S[]>;
    isValidState: (s: string) => s is S;
    nextStates: (from: S) => S[];
    isTerminal: (state: S) => boolean;
    getMetadata: (state: S) => Record<string, unknown> | null;
};
/**
 * 高阶：根据状态 + 事件 + 守卫函数生成下一个状态
 *
 * @param sm - 状态机实例
 * @param from - 当前状态
 * @param event - 事件名（对应 transitions 表中的一项）
 * @param context - 守卫函数上下文
 * @returns 下一个状态，若不匹配返回 null
 *
 * @example
 *   const sm = createStateMachine({...})
 *   const next = applyEvent(sm, 'pending', 'confirm', { isAdmin: true })
 *   // 'confirmed' 或 'cancelled'（根据 context）
 */
export declare function applyEvent<S extends string = string>(sm: ReturnType<typeof createStateMachine<S>>, from: S, event: S, context?: Record<string, unknown>): S | null;
export type { StateMachineNode };
