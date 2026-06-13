# Web Admin 部署指南

## 项目概述

这是一个基于 Vue 3 + Vite + Cloudbase 的管理后台项目。

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 生产构建

```bash
# 构建前端
npm run build

# 预览构建结果
npm run preview

# 本地启动服务器
npm start
```

## Docker 部署

### 本地构建 Docker 镜像

```bash
# 构建镜像
docker build -t web-admin .

# 运行容器
docker run -p 80:80 --name web-admin-container \
  -e CLOUDBASE_ENV=your_env_id \
  -e CLOUDBASE_SECRET_ID=your_secret_id \
  -e CLOUDBASE_SECRET_KEY=your_secret_key \
  web-admin
```

### Docker 多阶段构建说明

- 使用多阶段构建可以显著减小最终镜像大小：
- 第一阶段：构建阶段，包含所有依赖并编译
- 第二阶段：生产阶段，只包含运行时必要的依赖和构建产物

## Cloudbase 部署

### 前置条件

1. 安装 Cloudbase CLI:
```bash
npm install -g @cloudbase/cli
```

2. 登录 Cloudbase:
```bash
tcb login
```

### 使用 Cloudbase Framework 部署

1. 确保已配置 `cloudbaserc.json`（已完成）
2. 在 Cloudbase 控制台配置环境变量：
   - `CLOUDBASE_SECRET_ID`
   - `CLOUDBASE_SECRET_KEY`

3. 部署命令:
```bash
# 首次部署或更新
tcb framework deploy
```

## 环境变量配置

必须配置的环境变量：

| 变量名 | 描述 | 示例值 |
|--------|------|--------|
| PORT | 服务端口 | 80 |
| CLOUDBASE_ENV | 云开发环境 ID | cloudbase-d7getcjqy33b13475 |
| CLOUDBASE_SECRET_ID | 云开发 Secret ID | - |
| CLOUDBASE_SECRET_KEY | 云开发 Secret Key | - |
| NODE_ENV | 运行环境 | production |

## 构建优化说明

### Vite 配置优化

- 代码分包:
  - vendor-vue: Vue 相关库
  - vendor-element: Element Plus
  - vendor-chart: ECharts 图表库
  - vendor-utils: 工具库 (axios, dayjs)

- 生产环境自动移除 console 和 debugger
- 压缩构建产物，提升加载速度

### 安全优化

- Content-Security-Policy 安全策略
- XSS 防护
- MIME 类型保护
- 点击劫持防护
- 使用非 root 用户运行 Docker 容器

## 健康检查

容器健康检查

- 健康检查路径: `/health`
- 响应示例:
```json
{
  "status": "ok",
  "timestamp": 162222222222,
  "version": "1.0.0"
}
```

## 部署注意事项

1. **安全性:
   - 不要在代码仓库中提交包含真实的密钥！
   - 使用环境变量管理敏感信息
   - 使用 .gitignore 忽略 .env 等敏感文件

2. **性能优化**:
   - 使用 CDN 加速静态资源访问
   - 配置 gzip 压缩
   - 使用长期缓存策略

3. **监控与日志**:
   - 利用 Cloudbase 提供的监控面板
   - 定期查看访问日志
   - 设置告警通知

## 故障排查

### 常见问题

1. **构建失败**
   - 检查 Node 版本 (>= 16)
   - 清理 node_modules 重新安装

2. **云函数调用失败**
   - 检查环境变量配置
   - 检查网络连接
   - 查看 Cloudbase 日志

3. **容器启动失败**
   - 检查容器端口是否被占用
   - 检查环境变量是否正确
