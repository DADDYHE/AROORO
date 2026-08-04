/* 中心键几何：验证 protrusion(36rpx) 与 margin-top(-48rpx) 是否同一参数化 */
// 运行时事实（custom-tab-bar/index.wxss）
const barH = 104, borderTop = 1, padTop = 8;
const btnD = 104, marginTop = -48;

// .tab-bar: box-sizing border-box, height 104rpx
// 内容区高度 = 104 - border-top 1 - padding-top 8 = 95rpx（padding-bottom 为 env(), 竖屏无 home indicator 时为 0）
const itemH = barH - borderTop - padTop;          // 95rpx
// .center-button 参与 flex 居中，外边距盒高度 = marginTop + btnD
const outerH = marginTop + btnD;                  // 56rpx
// 居中：外边距盒顶端距 item 内容顶
const marginBoxTop = (itemH - outerH) / 2;        // 19.5rpx
// 边框盒顶端 = 外边距盒顶 + marginTop
const borderBoxTop = marginBoxTop + marginTop;    // -28.5rpx（相对 item 内容顶）
// item 内容顶相对 .tab-bar 外框顶 = border 1 + padding 8 = 9rpx
const btnTopVsBar = borderTop + padTop + borderBoxTop;   // -19.5rpx
const protrusion = -btnTopVsBar;                  // 上沿外露量

console.log('=== 中心键几何推导（竖屏 safe-area=0）===');
console.log(`.tab-bar 内容高          : ${itemH}rpx`);
console.log(`.center-button 直径      : ${btnD}rpx  (令牌 --zy-tabbar-center-d = 112rpx)`);
console.log(`margin-top               : ${marginTop}rpx`);
console.log(`按钮上沿相对 tab-bar 顶  : ${btnTopVsBar}rpx`);
console.log(`→ 实际外露(protrusion)   : ${protrusion}rpx  (令牌 --zy-tabbar-center-protrusion = 36rpx)`);
console.log('');
console.log('结论：protrusion 是 margin-top 的“派生量”，二者不是同一参数。');
console.log(`      即便把 center-d 校准为 104rpx，令牌 protrusion=36rpx 仍与实际 ${protrusion}rpx 不符。`);
console.log('      组件没有任何属性直接消费 protrusion；直接消费的是 margin-top。');
console.log('');
// 反推：若真要 36rpx 外露，margin-top 应为多少？
// 需 borderBoxTop = -(36) - 9 = -45  →  marginBoxTop + mt = -45, marginBoxTop=(95-(mt+104))/2
// (95-mt-104)/2 + mt = -45  →  (-9-mt)/2 + mt = -45  →  -9-mt+2mt = -90  →  mt = -81
let mt = -81;
const chk = (itemH - (mt + btnD)) / 2 + mt + borderTop + padTop;
console.log(`若要真达成 36rpx 外露，margin-top 需 ≈ ${mt}rpx（校验上沿=${chk}rpx）——与当前 -48rpx 相差 33rpx，属改版。`);
