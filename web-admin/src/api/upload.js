import { callAction } from './index'

export async function uploadFile(file, cloudPath) {
  const fileContent = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  // skipConvert：上传返回的是 cloud:// fileID，需原样回传后端存储（后端再按需解析临时 URL）；
  // 若在此被 resolveCloudUrls 转成 CDN https，存进后端的将是会过期的临时地址。
  const result = await callAction('uploadFile', { cloudPath, fileContent, fileName: file.name }, { skipConvert: true })

  if (result.code !== 0) {
    throw new Error(result.message || '上传失败')
  }

  return result.data
}