/**
 * 坐标系转换工具（仅 web-admin 录入侧使用）。
 *
 * 背景：微信小程序 map / wx.chooseLocation / wx.getLocation(type:'gcj02') 统一使用
 * 国测局 GCJ-02 坐标系；而 Google 地图、GPS 设备、高德原始坐标多为 WGS-84。
 * 活动签到距离比对与地图展示都按 GCJ-02 解读，若把 WGS-84 当作 GCJ-02 存入，
 * 境内会偏移约 300~700 米，导致现场签到被判 tooFar、地图标点也偏。
 *
 * 因此 web-admin 手填经纬度时，若来源是 WGS-84，必须在此转成 GCJ-02 再存库，
 * 保证 activities 表全程统一为 GCJ-02。小程序端 chooseLocation 已是 GCJ-02，无需转换。
 */

const PI = Math.PI
const A = 6378245.0 // 长半轴
const EE = 0.00669342162296594323 // 偏心率平方

function transformLat(x, y) {
  let ret =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0
  return ret
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0
  return ret
}

function outOfChina(lat, lng) {
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55)
}

/** WGS-84 → GCJ-02（国测局坐标系） */
export function wgs84ToGcj02(lat, lng) {
  const la = Number(lat)
  const lo = Number(lng)
  if (Number.isNaN(la) || Number.isNaN(lo)) return { lat: la, lng: lo }
  if (outOfChina(la, lo)) return { lat: la, lng: lo }
  let dLat = transformLat(lo - 105.0, la - 35.0)
  let dLng = transformLng(lo - 105.0, la - 35.0)
  const radLat = (la / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return { lat: la + dLat, lng: lo + dLng }
}

/** GCJ-02 → WGS-84（近似反算，用于展示/回填） */
export function gcj02ToWgs84(lat, lng) {
  const g = wgs84ToGcj02(lat, lng)
  return { lat: Number(lat) * 2 - g.lat, lng: Number(lng) * 2 - g.lng }
}

export default { wgs84ToGcj02, gcj02ToWgs84 }
