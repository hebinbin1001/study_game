# 二开推荐阅读[如何提高项目构建效率](https://developers.weixin.qq.com/miniprogram/dev/wxcloudrun/src/scene/build/speed.html)
# 使用 Node.js 20 LTS（Alpine）官方基础镜像：
#   - 自带 npm@10，可正确消费 npm install 生成的 lockfileVersion 3 锁文件；
#   - 满足 package.json engines >=12，且与 mysql2@3.x / sequelize@6 兼容。
FROM node:20-alpine

# 容器默认时区为 UTC，如需使用上海时间请启用以下时区设置命令
# RUN apk add tzdata && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && echo Asia/Shanghai > /etc/timezone

# 指定工作目录
WORKDIR /app

# 拷贝包管理文件（含 package-lock.json）
COPY package*.json /app/

# npm 源，选用国内镜像源以提高下载速度
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/

# 使用 npm ci：依据 package-lock.json 精确安装（构建可复现、且可校验锁一致性）
RUN npm ci

# 将当前目录（dockerfile 所在目录）下所有文件都拷贝到工作目录下（.dockerignore 中文件除外）
COPY . /app

# 执行启动命令
CMD ["npm", "start"]