const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')
const { createLogger } = require('../common/logger')
const { ENDPOINTS } = require('../common/config')
// Sprint 31: 统一使用 handleSuccess / handleError
const { handleSuccess, handleError } = require('../common/utils')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const logger = createLogger('orderTimeoutService')

const ORDER_TIMEOUT_MINUTES = 30
const FEEDING_ORDER_TIMEOUT_MINUTES = 30
const MALL_ORDER_TIMEOUT_MINUTES = 30
const GROUP_BUY_TIMEOUT_MINUTES = 30
const ACTIVITY_ORDER_TIMEOUT_MINUTES = 30
const BATCH_SIZE = 100
const MAX_BATCHES = 10

const WECHAT_PAY_CONFIG = {
  appId: process.env.WECHAT_APPID || '',
  mchId: process.env.WECHAT_MCHID || '',
  serialNo: process.env.WECHAT_SERIAL_NO || '',
  privateKey: process.env.WECHAT_PRIVATE_KEY || '',
  apiV3Key: process.env.WECHAT_API_V3_KEY || '',
}

function normalizePrivateKey(key) {
  if (!key) {return ''}
  const trimmed = String(key).trim()
  if (trimmed.includes('-----BEGIN')) {return trimmed}
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8')
    if (decoded.includes('-----BEGIN')) {return decoded}
  } catch (e) {}
  return trimmed
}

