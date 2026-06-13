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

  const result = await callAction('uploadFile', { cloudPath, fileContent, fileName: file.name })

  if (result.code !== 0) {
    throw new Error(result.message || '上传失败')
  }

  return result.data
}