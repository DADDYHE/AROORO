import http from './index'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://cloudbase-d7getcjqy33b13475-1433773879.ap-shanghai.app.tcloudbase.com/adminService'

export async function uploadFile(file, cloudPath) {
  const { useAuthStore } = await import('@/stores/auth')
  const authStore = useAuthStore()
  const token = authStore.token

  // 读取文件为 base64
  const fileContent = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const headers = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await http.post(API_BASE, {
    action: 'uploadFile',
    data: { cloudPath, fileContent, fileName: file.name },
  }, { headers })

  let res
  if (response.data && typeof response.data.body === 'string') {
    res = JSON.parse(response.data.body)
  } else {
    res = response.data
  }

  if (res.code !== 0) {
    throw new Error(res.message || '上传失败')
  }

  return res.data
}
