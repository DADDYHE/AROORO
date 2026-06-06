# 多阶段构建 - 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制 package 相关文件，利用缓存
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建前端应用
RUN npm run build

# 多阶段构建 - 生产阶段
FROM node:18-alpine AS production

WORKDIR /app

# 复制 package 文件，只安装生产依赖
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# 复制构建产物和服务器文件
COPY --from=builder /app/dist ./dist
COPY server.js ./

# 设置安全相关的环境变量
ENV NODE_ENV=production
ENV PORT=80

# 非 root 用户运行
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 80) + '/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

CMD ["node", "server.js"]
