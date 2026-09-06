# 词力战士（Word Warrior）微信云托管后端
# 构建上下文 = 仓库根目录；后端源码位于 server/ 子目录

# Node.js 20 LTS（Alpine）：自带 npm@10，正确消费 lockfileVersion 3，兼容 mysql2@3/sequelize@6
FROM node:20-alpine

# 工作目录
WORKDIR /app

# 拷贝包管理文件（含 package-lock.json）
COPY server/package*.json /app/

# 国内 npm 镜像源
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/

# 依据 lock 文件精确安装（构建可复现）
RUN npm ci

# 拷贝 server/ 下全部源码（根目录 .dockerignore 已排除 node_modules）
COPY server/ /app

# 启动
CMD ["npm", "start"]