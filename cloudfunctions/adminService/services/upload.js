const { handleSuccess } = require('../common/utils')
const { initCloud } = require('../common/utils')
const { createLogger } = require('../common/logger')
const { err } = require('../common/errors')

const { cloud } = initCloud()
const logger = createLogger('uploadService')

async function uploadFile(event, context, auth) {
  const { cloudPath, fileContent, fileName } = event
  if (!cloudPath) {
    throw err('INVALID_PARAMS', '缺少 cloudPath')
  }

  // HTTP 调用时文件通过 base64 传入
  let buffer
  if (fileContent) {
    buffer = Buffer.from(fileContent, 'base64')
  } else {
    throw err('INVALID_PARAMS', '缺少文件内容')
  }

  const uploadResult = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer,
  })

  let previewUrl = uploadResult.fileID
  try {
    const tmpResult = await cloud.getTempFileURL({ fileList: [uploadResult.fileID] })
    previewUrl = tmpResult.fileList[0].tempFileURL || uploadResult.fileID
  } catch (e) {
    logger.warn('getTempFileURL failed', { fileID: uploadResult.fileID, msg: e.message })
  }

  return handleSuccess({
    fileID: uploadResult.fileID,
    url: uploadResult.fileID,
    previewUrl,
  })
}

module.exports = { uploadFile }