function generateAuthorization(method, path, body, mchId, serialNo, privateKey) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = Math.random().toString(36).substring(2, 34)
  const message = `${[method, path, timestamp, nonceStr, body].join('\n')}\n`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  sign.end()
  const signature = sign.sign(privateKey, 'base64')
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`
}

function closeWechatOrder(outTradeNo) {
  return new Promise(resolve => {
    const privateKey = normalizePrivateKey(WECHAT_PAY_CONFIG.privateKey)
    if (!privateKey || !WECHAT_PAY_CONFIG.mchId || !WECHAT_PAY_CONFIG.serialNo) {
      logger.warn('closeWechatOrder', { msg: '缺少微信支付配置，跳过关单' })
      return resolve(false)
    }

    const path = `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`
    const body = JSON.stringify({ mchid: WECHAT_PAY_CONFIG.mchId })
    const authorization = generateAuthorization('POST', path, body, WECHAT_PAY_CONFIG.mchId, WECHAT_PAY_CONFIG.serialNo, privateKey)

    const urlObj = new URL(`${ENDPOINTS.WECHAT_PAY_API_BASE}${path}`)
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization,
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logger.info('closeWechatOrder.success', { outTradeNo })
          resolve(true)
        } else {
          logger.warn('closeWechatOrder.fail', { outTradeNo, statusCode: res.statusCode, data })
          resolve(false)
        }
      })
    })
    req.on('error', e => {
      logger.warn('closeWechatOrder.exception', { outTradeNo, msg: e.message })
      resolve(false)
    })
    req.write(body)
    req.end()
  })
}

async function restoreProductStock(productId, skuId, quantity) {
  if (!productId) {return}
  try {
    const productRes = await db.collection('products').doc(productId).get()
    if (!productRes.data) {return}

    const qty = quantity || 1
    const updateData = {
      totalStock: _.inc(qty),
      soldCount: _.inc(-qty),
      updatedAt: db.serverDate(),
    }

    if (skuId && productRes.data.skus) {
      const skuIndex = productRes.data.skus.findIndex(s => s.skuId === skuId)
      if (skuIndex >= 0) {
        updateData[`skus.${skuIndex}.stock`] = _.inc(qty)
        updateData[`skus.${skuIndex}.soldCount`] = _.inc(-qty)
      }
      updateData.stock = _.inc(qty)
    } else {
      updateData.stock = _.inc(qty)
    }

    await db.collection('products').doc(productId).update({ data: updateData })
  } catch (stockErr) {
    logger.error('restoreProductStock', stockErr)
    throw stockErr
  }
}

async function unlockOrderCoupons(orderId) {
  if (!orderId) {return}
  try {
    const lockedCoupons = await db.collection('user_coupons')
      .where({ lockedOrderId: orderId, status: 'locked' })
      .field({ _id: true, endTime: true })
      .limit(20)
      .get()
    const now = new Date()
    for (const coupon of (lockedCoupons.data || [])) {
      const isExpired = coupon.endTime && new Date(coupon.endTime) < now
      await db.collection('user_coupons').doc(coupon._id).update({
        data: { status: isExpired ? 'expired' : 'unused', updatedAt: db.serverDate() },
      })
    }
  } catch (e) {
    logger.error('unlockOrderCoupons', e)
  }
}

async function restoreTuanDealStock(dealId, quantity) {
  if (!dealId) {return}
  try {
    const qty = quantity || 1
    await db.collection('tuan_deals').doc(dealId).update({
      data: {
        totalStock: _.inc(qty),
        soldCount: _.inc(-qty),
        updatedAt: db.serverDate(),
      },
    })
  } catch (e) {
    logger.error('restoreTuanDealStock', e)
  }
}

async function restoreActivityQuota(activityId, participantCount) {
  if (!activityId) {return}
  try {
    const count = participantCount || 1
    await db.collection('activities').doc(activityId).update({
      data: {
        currentParticipants: _.inc(-count),
        updatedAt: db.serverDate(),
      },
    })
  } catch (e) {
    logger.error('restoreActivityQuota', e)
  }
}

async function fetchAllExpired(collection, where, fields) {
  const allOrders = []
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const res = await db.collection(collection)
      .where(where)
      .field(fields)
      .skip(batch * BATCH_SIZE)
      .limit(BATCH_SIZE)
      .get()
    const data = res.data || []
    allOrders.push(...data)
    if (data.length < BATCH_SIZE) {break}
  }
  return allOrders
}

exports.main = async (event, context) => {
  const results = {
    cancelledBoardingOrders: 0,
    cancelledFeedingOrders: 0,
    cancelledMallOrders: 0,
    cancelledGroupBuyOrders: 0,
    cancelledActivityOrders: 0,
    closedWechatOrders: 0,
    errors: [],
  }

  const now = new Date()
  const boardingTimeout = new Date(now.getTime() - ORDER_TIMEOUT_MINUTES * 60 * 1000)
  const feedingTimeout = new Date(now.getTime() - FEEDING_ORDER_TIMEOUT_MINUTES * 60 * 1000)
  const mallTimeout = new Date(now.getTime() - MALL_ORDER_TIMEOUT_MINUTES * 60 * 1000)
  const groupBuyTimeout = new Date(now.getTime() - GROUP_BUY_TIMEOUT_MINUTES * 60 * 1000)
  const activityTimeout = new Date(now.getTime() - ACTIVITY_ORDER_TIMEOUT_MINUTES * 60 * 1000)

  try {
    const expiredBoardingOrders = await fetchAllExpired('orders', {
      status: 'pending',
      paymentStatus: 'unpaid',
      createdAt: _.lte(boardingTimeout),
    }, { _id: true, outTradeNo: true })

    for (const order of expiredBoardingOrders) {
      try {
        await db.collection('orders').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelReason: '超时未支付，系统自动取消',
            cancelledAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        })
        if (order.outTradeNo) {
          const closed = await closeWechatOrder(order.outTradeNo)
          if (closed) {results.closedWechatOrders++}
        }
        await unlockOrderCoupons(order._id)
        results.cancelledBoardingOrders++
      } catch (error) {
        results.errors.push({ orderId: order._id, error: error.message })
      }
    }
  } catch (error) {
    results.errors.push({ type: 'boarding', error: error.message })
  }

  try {
    const expiredFeedingOrders = await fetchAllExpired('feedingOrders', {
      status: _.in(['pending', 'pending_payment']),
      createdAt: _.lte(feedingTimeout),
    }, { _id: true, outTradeNo: true })

    for (const order of expiredFeedingOrders) {
      try {
        await db.collection('feedingOrders').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelReason: '超时未支付，系统自动取消',
            cancelledAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        })
        if (order.outTradeNo) {
          const closed = await closeWechatOrder(order.outTradeNo)
          if (closed) {results.closedWechatOrders++}
        }
        await unlockOrderCoupons(order._id)
        results.cancelledFeedingOrders++
      } catch (error) {
        results.errors.push({ orderId: order._id, error: error.message })
      }
    }
  } catch (error) {
    results.errors.push({ type: 'feeding', error: error.message })
  }

  try {
    const expiredMallOrders = await fetchAllExpired('orders', {
      type: 'mall',
      status: 'pending_payment',
      createdAt: _.lte(mallTimeout),
    }, { _id: true, productId: true, skuId: true, quantity: true, outTradeNo: true })

    for (const order of expiredMallOrders) {
      try {
        await db.collection('orders').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelReason: '超时未支付，系统自动取消',
            cancelledAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        })

        if (order.outTradeNo) {
          const closed = await closeWechatOrder(order.outTradeNo)
          if (closed) {results.closedWechatOrders++}
        }

        try {
          await restoreProductStock(order.productId, order.skuId, order.quantity)
        } catch (stockErr) {
          results.errors.push({ orderId: order._id, stockRestoreError: stockErr.message })
        }

        await unlockOrderCoupons(order._id)
        results.cancelledMallOrders++
      } catch (error) {
        results.errors.push({ orderId: order._id, error: error.message })
      }
    }
  } catch (error) {
    results.errors.push({ type: 'mall', error: error.message })
  }

  try {
    const expiredGroupBuyOrders = await fetchAllExpired('orders', {
      type: 'group_buy',
      status: 'pending_payment',
      createdAt: _.lte(groupBuyTimeout),
    }, { _id: true, productId: true, quantity: true, dealId: true, outTradeNo: true })

    for (const order of expiredGroupBuyOrders) {
      try {
        await db.collection('orders').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelReason: '超时未支付，系统自动取消',
            cancelledAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        })

        if (order.outTradeNo) {
          const closed = await closeWechatOrder(order.outTradeNo)
          if (closed) {results.closedWechatOrders++}
        }

        try {
          await restoreProductStock(order.productId, null, order.quantity)
        } catch (stockErr) {
          results.errors.push({ orderId: order._id, stockRestoreError: stockErr.message })
        }

        await restoreTuanDealStock(order.dealId, order.quantity)
        await unlockOrderCoupons(order._id)
        results.cancelledGroupBuyOrders++
      } catch (error) {
        results.errors.push({ orderId: order._id, error: error.message })
      }
    }
  } catch (error) {
    results.errors.push({ type: 'group_buy', error: error.message })
  }

  try {
    const expiredActivityOrders = await fetchAllExpired('activity_registrations', {
      status: 'pending_payment',
      createdAt: _.lte(activityTimeout),
    }, { _id: true, activityId: true, participantCount: true, outTradeNo: true })

    for (const order of expiredActivityOrders) {
      try {
        await db.collection('activity_registrations').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelReason: '超时未支付，系统自动取消',
            cancelledAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        })

        if (order.outTradeNo) {
          const closed = await closeWechatOrder(order.outTradeNo)
          if (closed) {results.closedWechatOrders++}
        }

        await restoreActivityQuota(order.activityId, order.participantCount)
        await unlockOrderCoupons(order._id)
        results.cancelledActivityOrders++
      } catch (error) {
        results.errors.push({ orderId: order._id, error: error.message })
      }
    }
  } catch (error) {
    results.errors.push({ type: 'activity', error: error.message })
  }

  return handleSuccess(results, `处理完成：取消寄养${results.cancelledBoardingOrders}笔，喂养${results.cancelledFeedingOrders}笔，商城${results.cancelledMallOrders}笔，团购${results.cancelledGroupBuyOrders}笔，活动${results.cancelledActivityOrders}笔，微信关单${results.closedWechatOrders}笔`)
}
